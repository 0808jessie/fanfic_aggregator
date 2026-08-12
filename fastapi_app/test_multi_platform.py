from unittest.mock import patch

from fastapi_app.models import ScrapedFanfic
from fastapi_app.scrapers import index as adapter_index


class FakeAO3:
    def __init__(self):
        self.last_warning = None

    def scrape(self, keyword: str, page: int = 1):
        return {
            "items": [
                ScrapedFanfic(
                    title="AO3 story",
                    author="AO3 author",
                    platform="AO3",
                    url="https://archiveofourown.org/works/2001",
                    keyword=keyword,
                )
            ],
            "total_works": 100,
            "total_pages": 5,
        }


class SafeFallbackLofter:
    def __init__(self):
        self.last_warning = "[Lofter Adapter] Blocked or Offline (HTTP 403)"

    def scrape(self, keyword: str, page: int = 1):
        print("[Lofter Adapter] Blocked or Offline")
        return []


def test_parallel_registry_keeps_successful_platform_when_another_fails():
    with patch.object(adapter_index, "SCRAPERS", {"ao3": FakeAO3, "lofter": SafeFallbackLofter}):
        aggregate = adapter_index.parallel_search_platforms(["ao3", "lofter"], "花", page=1)

    assert aggregate["any_success"] is True
    assert len(aggregate["items"]) == 1
    assert aggregate["items"][0].platform == "AO3"
    assert aggregate["items"][0].id == "ao3:https://archiveofourown.org/works/2001"
    assert aggregate["total_works"] == 100
    assert aggregate["total_pages"] == 5
    assert any("Blocked or Offline" in warning for warning in aggregate["warnings"])


class FakeLofterSuccess:
    def __init__(self):
        self.last_warning = None

    def scrape(self, keyword: str, page: int = 1):
        return [
            ScrapedFanfic(
                title="Lofter story",
                author="Lofter author",
                platform="Lofter",
                url="https://www.lofter.com/post/2002",
                keyword=keyword,
            )
        ]


def test_parallel_registry_combines_totals_across_platforms():
    class FakeAO3WithTotal(FakeAO3):
        pass

    with patch.object(
        adapter_index,
        "SCRAPERS",
        {"ao3": FakeAO3WithTotal, "lofter": FakeLofterSuccess},
    ):
        aggregate = adapter_index.parallel_search_platforms(["ao3", "lofter"], "花", page=1)

    assert aggregate["any_success"] is True
    assert sorted(item.platform for item in aggregate["items"]) == ["AO3", "Lofter"]
    assert aggregate["total_works"] == 101
    assert aggregate["total_pages"] == 5
