import asyncio
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Lock
from time import monotonic, perf_counter
from typing import Any, Callable

try:
    from constants.cp_tags import get_keyword_for_platform
    from models import PlatformStatus, ScrapedFanfic
    from scrapers.ao3_scraper import AO3Scraper
    from scrapers.cxc_scraper import CxCScraper
    from scrapers.doujin_scraper import DoujinScraper
    from scrapers.lofter_scraper import LofterScraper
    from scrapers.penana_scraper import PenanaScraper
    from scrapers.waterwriter_scraper import WaterWriterScraper
except ModuleNotFoundError:  # Supports ``fastapi_app.*`` package-style imports in tests.
    import sys
    from pathlib import Path

    app_root = str(Path(__file__).resolve().parents[1])
    if app_root not in sys.path:
        sys.path.insert(0, app_root)

    from constants.cp_tags import get_keyword_for_platform
    from models import PlatformStatus, ScrapedFanfic
    from scrapers.ao3_scraper import AO3Scraper
    from scrapers.cxc_scraper import CxCScraper
    from scrapers.doujin_scraper import DoujinScraper
    from scrapers.lofter_scraper import LofterScraper
    from scrapers.penana_scraper import PenanaScraper
    from scrapers.waterwriter_scraper import WaterWriterScraper


SCRAPERS: dict[str, Callable[[], object]] = {
    "ao3": AO3Scraper,
    "cxc": CxCScraper,
    "doujin": DoujinScraper,
    "waterwriter": WaterWriterScraper,
    "penana": PenanaScraper,
}

PLATFORM_LABELS = {
    "ao3": "AO3",
    "cxc": "CxC 創利市集",
    "doujin": "同人誌中心",
    "waterwriter": "在水裡寫字",
    "penana": "Penana",
}
LOCAL_CP_PLATFORM_IDS = frozenset(("doujin", "waterwriter"))
# Live search is HTTP-only. End each source task promptly so slow upstreams
# return their own state instead of holding the full cross-platform response.
ADAPTER_TIMEOUT_SECONDS = 6.5
# AO3 is a geographically remote public archive. It receives a slightly longer
# source-only window without delaying the remaining four adapters.
PLATFORM_TIMEOUT_SECONDS: dict[str, float] = {"ao3": 10.0}
SOURCE_CACHE_TTL_SECONDS = 600.0
_SOURCE_CACHE: dict[tuple[str, str, int], tuple[float, list[ScrapedFanfic], int, int, str | None]] = {}
_SOURCE_CACHE_LOCK = Lock()
# A fixed worker pool lets each sync-Playwright worker keep its thread-local
# browser alive between searches. The public response remains bounded by the
# per-request wait below; long upstream jobs never block response finalization.
def translated_query_for_platform(
    platform_key: str,
    keyword: str,
    custom_cp_map: dict[str, Any] | None = None,
    mode: str = "keyword",
) -> str:
    """Expose a request's active CP translation without altering free-text input."""
    if mode == "author":
        return keyword.strip()
    if platform_key == "ao3":
        return get_keyword_for_platform(keyword, "ao3", custom_cp_map)
    if platform_key == "cxc":
        return get_keyword_for_platform(keyword, "cxc", custom_cp_map)
    if platform_key in LOCAL_CP_PLATFORM_IDS:
        # Discuz and the Doujin search form interpret whitespace as an AND
        # query. Keep CP expansions for reference in the vocabulary manager,
        # but send the user's first literal term to the actual local source.
        return keyword.strip().split()[0] if keyword.strip().split() else keyword.strip()
    return keyword.strip()


def classify_platform_status(item_count: int, warning: str | None) -> str:
    """Classify observed source outcomes without fabricating availability data."""
    if item_count:
        return "success"
    if not warning:
        return "empty"

    diagnostic = warning.casefold()
    cooldown_markers = (
        "rate limit", "too frequent", "cooldown", "flood control", "20 秒", "20秒", "請等待", "429",
    )
    blocked_markers = (
        "request blocked", "blocked", "cloudflare", "challenge", "captcha", "verification", "驗證", "403", "525", "防護",
    )
    if any(marker in diagnostic for marker in cooldown_markers):
        return "cooldown"
    if any(marker in diagnostic for marker in blocked_markers):
        return "blocked"
    if "no verified public result" in diagnostic or "no tag results" in diagnostic:
        return "empty"
    return "error"


