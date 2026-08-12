from datetime import datetime, timedelta
from typing import Callable

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import Fanfic, SessionLocal
from .models import ScrapedFanfic, SearchQuery, SearchResponse
from .scrapers.index import SCRAPERS, parallel_search_platforms

app = FastAPI(title="Fanfic Atlas Search API", version="0.1.3")
CACHE_TTL = timedelta(seconds=settings.cache_ttl_seconds)

# 30分鐘記憶體快取 (In-Memory Cache) 用以避免頻繁請求遭到 AO3 限流與 IP 封鎖
_MEMORY_CACHE: dict[str, tuple[datetime, list[ScrapedFanfic], int, int, int]] = {}
MEMORY_CACHE_TTL = timedelta(minutes=30)

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
        values = fanfic.model_dump(exclude={"id", "source", "warning", "wordCount", "updatedAt"})
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
        # 0. 先查以關鍵字、平台與頁碼隔離的 30 分鐘記憶體快取。
        requested_page = query.page
        cache_key = f"{keyword}:{'-'.join(sorted(platforms))}:page={requested_page}"
        memory_entry = _MEMORY_CACHE.get(cache_key)
        if memory_entry:
            cached_time, cached_items, total_works, total_pages, loaded_through_page = memory_entry
            if datetime.utcnow() - cached_time < MEMORY_CACHE_TTL:
                print(f"[SearchAPI] Memory cache hit for '{cache_key}'")
                for item in cached_items:
                    item.source = "cache"
                    item.warning = None
                safe_total_pages = max(total_pages, (total_works + 19) // 20, 1 if total_works else 0)
                has_more = loaded_through_page < safe_total_pages
                return SearchResponse(
                    items=sorted(cached_items, key=lambda item: item.scraped_at, reverse=True),
                    source="cache",
                    totalWorks=total_works,
                    totalPages=safe_total_pages,
                    page=requested_page,
                    loadedThroughPage=loaded_through_page,
                    nextPage=loaded_through_page + 1 if has_more else None,
                    hasMore=has_more,
                )
            del _MEMORY_CACHE[cache_key]

        # 1. SQLite cache 只在首次 page=1 使用，避免舊資料被誤當成特定頁面。
        if requested_page == 1 and "ao3" not in platforms:
            cached = get_cached_results(db, keyword, platforms, source_label="cache")
            if cached:
                print(f"[SearchAPI] SQLite cache hit for '{keyword}'")
                total_works = len(cached)
                total_pages = max(1, (total_works + 19) // 20)
                loaded_through_page = min(2, total_pages)
                _MEMORY_CACHE[cache_key] = (
                    datetime.utcnow(), cached, total_works, total_pages, loaded_through_page
                )
                has_more = loaded_through_page < total_pages
                return SearchResponse(
                    items=sorted(cached, key=lambda item: item.scraped_at, reverse=True),
                    source="cache",
                    totalWorks=total_works,
                    totalPages=total_pages,
                    page=requested_page,
                    loadedThroughPage=loaded_through_page,
                    nextPage=loaded_through_page + 1 if has_more else None,
                    hasMore=has_more,
                )

        # 2. 透過 Adapter registry 平行查詢所有已選平台；單一平台失敗不阻塞其他結果。
        aggregate = parallel_search_platforms(platforms, keyword, requested_page)
        fresh_results = [
            result for result in aggregate["items"]
            if is_real_platform_url(result.url, result.platform)
        ]
        total_works = int(aggregate.get("total_works", 0) or 0)
        total_pages = int(aggregate.get("total_pages", 0) or 0)
        any_success = bool(aggregate.get("any_success")) and bool(fresh_results)
        platform_warnings = [str(message) for message in aggregate.get("warnings", []) if message]
        combined_warning = "；".join(platform_warnings) if platform_warnings else None

        for result in fresh_results:
            result.source = "live"
            result.warning = combined_warning

        # 3. 若至少一個平台即時抓取成功，保存並回傳合併結果。
        if any_success and fresh_results:
            deduplicated: dict[str, ScrapedFanfic] = {}
            for result in fresh_results:
                result.keyword = keyword
                deduplicated[result.url] = result
                save_fanfic_to_db(db, result)
            final_items = sorted(deduplicated.values(), key=lambda item: item.scraped_at, reverse=True)
            total_works = max(total_works, len(final_items))
            total_pages = max(total_pages, (total_works + 19) // 20)
            loaded_through_page = min(
                requested_page + (1 if requested_page == 1 else 0),
                total_pages,
            )
            _MEMORY_CACHE[cache_key] = (
                datetime.utcnow(),
                final_items,
                total_works,
                total_pages,
                loaded_through_page,
            )
            has_more = loaded_through_page < total_pages
            return SearchResponse(
                items=final_items,
                source="live",
                warning=combined_warning,
                totalWorks=total_works,
                totalPages=total_pages,
                page=requested_page,
                loadedThroughPage=loaded_through_page,
                nextPage=loaded_through_page + 1 if has_more else None,
                hasMore=has_more,
            )
        
        # 4. Fallback to stale cache if external failed
        stale_cached = get_cached_results(db, keyword, platforms, ignore_ttl=True, source_label="fallback-cache")
        if stale_cached:
            print(f"[SearchAPI] External failed, falling back to stale cache for '{keyword}'")
            stale_total_works = len(stale_cached)
            stale_total_pages = max(1, (stale_total_works + 19) // 20)
            return SearchResponse(
                items=sorted(stale_cached, key=lambda item: item.scraped_at, reverse=True),
                source="fallback-cache",
                warning="外部平台即時連線受阻或逾時，已自動載入本機歷史快取作品。",
                totalWorks=stale_total_works,
                totalPages=stale_total_pages,
                page=requested_page,
                loadedThroughPage=min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages),
                nextPage=(min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) + 1)
                if min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) < stale_total_pages
                else None,
                hasMore=min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) < stale_total_pages,
            )

        # 5. Rate-limit or block handling: return structured JSON indicating rate limit state
        warning = (
            "AO3 伺服器目前流量較高或觸發防護（HTTP 403/429/525），伺服器稍微休息中，請於 10 秒後再搜尋。"
        )
        print(f"[SearchAPI] Rate limited / blocked for '{keyword}': {warning}")
        return SearchResponse(
            items=[],
            source="none",
            warning=warning,
            success=False,
            isRateLimited=True,
            page=requested_page,
        )

    except Exception as error:
        print(f"[SearchAPI] Unexpected failure: {error}")
        return SearchResponse(
            source="none",
            warning="搜尋服務發生未預期錯誤，未回傳任何未驗證或佔位作品。",
            success=False,
            page=requested_page,
        )
