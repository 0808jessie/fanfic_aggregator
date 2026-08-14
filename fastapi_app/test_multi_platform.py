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
        self.last_warning = "[Lofter] Request blocked (HTTP 403)"

    def scrape(self, keyword: str, page: int = 1):
        print("[Lofter] Request blocked")
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
    assert any("[Lofter] Request blocked" in warning for warning in aggregate["warnings"])
    statuses = {status.platformId: status for status in aggregate["platform_statuses"]}
    assert statuses["ao3"].status == "success"
    assert statuses["ao3"].itemCount == 100
    assert statuses["lofter"].status == "blocked"


def test_platform_status_translates_cp_query_and_detects_cooldown():
    assert adapter_index.translated_query_for_platform("ao3", "義忍") == '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"'
    assert adapter_index.translated_query_for_platform("waterwriter", "義忍") == "義忍 富岡義勇 胡蝶忍"
    assert adapter_index.classify_platform_status(0, "[在水裡寫字] Blocked by Rate Limit, skipping cleanly") == "cooldown"
    assert adapter_index.classify_platform_status(0, "[同人誌中心] Triggered verification page") == "blocked"
    assert adapter_index.classify_platform_status(0, "[同人誌中心] No verified public result matched '義忍'") == "empty"


def test_platform_status_and_adapter_receive_request_scoped_custom_cp_queries():
    received: list[str] = []

    class CapturingAO3(FakeAO3):
        def scrape(self, keyword: str, page: int = 1):
            received.append(keyword)
            return super().scrape(keyword, page)

    custom = {"義忍": {"ao3Query": "Custom AO3 Pair", "localQuery": "自訂 中文 詞組"}}
    with patch.object(adapter_index, "SCRAPERS", {"ao3": CapturingAO3}):
        _, items, _, _, status = adapter_index.search_single_platform("ao3", "義忍", custom_cp_mappings=custom)

    assert received == ["Custom AO3 Pair"]
    assert items[0].keyword == "義忍"
    assert status.translatedQuery == "Custom AO3 Pair"
    assert adapter_index.translated_query_for_platform("waterwriter", "義忍", custom) == "自訂 中文 詞組"


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


class FakeBlockedResponse:
    status_code = 403
    ok = False
    text = ""


def test_real_lofter_adapter_isolates_http_block(capsys):
    from fastapi_app.scrapers.lofter_scraper import LofterScraper

    with patch("fastapi_app.scrapers.lofter_scraper.requests.get", return_value=FakeBlockedResponse()):
        scraper = LofterScraper()
        assert scraper.scrape("義忍") == []

    assert "[Lofter] Request blocked" in capsys.readouterr().out
    assert scraper.last_warning == "[Lofter] Request blocked (HTTP 403)"


def test_real_lofter_adapter_isolates_connection_error(capsys):
    import requests
    from fastapi_app.scrapers.lofter_scraper import LofterScraper

    with patch(
        "fastapi_app.scrapers.lofter_scraper.requests.get",
        side_effect=requests.RequestException("offline"),
    ):
        scraper = LofterScraper()
        assert scraper.scrape("義忍") == []

    assert "[Lofter] Request blocked" in capsys.readouterr().out
    assert scraper.last_warning.startswith("[Lofter] Request blocked")
