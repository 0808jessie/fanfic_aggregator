from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Callable, Any
from ..models import ScrapedFanfic
from .ao3_scraper import AO3Scraper
from .lofter_scraper import LofterScraper

SCRAPERS: dict[str, Callable[[], object]] = {
    "ao3": AO3Scraper,
    "lofter": LofterScraper,
}


def search_single_platform(platform_key: str, keyword: str, page: int = 1) -> tuple[str, list[ScrapedFanfic], int, int, str | None]:
    """Execute single platform scrape with isolated exception handling."""
    adapter_cls = SCRAPERS.get(platform_key)
    if not adapter_cls:
        return platform_key, [], 0, 0, f"Platform '{platform_key}' is not supported."

    adapter = adapter_cls()
    try:
        payload = adapter.scrape(keyword, page=page)

        items = []
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
        adapter_warning = getattr(adapter, "last_warning", None)
        return platform_key, items, total_works, total_pages, adapter_warning
    except Exception as error:
        error_msg = f"Platform '{platform_key}' scrape failed: {error}"
        print(f"[AdapterIndex] {error_msg}")
        return platform_key, [], 0, 0, error_msg


def parallel_search_platforms(platforms: list[str], keyword: str, page: int = 1) -> dict[str, Any]:
    """
    Parallel search across requested platforms using ThreadPoolExecutor (Promise.allSettled equivalent),
    ensuring a failure in one platform (e.g. Lofter / AO3 rate limit) does not block others.
    """
    results_map: dict[str, list[ScrapedFanfic]] = {}
    combined_total_works = 0
    max_total_pages = 1
    warnings: list[str] = []
    any_success = False

    with ThreadPoolExecutor(max_workers=len(platforms) or 1) as executor:
        future_to_platform = {
            executor.submit(search_single_platform, p, keyword, page): p
            for p in platforms
        }

        for future in as_completed(future_to_platform):
            platform_key, items, t_works, t_pages, err = future.result()
            if err:
                warnings.append(err)
            if items:
                any_success = True
                results_map[platform_key] = items
                combined_total_works += t_works
                max_total_pages = max(max_total_pages, t_pages)

    all_items: list[ScrapedFanfic] = []
    for p_items in results_map.values():
        all_items.extend(p_items)

    return {
        "items": all_items,
        "any_success": any_success,
        "total_works": combined_total_works or len(all_items),
        "total_pages": max_total_pages,
        "warnings": warnings,
    }
