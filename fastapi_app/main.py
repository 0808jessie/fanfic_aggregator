from datetime import datetime, timedelta
import hashlib
import json
from time import perf_counter
from typing import Any, Callable

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from config import settings
from database import Fanfic, SessionLocal
from models import CustomCpMapping, ScrapedFanfic, SearchQuery, SearchResponse
from constants.cp_tags import CP_CACHE_ALIASES, CP_TAG_MAP, build_custom_cp_map
from relevance import rank_results
from scrapers.index import SCRAPERS, parallel_search_platforms

app = FastAPI(title="Fanfic Atlas Search API", version="1.1.12")
app.add_middleware(
    CORSMiddleware,
    # The packaged desktop WebView is served from tauri://localhost, while the
    # bundled Python process intentionally listens only on loopback port 8000.
    allow_origins=[
        "tauri://localhost",
        "http://tauri.localhost",
        "https://tauri.localhost",
        "http://localhost:3000",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
CACHE_TTL = timedelta(seconds=settings.cache_ttl_seconds)


def normalize_search_language(value: object) -> str:
    """Accept browser filter aliases without allowing malformed values to break search."""
    if not isinstance(value, str):
        return "all"
    normalized = value.strip().lower().replace("_", "-")
    aliases = {
        "": "all", "all": "all", "zh": "zh", "zh-hant": "zh", "zh-hans": "zh",
        "繁體": "zh", "繁中": "zh", "简体": "zh", "簡體": "zh", "en": "en", "ja": "ja",
    }
    return aliases.get(normalized, "all")

# 每個快取 entry 的最後一欄是本次結果的可信度 TTL（秒）。舊的五欄 entry
# 仍可被讀取，並以一般關鍵字 TTL 處理，讓開發中的記憶體內容安全降級。
_MEMORY_CACHE: dict[str, tuple[Any, ...]] = {}
HIGH_CONFIDENCE_CACHE_TTL = timedelta(hours=2)
NORMAL_CONFIDENCE_CACHE_TTL = timedelta(minutes=30)
LOW_CONFIDENCE_CACHE_TTL = timedelta(minutes=5)


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


def normalize_custom_cp_mappings(raw_payload: Any) -> list[CustomCpMapping]:
    """Parse browser-local CP mappings without allowing malformed JSON to fail search."""
    try:
        candidate = json.loads(raw_payload) if isinstance(raw_payload, str) else raw_payload
        if isinstance(candidate, dict):
            candidate = candidate.get("mappings", list(candidate.values()))
        if not isinstance(candidate, list):
            return []
        mappings = []
        for item in candidate:
            try:
                mappings.append(CustomCpMapping.model_validate(item))
            except Exception:
                continue
        return mappings
    except Exception as error:
        print(f"[SearchAPI] Ignoring invalid custom CP payload: {error}")
        return []


def custom_cp_mapping_fingerprint(mappings: list[object]) -> str:
    """Keep cache entries isolated between distinct browser-local CP vocabularies."""
    normalized = [
        {
            "alias": getattr(mapping, "alias", ""),
            "ao3Query": getattr(mapping, "ao3Query", ""),
            "localQuery": getattr(mapping, "localQuery", ""),
        }
        for mapping in mappings
    ]
    encoded = json.dumps(normalized, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:12]


def clear_live_only_cp_memory_cache(keyword: str) -> list[str]:
    """Remove every in-memory cache key belonging to a live-only CP alias group."""
    aliases = CP_CACHE_ALIASES.get(keyword, frozenset((keyword,)))
    matching_keys = [
        cache_key
        for cache_key in _MEMORY_CACHE
        if any(cache_key.startswith(f"{alias}:") for alias in aliases)
    ]
    for cache_key in matching_keys:
        _MEMORY_CACHE.pop(cache_key, None)
    if matching_keys:
        print(f"[SearchAPI] Cleared CP memory cache keys: {matching_keys}")
    return matching_keys


def cache_ttl_for(keyword: str, result_count: int) -> timedelta:
    """Select cache lifetime from explicit CP confidence and verified result count."""
    if keyword in CP_TAG_MAP:
        return HIGH_CONFIDENCE_CACHE_TTL
    if result_count < 3:
        return LOW_CONFIDENCE_CACHE_TTL
    return NORMAL_CONFIDENCE_CACHE_TTL


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
            "cxc 創利市集": ("cxc.today",),
            "同人誌中心": ("doujin.com.tw",),
            "在水裡寫字": ("slashtw.space",),
            "penana": ("penana.com",),
            "pixiv": ("pixiv.net",),
        }
        hosts = allowed_hosts.get(platform.lower())
        if hosts and not any(host in normalized_url for host in hosts):
            return False
    return True


def save_fanfic_to_db(db: Session, fanfic: ScrapedFanfic) -> None:
    """Upsert only persistent metadata; source/warning/relationships are response-only fields."""
    if not is_real_platform_url(fanfic.url, fanfic.platform):
        print(f"[Database] Skipping untrusted URL: {fanfic.url}")
        return
    try:
        record = db.query(Fanfic).filter(Fanfic.url == fanfic.url).first()
        values = fanfic.model_dump(exclude={"id", "source", "warning", "coverUrl", "wordCount", "updatedAt", "updated_at", "relationships", "characters", "isComplete", "relevanceScore"})
        if isinstance(values.get("tags"), list):
            values["tags"] = ", ".join(values["tags"])
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
        item = ScrapedFanfic(
            id=f"{record.platform.lower()}:{record.url}",
            title=record.title,
            author=record.author,
            platform=record.platform,
            url=record.url,
            tags=record.tags or "",
            summary=record.summary or "",
            language=getattr(record, "language", "unknown") or "unknown",
            rating=getattr(record, "rating", None),
            scraped_at=record.scraped_at,
            keyword=record.keyword,
        )
        item.source = source_label
        if source_label == "fallback-cache":
            item.warning = "外部平台即時連線受阻或逾時，已自動載入本機歷史快取作品。"
        results.append(item)
    return results


@app.get("/fastapi-status")
def fastapi_status() -> dict[str, str]:
    return {"status": "ok", "service": "fastapi-search", "version": "1.1.12"}


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "fastapi-search", "version": "1.1.12"}


