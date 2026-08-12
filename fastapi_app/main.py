from datetime import datetime, timedelta
from typing import Callable

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import Fanfic, SessionLocal
from .models import ScrapedFanfic, SearchQuery, SearchResponse
from .scrapers.ao3_scraper import AO3Scraper
from .scrapers.lofter_scraper import LofterScraper

app = FastAPI(title="Fanfic Atlas Search API", version="0.1.3")
CACHE_TTL = timedelta(seconds=settings.cache_ttl_seconds)

# 1小時記憶體快取 (Memory Cache) 用以避免頻繁爬取被平台限流或封鎖
_MEMORY_CACHE: dict[str, tuple[datetime, list[ScrapedFanfic]]] = {}
MEMORY_CACHE_TTL = timedelta(hours=1)

SCRAPERS: dict[str, Callable[[], object]] = {
    "ao3": AO3Scraper,
    "lofter": LofterScraper,
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def canonical_platforms(platforms: list[str] | None) -> list[str]:
    requested = platforms or list(SCRAPERS)
    normalized = []
    for platform in requested:
        key = platform.strip().lower()
        if key in SCRAPERS and key not in normalized:
            normalized.append(key)
    return normalized


def is_real_platform_url(url: str, platform: str | None = None) -> bool:
    """Reject placeholder, local, and unrelated URLs before they reach the UI or cache."""
    normalized_url = url.strip().lower()
    if not normalized_url.startswith(("https://", "http://")):
        return False
    if any(blocked in normalized_url for blocked in ("example.com", "example.org", "localhost", "127.0.0.1")):
        return False
    if platform:
        allowed_hosts = {
            "ao3": ("archiveofourown.org",),
            "lofter": ("lofter.com",),
        }
        hosts = allowed_hosts.get(platform.lower())
        if hosts and not any(host in normalized_url for host in hosts):
            return False
    return True


def save_fanfic_to_db(db: Session, fanfic: ScrapedFanfic) -> None:
    """Upsert only persistent metadata; source/warning are response-only fields."""
    if not is_real_platform_url(fanfic.url, fanfic.platform):
        print(f"[Database] Skipping untrusted URL: {fanfic.url}")
        return
    try:
        record = db.query(Fanfic).filter(Fanfic.url == fanfic.url).first()
        values = fanfic.model_dump(exclude={"source", "warning"})
        if record is None:
            db.add(Fanfic(**values))
        else:
            for field, value in values.items():
                setattr(record, field, value)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[Database] Error saving fanfic: {e}")


def get_cached_results(db: Session, keyword: str, platforms: list[str], ignore_ttl: bool = False, source_label: str = "cache") -> list[ScrapedFanfic] | None:
    """Fetch results from SQLite with source labeling."""
    cutoff = datetime.utcnow() - CACHE_TTL
    query = db.query(Fanfic).filter(Fanfic.keyword == keyword)
    if not ignore_ttl:
        query = query.filter(Fanfic.scraped_at >= cutoff)
    cached_records = query.all()
    platform_set = {p.lower() for p in platforms}
    filtered = [
        r for r in cached_records
        if r.platform.lower() in platform_set and is_real_platform_url(r.url, r.platform)
    ]
    if not filtered:
        return None
    unique_records = {record.url: record for record in filtered}
    results = []
    for record in unique_records.values():
        item = ScrapedFanfic.model_validate(record)
        item.source = source_label
        if source_label == "fallback-cache":
            item.warning = "外部平台即時連線受阻或逾時，已自動載入本機歷史快取作品。"
        results.append(item)
    return results


@app.get("/fastapi-status")
def fastapi_status() -> dict[str, str]:
    return {"status": "ok", "service": "fastapi-search", "version": "0.1.2"}


@app.get("/platforms")
def list_platforms() -> list[dict[str, str]]:
    return [
        {"id": "ao3", "label": "AO3", "status": "ready"},
        {"id": "lofter", "label": "Lofter", "status": "best-effort"},
    ]


@app.post("/search", response_model=SearchResponse)
def search_fanfics(query: SearchQuery, db: Session = Depends(get_db)) -> SearchResponse:
    keyword = query.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=422, detail="keyword cannot be empty")

    platforms = canonical_platforms(query.platforms)
    if not platforms:
        raise HTTPException(status_code=400, detail="No supported platform was selected")

    try:
        # 0. Try in-memory 1-hour cache first for speed and anti-rate-limiting
        cache_key = f"{keyword}:{'-'.join(sorted(platforms))}"
        if cache_key in _MEMORY_CACHE:
            cached_time, cached_items = _MEMORY_CACHE[cache_key]
            if datetime.utcnow() - cached_time < MEMORY_CACHE_TTL:
                print(f"[SearchAPI] Memory cache hit for '{cache_key}'")
                for item in cached_items:
                    item.source = "cache"
                    item.warning = None
                return SearchResponse(
                    items=sorted(cached_items, key=lambda item: item.scraped_at, reverse=True),
                    source="cache",
                )
            else:
                del _MEMORY_CACHE[cache_key]

        # 1. Try DB/SQLite cache hit
        cached = get_cached_results(db, keyword, platforms, source_label="cache")
        if cached:
            print(f"[SearchAPI] SQLite cache hit for '{keyword}'")
            _MEMORY_CACHE[cache_key] = (datetime.utcnow(), cached)
            return SearchResponse(
                items=sorted(cached, key=lambda item: item.scraped_at, reverse=True),
                source="cache",
            )

        # 2. Try fresh scrape from external platforms
        fresh_results: list[ScrapedFanfic] = []
        any_success = False
        for platform in platforms:
            adapter = SCRAPERS[platform]()
            try:
                print(f"[SearchAPI] Scraping '{platform}' for '{keyword}'")
                platform_results = adapter.scrape(keyword)
                if platform_results:
                    trusted_results = [
                        r for r in platform_results
                        if is_real_platform_url(r.url, r.platform)
                    ]
                    if trusted_results:
                        any_success = True
                    for r in trusted_results:
                        r.source = "live"
                        r.warning = None
                        fresh_results.append(r)
            except Exception as error:
                print(f"[SearchAPI] Adapter '{platform}' crashed: {error}")

        # 3. If live scrape succeeded, save and return
        if any_success and fresh_results:
            deduplicated: dict[str, ScrapedFanfic] = {}
            for result in fresh_results:
                result.keyword = keyword
                deduplicated[result.url] = result
                save_fanfic_to_db(db, result)
            final_items = list(deduplicated.values())
            _MEMORY_CACHE[cache_key] = (datetime.utcnow(), final_items)
            return SearchResponse(
                items=sorted(final_items, key=lambda item: item.scraped_at, reverse=True),
                source="live",
            )
        
        # 4. Fallback to stale cache if external failed
        stale_cached = get_cached_results(db, keyword, platforms, ignore_ttl=True, source_label="fallback-cache")
        if stale_cached:
            print(f"[SearchAPI] External failed, falling back to stale cache for '{keyword}'")
            return SearchResponse(
                items=sorted(stale_cached, key=lambda item: item.scraped_at, reverse=True),
                source="fallback-cache",
                warning="外部平台即時連線受阻或逾時，已自動載入本機歷史快取作品。",
            )

        # 5. No fake data / no example domain: return an explicit machine-readable status.
        warning = (
            f"未從 {', '.join(platforms).upper()} 取得可驗證作品。"
            "外部平台可能回傳 HTTP 403/404/429/525、觸發反爬防護或發生網路逾時；"
            "本次沒有使用任何佔位連結。"
        )
        print(f"[SearchAPI] Discovery halted for '{keyword}': {warning}")
        return SearchResponse(source="none", warning=warning)

    except Exception as error:
        print(f"[SearchAPI] Unexpected failure: {error}")
        return SearchResponse(
            source="none",
            warning="搜尋服務發生未預期錯誤，未回傳任何未驗證或佔位作品。",
        )
