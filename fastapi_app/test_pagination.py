from __future__ import annotations
from unittest.mock import patch

from fastapi_app import main
from fastapi_app.models import ScrapedFanfic, SearchQuery


class FakeAO3Adapter:
    calls: list[int] = []

    def scrape(self, keyword: str, page: int = 1) -> dict:
        self.calls.append(page)
        if page == 1:
            items = [
                ScrapedFanfic(
                    title="Page one",
                    author="Author one",
                    platform="AO3",
                    url="https://archiveofourown.org/works/1001",
                    keyword=keyword,
                ),
                ScrapedFanfic(
                    title="Page two",
                    author="Author two",
                    platform="AO3",
                    url="https://archiveofourown.org/works/1002",
                    keyword=keyword,
                ),
            ]
        else:
            items = [
                ScrapedFanfic(
                    title=f"Page {page}",
                    author="Author",
                    platform="AO3",
                    url=f"https://archiveofourown.org/works/{1000 + page}",
                    keyword=keyword,
                )
            ]
        return {"items": items, "total_works": 60, "total_pages": 3}


def fake_parallel_search(platforms: list[str], keyword: str, page: int = 1) -> dict:
    adapter = FakeAO3Adapter()
    payload = adapter.scrape(keyword, page)
    return {
        "items": payload["items"],
        "any_success": True,
        "total_works": payload["total_works"],
        "total_pages": payload["total_pages"],
        "warnings": [],
    }


def test_page_one_has_two_page_metadata_and_page_three_can_continue():
    FakeAO3Adapter.calls = []
    with patch.object(main, "parallel_search_platforms", fake_parallel_search), patch.object(
        main, "save_fanfic_to_db"
    ), patch.object(main, "get_cached_results", return_value=None), patch.object(
        main, "_MEMORY_CACHE", {}
    ):
        first = main.search_fanfics(SearchQuery(keyword="花", platforms=["ao3"], page=1), object())
        assert first.source == "live"
        assert first.totalWorks == 60
        assert first.totalPages == 3
        assert first.loadedThroughPage == 2
        assert first.nextPage == 3
        assert first.hasMore is True
        assert FakeAO3Adapter.calls == [1]

        later = main.search_fanfics(SearchQuery(keyword="花", platforms=["ao3"], page=3), object())
        assert later.source == "live"
        assert later.page == 3
        assert later.items[0].title == "Page 3"


def test_page_aware_memory_cache_preserves_page_metadata():
    FakeAO3Adapter.calls = []
    with patch.object(main, "parallel_search_platforms", fake_parallel_search), patch.object(
        main, "save_fanfic_to_db"
    ), patch.object(main, "get_cached_results", return_value=None), patch.object(
        main, "_MEMORY_CACHE", {}
    ):
        first = main.search_fanfics(SearchQuery(keyword="月光", platforms=["ao3"], page=1), object())
        cached = main.search_fanfics(SearchQuery(keyword="月光", platforms=["ao3"], page=1), object())
        assert cached.source == "cache"
        assert cached.totalWorks == first.totalWorks
        assert cached.loadedThroughPage == first.loadedThroughPage
        assert FakeAO3Adapter.calls == [1]
