from concurrent.futures import ThreadPoolExecutor, as_completed
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
    "lofter": LofterScraper,
    "doujin": DoujinScraper,
    "waterwriter": WaterWriterScraper,
    "penana": PenanaScraper,
}

PLATFORM_LABELS = {
    "ao3": "AO3",
    "cxc": "CxC 創利市集",
    "lofter": "Lofter",
    "doujin": "同人誌中心",
    "waterwriter": "在水裡寫字",
    "penana": "Penana",
}
LOCAL_CP_PLATFORM_IDS = frozenset(("cxc", "doujin", "waterwriter"))


def translated_query_for_platform(platform_key: str, keyword: str) -> str:
    """Expose the adapter's CP translation without altering free-text input."""
    if platform_key == "ao3":
        return get_keyword_for_platform(keyword, "ao3")
    if platform_key in LOCAL_CP_PLATFORM_IDS:
        return get_keyword_for_platform(keyword, "local")
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


def make_platform_status(platform_key: str, keyword: str, item_count: int, warning: str | None) -> PlatformStatus:
    return PlatformStatus(
        platformId=platform_key,
        label=PLATFORM_LABELS.get(platform_key, platform_key),
        status=classify_platform_status(item_count, warning),
        itemCount=item_count,
        warning=warning,
        translatedQuery=translated_query_for_platform(platform_key, keyword),
    )


def search_single_platform(
    platform_key: str,
    keyword: str,
    page: int = 1,
    force_refresh: bool = False,
) -> tuple[str, list[ScrapedFanfic], int, int, PlatformStatus]:
    """Execute one adapter safely and return a UI-ready status for that source."""
    adapter_cls = SCRAPERS.get(platform_key)
    if not adapter_cls:
        warning = f"Platform '{platform_key}' is not supported."
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning)

    adapter = adapter_cls()
    try:
        payload = (
            adapter.scrape(keyword, page=page, force_refresh=True)
            if force_refresh
            else adapter.scrape(keyword, page=page)
        )
        items: list[ScrapedFanfic] = []
        total_works = 0
        total_pages = 1
        if isinstance(payload, dict):
            items = payload.get("items", [])
            total_works = int(payload.get("total_works", 0) or 0)
            total_pages = int(payload.get("total_pages", 1) or 1)
        elif isinstance(payload, list):
            items = payload
            total_works = len(items)
            total_pages = max(1, (total_works + 19) // 20)

        for item in items:
            if not item.id:
                item.id = f"{platform_key}:{item.url}"
        warning = getattr(adapter, "last_warning", None)
        status_count = total_works if total_works > 0 else len(items)
        return platform_key, items, total_works, total_pages, make_platform_status(platform_key, keyword, status_count, warning)
    except Exception as error:
        warning = f"Platform '{platform_key}' scrape failed: {error}"
        print(f"[AdapterIndex] {warning}")
        return platform_key, [], 0, 0, make_platform_status(platform_key, keyword, 0, warning)


def parallel_search_platforms(platforms: list[str], keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, Any]:
    """Search selected platforms concurrently without letting any failure block another."""
    results_map: dict[str, list[ScrapedFanfic]] = {}
    statuses_map: dict[str, PlatformStatus] = {}
    combined_total_works = 0
    max_total_pages = 1
    warnings: list[str] = []
    any_success = False

    with ThreadPoolExecutor(max_workers=len(platforms) or 1) as executor:
        future_to_platform = {
            executor.submit(search_single_platform, platform, keyword, page, force_refresh): platform
            for platform in platforms
        }
        for future in as_completed(future_to_platform):
            platform_key, items, total_works, total_pages, status = future.result()
            statuses_map[platform_key] = status
            if status.warning:
                warnings.append(status.warning)
            if status.status in ("success", "empty"):
                any_success = True
            if items:
                results_map[platform_key] = items
                combined_total_works += total_works
                max_total_pages = max(max_total_pages, total_pages)

    all_items: list[ScrapedFanfic] = []
    for platform in platforms:
        all_items.extend(results_map.get(platform, []))

    return {
        "items": all_items,
        "any_success": any_success,
        "total_works": combined_total_works or len(all_items),
        "total_pages": max_total_pages,
        "warnings": warnings,
        "platform_statuses": [statuses_map[platform] for platform in platforms if platform in statuses_map],
    }