def make_platform_status(
    platform_key: str,
    keyword: str,
    item_count: int,
    warning: str | None,
    custom_cp_map: dict[str, Any] | None = None,
    mode: str = "keyword",
) -> PlatformStatus:
    return PlatformStatus(
        platformId=platform_key,
        label=PLATFORM_LABELS.get(platform_key, platform_key),
        status=classify_platform_status(item_count, warning),
        itemCount=item_count,
        warning=warning,
        translatedQuery=translated_query_for_platform(platform_key, keyword, custom_cp_map, mode),
    )


def _source_cache_key(
    platform_key: str,
    keyword: str,
    page: int,
    custom_cp_map: dict[str, Any] | None,
    mode: str,
) -> tuple[str, str, int]:
    """Key cache entries by the source's effective platform-specific query."""
    translated = translated_query_for_platform(platform_key, keyword, custom_cp_map, mode)
    return platform_key, f"{mode}:{translated}", page


def _matches_author_query(author: str, query: str) -> bool:
    """Keep author-mode records only when their verified creator field matches."""
    normalized_author = " ".join(author.casefold().split())
    terms = [term.casefold() for term in query.split() if term]
    return bool(normalized_author and terms and all(term in normalized_author for term in terms))


def _read_source_cache(cache_key: tuple[str, str, int]) -> tuple[list[ScrapedFanfic], int, int, str | None] | None:
    with _SOURCE_CACHE_LOCK:
        entry = _SOURCE_CACHE.get(cache_key)
        if entry is None:
            return None
        cached_at, items, total_works, total_pages, warning = entry
        if monotonic() - cached_at >= SOURCE_CACHE_TTL_SECONDS:
            _SOURCE_CACHE.pop(cache_key, None)
            return None
        return deepcopy(items), total_works, total_pages, warning


def _write_source_cache(
    cache_key: tuple[str, str, int],
    items: list[ScrapedFanfic],
    total_works: int,
    total_pages: int,
    warning: str | None,
) -> None:
    # Cache verified items only; transient empty/error pages stay retryable.
    if not items:
        return
    with _SOURCE_CACHE_LOCK:
        _SOURCE_CACHE[cache_key] = (monotonic(), deepcopy(items), total_works, total_pages, warning)


def search_single_platform(
    platform_key: str,
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
    custom_cp_map: dict[str, Any] | None = None,
    mode: str = "keyword",
) -> tuple[str, list[ScrapedFanfic], int, int, PlatformStatus]:
    """Execute one adapter safely and return a UI-ready status for that source."""
    started_at = perf_counter()
    adapter_cls = SCRAPERS.get(platform_key)
    if not adapter_cls:
        warning = f"Platform '{platform_key}' is not supported."
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map, mode)

    cache_key = _source_cache_key(platform_key, keyword, page, custom_cp_map, mode)
    if force_refresh:
        with _SOURCE_CACHE_LOCK:
            _SOURCE_CACHE.pop(cache_key, None)
    else:
        cached_payload = _read_source_cache(cache_key)
        if cached_payload is not None:
            items, total_works, total_pages, warning = cached_payload
            status_count = total_works if total_works > 0 else len(items)
            status = make_platform_status(platform_key, keyword, status_count, warning, custom_cp_map, mode)
            status.fromCache = True
            duration_ms = round((perf_counter() - started_at) * 1000)
            print(f"[{PLATFORM_LABELS.get(platform_key, platform_key)} Cache Hit in ms] {duration_ms}")
            return platform_key, items, total_works, total_pages, status

    adapter = adapter_cls()
    try:
        scrape_kwargs: dict[str, object] = {"page": page}
        if force_refresh:
            scrape_kwargs["force_refresh"] = True
        if custom_cp_map:
            scrape_kwargs["custom_cp_map"] = custom_cp_map
        if mode == "author":
            scrape_kwargs["mode"] = mode
        payload = adapter.scrape(keyword, **scrape_kwargs)
        items: list[ScrapedFanfic] = []
        total_works = 0
        total_pages = 1
        if isinstance(payload, dict):
            items = payload.get("items", [])
            total_works = int(payload.get("total_works", 0) or 0)
            total_pages = int(payload.get("total_pages", 1) or 1)
        elif isinstance(payload, list):
            items = payload
            # Legacy list-only adapters do not provide an official total. Keep
            # their verified cards, but never present the visible card count as
            # a complete source count.
            total_works = 0
            total_pages = 1

        if mode == "author":
            items = [item for item in items if _matches_author_query(item.author, keyword)]
            # General public listing pages cannot declare a creator-only total.
            total_works = 0
            total_pages = 1
        for item in items:
            if not item.id:
                item.id = f"{platform_key}:{item.url}"
            item.keyword = keyword
        warning = getattr(adapter, "last_warning", None)
        status_count = total_works if total_works > 0 else len(items)
        _write_source_cache(cache_key, items, total_works, total_pages, warning)
        duration_ms = round((perf_counter() - started_at) * 1000)
        print(f"[{PLATFORM_LABELS.get(platform_key, platform_key)} Done in ms] {duration_ms}")
        return platform_key, items, total_works, total_pages, make_platform_status(
            platform_key, keyword, status_count, warning, custom_cp_map, mode
        )
    except Exception as error:
        warning = f"Platform '{platform_key}' scrape failed: {error}"
        duration_ms = round((perf_counter() - started_at) * 1000)
        print(f"[AdapterIndex] {warning} ({duration_ms}ms)")
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map, mode)