@app.api_route("/api/health", methods=["GET", "HEAD"])
def api_health_check():
    return {"status": "ok", "service": "fastapi-search", "version": "1.1.12"}


@app.get("/")
def read_root() -> dict[str, str]:
    return {"status": "ok", "service":"fastapi-search", "version": "1.1.12"}


@app.get("/platforms")
def list_platforms() -> list[dict[str, str]]:
    return [
        {"id": "ao3", "label": "AO3", "status": "ready"},
        {"id": "cxc", "label": "CxC 創利市集", "status": "best-effort"},
        {"id": "doujin", "label": "同人誌中心", "status": "best-effort"},
        {"id": "waterwriter", "label": "在水裡寫字", "status": "best-effort"},
        {"id": "penana", "label": "Penana", "status": "best-effort"},
        {"id": "pixiv", "label": "Pixiv", "status": "best-effort"},
    ]


@app.post("/search", response_model=SearchResponse)
def search_fanfics(query: SearchQuery, db: Session = Depends(get_db)) -> SearchResponse:
    keyword = query.keyword.strip()
    mode = query.mode
    if not keyword:
        raise HTTPException(status_code=422, detail="keyword cannot be empty")

    requested_platforms = query.platforms or ([query.platform] if query.platform else None)
    platforms = canonical_platforms(requested_platforms)
    if not platforms:
        raise HTTPException(status_code=400, detail="No supported platform was selected")

    request_started_at = perf_counter()
    print(f"[Search Start] mode={mode!r} keyword={keyword!r} requestedPlatforms={query.platforms!r}")
    try:
        requested_page = query.page
        raw_custom_cp_payload = query.customCpMappings
        if not raw_custom_cp_payload and query.customCpMap is not None:
            raw_custom_cp_payload = query.customCpMap
        custom_cp_mappings = normalize_custom_cp_mappings(raw_custom_cp_payload)
        custom_cp_map = build_custom_cp_map(custom_cp_mappings)
        # Preserve the established keyword-mode cache key so existing CP cache
        # invalidation still works. Author searches receive a separate prefix to
        # prevent a creator query from sharing keyword/CP result entries.
        cache_prefix = "author:" if mode == "author" else ""
        base_cache_key = f"{cache_prefix}{keyword}:{'-'.join(sorted(platforms))}:page={requested_page}"
        cache_key = (
            f"{cache_prefix}{keyword}:{'-'.join(sorted(platforms))}:cp={custom_cp_mapping_fingerprint(custom_cp_mappings)}:page={requested_page}"
            if custom_cp_map
            else base_cache_key
        )
        # 強制更新只影響此次請求：略過既有快取、重新啟動 Adapter，並用成功結果覆寫快取。
        bypass_persistent_cache = query.forceRefresh
        if bypass_persistent_cache:
            clear_live_only_cp_memory_cache(keyword)

        memory_entry = None if bypass_persistent_cache else _MEMORY_CACHE.get(cache_key)
        if memory_entry:
            cached_time, cached_items, total_works, total_pages, loaded_through_page = memory_entry[:5]
            entry_ttl = memory_entry[5] if len(memory_entry) > 5 else NORMAL_CONFIDENCE_CACHE_TTL
            cached_platform_statuses = memory_entry[6] if len(memory_entry) > 6 else []
            if datetime.utcnow() - cached_time < entry_ttl and cached_items:
                print(f"[SearchAPI] Memory cache hit for '{cache_key}'")
                for item in cached_items:
                    item.source = "cache"
                    item.warning = None
                safe_total_pages = max(total_pages, (total_works + 19) // 20, 1 if total_works else 0)
                has_more = loaded_through_page < safe_total_pages
                return SearchResponse(
                    items=rank_results(cached_items, keyword),
                    source="cache",
                    totalWorks=total_works,
                    totalPages=safe_total_pages,
                    page=requested_page,
                    loadedThroughPage=loaded_through_page,
                    nextPage=loaded_through_page + 1 if has_more else None,
                    hasMore=has_more,
                    platformStatuses=cached_platform_statuses,
                    fromCache=True,
                )
            if cache_key in _MEMORY_CACHE:
                del _MEMORY_CACHE[cache_key]

        # 2. 透過 Adapter registry 平行查詢所有已選平台。Keyword mode
        # deliberately preserves the long-standing adapter call shape so custom
        # adapters and legacy tests remain compatible.
        aggregate_kwargs: dict[str, Any] = {}
        if query.forceRefresh:
            aggregate_kwargs["force_refresh"] = True
        if custom_cp_map:
            aggregate_kwargs["custom_cp_map"] = custom_cp_map
        if mode == "author":
            aggregate_kwargs["mode"] = mode
        aggregate = parallel_search_platforms(platforms, keyword, requested_page, **aggregate_kwargs)
        print(
            f"[Search Aggregate Done in ms] {round((perf_counter() - request_started_at) * 1000)} "
            f"platforms={platforms!r} verifiedItems={len(aggregate.get('items', []))}"
        )
        fresh_results = rank_results([
            result for result in aggregate["items"]
            if is_real_platform_url(result.url, result.platform)
        ], keyword)
        total_works = int(aggregate.get("total_works", 0) or 0)
        total_pages = int(aggregate.get("total_pages", 0) or 0)
        platform_statuses = aggregate.get("platform_statuses", [])
        any_success = bool(aggregate.get("any_success"))
        platform_warnings = [str(message) for message in aggregate.get("warnings", []) if message]
        # A best-effort platform being blocked must not interrupt results from an
        # available source. Diagnostics remain in adapter/server logs and are only
        # exposed when no verified work can be shown.
        combined_warning = None if any_success else ("；".join(platform_warnings) if platform_warnings else None)

        for result in fresh_results:
            # Preserve a platform-provided source identifier (for example,
            # ``pixiv``) so the frontend can align source and platform filters.
            if not result.source or result.source == "live":
                result.source = "live"
            result.warning = combined_warning

        # 3. 若即時抓取成功且有真實結果，寫入資料庫與記憶體快取。
        # forceRefresh 只略過舊快取讀取；新結果仍需覆寫快取。
        if any_success and fresh_results:
            deduplicated: dict[str, ScrapedFanfic] = {}
            for result in fresh_results:
                result.keyword = keyword
                deduplicated[result.url] = result
                save_fanfic_to_db(db, result)
            final_items = rank_results(list(deduplicated.values()), keyword)
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
                cache_ttl_for(keyword, len(final_items)),
                platform_statuses,
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
                platformStatuses=platform_statuses,
                fromCache=bool(platform_statuses) and all(status.fromCache for status in platform_statuses),
            )

        # A source that completed normally but found no public work is not a
        # connection failure. Preserve its platform-level empty status without
        # creating a stale-cache fallback or a global failed-search envelope.
        if any_success and not fresh_results:
            return SearchResponse(
                items=[],
                source="live",
                warning=None,
                totalWorks=0,
                totalPages=max(1, total_pages),
                page=requested_page,
                loadedThroughPage=requested_page,
                nextPage=None,
                hasMore=False,
                platformStatuses=platform_statuses,
            )

        # 4. 若即時抓取為 0 筆或失敗，絕對不寫入快取，且對 CP 映射關鍵字不使用 stale SQLite cache 避免污染
        stale_cached = None
        if mode == "keyword" and not query.forceRefresh and keyword not in CP_TAG_MAP and not custom_cp_map:
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
                nextPage=(min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) + 1)
                if min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) < stale_total_pages
                else None,
                hasMore=min(requested_page + (1 if requested_page == 1 else 0), stale_total_pages) < stale_total_pages,
                platformStatuses=platform_statuses,
            )

        # 5. 回傳結構化未命中/限流狀態
        default_warning = (
            "AO3 伺服器目前流量較高或觸發防護（HTTP 403/429/525），伺服器稍微休息中，請於 10 秒後再搜尋。"
        )
        warning = combined_warning or default_warning
        rate_limit_markers = ("403", "429", "525", "timeout", "逾時", "challenge", "防護")
        is_rate_limited = any(marker.casefold() in warning.casefold() for marker in rate_limit_markers)
        print(f"[SearchAPI] No verified results for '{keyword}': {warning}")
        return SearchResponse(
            items=[],
            source="none",
            warning=warning,
            success=False,
            isRateLimited=is_rate_limited,
            page=requested_page,
            platformStatuses=platform_statuses,
        )

    except Exception as error:
        print(f"[SearchAPI] Unexpected failure: {error}")
        return SearchResponse(
            source="none",
            warning="搜尋服務發生未預期錯誤，未回傳任何未驗證或佔位作品。",
            success=False,
            page=requested_page,
        )
