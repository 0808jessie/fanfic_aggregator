from concurrent.futures import Future, ThreadPoolExecutor, wait
from time import perf_counter
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
ADAPTER_TIMEOUT_SECONDS = 8.0


def translated_query_for_platform(
    platform_key: str,
    keyword: str,
    custom_cp_map: dict[str, Any] | None = None,
) -> str:
    """Expose a request's active CP translation without altering free-text input."""
    if platform_key == "ao3":
        return get_keyword_for_platform(keyword, "ao3", custom_cp_map)
    if platform_key == "cxc":
        return get_keyword_for_platform(keyword, "cxc", custom_cp_map)
    if platform_key in LOCAL_CP_PLATFORM_IDS:
        return get_keyword_for_platform(keyword, "local", custom_cp_map)
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
) -> PlatformStatus:
    return PlatformStatus(
        platformId=platform_key,
        label=PLATFORM_LABELS.get(platform_key, platform_key),
        status=classify_platform_status(item_count, warning),
        itemCount=item_count,
        warning=warning,
        translatedQuery=translated_query_for_platform(platform_key, keyword, custom_cp_map),
    )


def search_single_platform(
    platform_key: str,
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
    custom_cp_map: dict[str, Any] | None = None,
) -> tuple[str, list[ScrapedFanfic], int, int, PlatformStatus]:
    """Execute one adapter safely and return a UI-ready status for that source."""
    started_at = perf_counter()
    adapter_cls = SCRAPERS.get(platform_key)
    if not adapter_cls:
        warning = f"Platform '{platform_key}' is not supported."
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map)

    adapter = adapter_cls()
    try:
        scrape_kwargs: dict[str, object] = {"page": page}
        if force_refresh:
            scrape_kwargs["force_refresh"] = True
        if custom_cp_map:
            scrape_kwargs["custom_cp_map"] = custom_cp_map
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

        for item in items:
            if not item.id:
                item.id = f"{platform_key}:{item.url}"
            item.keyword = keyword
        warning = getattr(adapter, "last_warning", None)
        status_count = total_works if total_works > 0 else len(items)
        duration_ms = round((perf_counter() - started_at) * 1000)
        print(f"[{PLATFORM_LABELS.get(platform_key, platform_key)} Done in ms] {duration_ms}")
        return platform_key, items, total_works, total_pages, make_platform_status(
            platform_key, keyword, status_count, warning, custom_cp_map
        )
    except Exception as error:
        warning = f"Platform '{platform_key}' scrape failed: {error}"
        duration_ms = round((perf_counter() - started_at) * 1000)
        print(f"[AdapterIndex] {warning} ({duration_ms}ms)")
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning, custom_cp_map)


def parallel_search_platforms(
    platforms: list[str],
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
    custom_cp_map: dict[str, Any] | None = None,
    timeout_seconds: float = ADAPTER_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    """Search sources concurrently with a bounded deadline per aggregate request."""
    results_map: dict[str, list[ScrapedFanfic]] = {}
    statuses_map: dict[str, PlatformStatus] = {}
    combined_total_works = 0
    max_total_pages = 1
    warnings: list[str] = []
    any_success = False

    executor = ThreadPoolExecutor(max_workers=len(platforms) or 1)
    future_to_platform: dict[Future[tuple[str, list[ScrapedFanfic], int, int, PlatformStatus]], str] = {
        executor.submit(search_single_platform, platform, keyword, page, force_refresh, custom_cp_map): platform
        for platform in platforms
    }
    done, pending = wait(future_to_platform, timeout=max(0.1, timeout_seconds))

    try:
        for future in done:
            platform_key = future_to_platform[future]
            try:
                platform_key, items, total_works, total_pages, status = future.result()
            except Exception as error:
                warning = f"[{PLATFORM_LABELS.get(platform_key, platform_key)}] scrape failed: {error}"
                items, total_works, total_pages = [], 0, 1
                status = make_platform_status(platform_key, keyword, 0, warning, custom_cp_map)
            statuses_map[platform_key] = status
            if status.warning:
                warnings.append(status.warning)
            if status.status in ("success", "empty"):
                any_success = True
            combined_total_works += total_works
            max_total_pages = max(max_total_pages, total_pages)
            if items:
                results_map[platform_key] = items

        for future in pending:
            platform_key = future_to_platform[future]
            future.cancel()
            warning = f"[{PLATFORM_LABELS.get(platform_key, platform_key)}] 連線逾時（超過 {timeout_seconds:g} 秒）"
            print(f"[AdapterIndex] {warning}")
            statuses_map[platform_key] = make_platform_status(platform_key, keyword, 0, warning, custom_cp_map)
            warnings.append(warning)
    finally:
        # Do not wait for a slow third-party browser/network operation during
        # response finalization. Cancellation prevents queued work; running
        # adapters eventually clean up through their own try/finally blocks.
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