async def parallel_search_platforms_async(
    platforms: list[str],
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
    custom_cp_map: dict[str, Any] | None = None,
    timeout_seconds: float = ADAPTER_TIMEOUT_SECONDS,
    mode: str = "keyword",
) -> dict[str, Any]:
    """Run each source in an independently timed asyncio task.

    The current public adapters retain synchronous parsers and browser fallbacks,
    so each adapter runs in its own request-scoped worker. ``asyncio.wait_for``
    applies the deadline to *each* source task from creation time, rather than
    waiting for a shared batch and marking every unfinished worker together.
    """
    results_map: dict[str, list[ScrapedFanfic]] = {}
    statuses_map: dict[str, PlatformStatus] = {}
    combined_total_works = 0
    max_total_pages = 1
    warnings: list[str] = []
    any_success = False

    # Each request owns its worker set. Every adapter already uses a one-shot
    # HTTP request (not a shared requests.Session), so no platform can exhaust
    # another platform's connection pool or queue a later single-source retry.
    executor = ThreadPoolExecutor(max_workers=max(1, len(platforms)), thread_name_prefix="fanfic-source")

    async def run_platform(platform_key: str) -> tuple[str, list[ScrapedFanfic], int, int, PlatformStatus]:
        loop = asyncio.get_running_loop()
        task = loop.run_in_executor(
            executor,
            search_single_platform,
            platform_key,
            keyword,
            page,
            force_refresh,
            custom_cp_map,
            mode,
        )
        try:
            platform_timeout = PLATFORM_TIMEOUT_SECONDS.get(platform_key, timeout_seconds)
            return await asyncio.wait_for(task, timeout=max(0.1, platform_timeout))
        except asyncio.TimeoutError:
            platform_timeout = PLATFORM_TIMEOUT_SECONDS.get(platform_key, timeout_seconds)
            warning = f"[{PLATFORM_LABELS.get(platform_key, platform_key)}] 連線逾時（超過 {platform_timeout:g} 秒）"
            print(f"[AdapterIndex] {warning}")
            return platform_key, [], 0, 1, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map, mode)
        except Exception as error:
            warning = f"[{PLATFORM_LABELS.get(platform_key, platform_key)}] scrape failed: {error}"
            print(f"[AdapterIndex] {warning}")
            return platform_key, [], 0, 1, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map, mode)

    try:
        source_payloads = await asyncio.gather(*(run_platform(platform) for platform in platforms))
        for platform_key, items, total_works, total_pages, status in source_payloads:
            statuses_map[platform_key] = status
            if status.warning:
                warnings.append(status.warning)
            if status.status in ("success", "empty"):
                any_success = True
            combined_total_works += total_works
            max_total_pages = max(max_total_pages, total_pages)
            if items:
                results_map[platform_key] = items

    finally:
        # Worker threads currently unwinding a third-party socket cannot be
        # force-killed safely. Request-scoped executors ensure they cannot delay
        # any later platform retry once this source state has been returned.
        executor.shutdown(wait=False, cancel_futures=True)

    all_items: list[ScrapedFanfic] = []
    for platform in platforms:
        all_items.extend(results_map.get(platform, []))

    return {
        "items": all_items,
        "any_success": any_success,
        # Do not promote a visible first-page card count to an all-site total.
        "total_works": combined_total_works,
        "total_pages": max_total_pages,
        "warnings": warnings,
        "platform_statuses": [statuses_map[platform] for platform in platforms if platform in statuses_map],
    }


def parallel_search_platforms(
    platforms: list[str],
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
    custom_cp_map: dict[str, Any] | None = None,
    timeout_seconds: float = ADAPTER_TIMEOUT_SECONDS,
    mode: str = "keyword",
) -> dict[str, Any]:
    """Synchronous compatibility wrapper for the FastAPI and test contracts."""
    return asyncio.run(
        parallel_search_platforms_async(
            platforms,
            keyword,
            page,
            force_refresh,
            custom_cp_map,
            timeout_seconds,
            mode,
        )
    )
