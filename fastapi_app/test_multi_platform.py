from __future__ import annotations
import time
from unittest.mock import patch

from fastapi_app.constants.cp_tags import build_custom_cp_map
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


class SafeFallbackCxC:
    def __init__(self):
        self.last_warning = "[CxC] Request blocked (HTTP 403)"

    def scrape(self, keyword: str, page: int = 1):
        print("[CxC] Request blocked")
        return []


def test_parallel_registry_keeps_successful_platform_when_another_fails():
    with patch.object(adapter_index, "SCRAPERS", {"ao3": FakeAO3, "cxc": SafeFallbackCxC}):
        aggregate = adapter_index.parallel_search_platforms(["ao3", "cxc"], "花", page=1)

    assert aggregate["any_success"] is True
    assert len(aggregate["items"]) == 1
    assert aggregate["items"][0].platform == "AO3"
    assert aggregate["items"][0].id == "ao3:https://archiveofourown.org/works/2001"
    assert aggregate["total_works"] == 100
    assert aggregate["total_pages"] == 5
    assert any("[CxC] Request blocked" in warning for warning in aggregate["warnings"])
    statuses = {status.platformId: status for status in aggregate["platform_statuses"]}
    assert statuses["ao3"].status == "success"
    assert statuses["ao3"].itemCount == 100
    assert statuses["cxc"].status == "blocked"


def test_platform_status_translates_cp_query_and_detects_cooldown():
    assert adapter_index.translated_query_for_platform("ao3", "義忍") == '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"'
    assert adapter_index.translated_query_for_platform("waterwriter", "義忍") == "義忍"
    assert adapter_index.translated_query_for_platform("doujin", "哨兵嚮導") == "哨兵嚮導"
    assert adapter_index.ADAPTER_TIMEOUT_SECONDS == 15.0
    assert adapter_index.PLATFORM_TIMEOUT_SECONDS == {
        "ao3": 20.0,
        "penana": 18.0,
        "cxc": 15.0,
        "doujin": 15.0,
        "waterwriter": 15.0,
    }
    assert adapter_index.classify_platform_status(0, "[在水裡寫字] Blocked by Rate Limit, skipping cleanly") == "cooldown"
    assert adapter_index.classify_platform_status(0, "[同人誌中心] Triggered verification page") == "blocked"
    assert adapter_index.classify_platform_status(0, "[同人誌中心] No verified public result matched '義忍'") == "empty"


def test_unknown_cp_aliases_fall_back_to_the_original_keyword_for_every_platform():
    for keyword in ("蛇戀", "炭善", "五悠"):
        assert adapter_index.translated_query_for_platform("ao3", keyword) == keyword
        assert adapter_index.translated_query_for_platform("waterwriter", keyword) == keyword
        assert adapter_index.translated_query_for_platform("doujin", keyword) == keyword
        assert adapter_index.translated_query_for_platform("penana", keyword) == keyword
        assert adapter_index.translated_query_for_platform("cxc", keyword) == keyword


def test_author_mode_uses_raw_queries_and_isolated_cache_keys():
    assert adapter_index.translated_query_for_platform("ao3", "Mizuki Studio", mode="author") == "Mizuki Studio"
    assert adapter_index._source_cache_key("ao3", "Mizuki Studio", 1, None, "author") == (
        "ao3",
        "author:Mizuki Studio",
        1,
    )
    assert adapter_index._source_cache_key("ao3", "Mizuki Studio", 1, None, "keyword") == (
        "ao3",
        "keyword:Mizuki Studio",
        1,
    )


def test_author_mode_filters_results_to_verified_creator_field():
    assert adapter_index._matches_author_query("Mizuki Studio", "mizuki") is True
    assert adapter_index._matches_author_query("Mizuki Studio", "Mizuki Studio") is True
    assert adapter_index._matches_author_query("Another Creator", "mizuki") is False


class FakeCxCSuccess:
    def __init__(self):
        self.last_warning = None

    def scrape(self, keyword: str, page: int = 1):
        return [
            ScrapedFanfic(
                title="CxC story",
                author="CxC author",
                platform="CxC 創利市集",
                url="https://cxc.today/@creator/work/2002",
                keyword=keyword,
            )
        ]


def test_parallel_registry_combines_totals_across_platforms():
    class FakeAO3WithTotal(FakeAO3):
        pass

    with patch.object(
        adapter_index,
        "SCRAPERS",
        {"ao3": FakeAO3WithTotal, "cxc": FakeCxCSuccess},
    ):
        aggregate = adapter_index.parallel_search_platforms(["ao3", "cxc"], "花", page=1)

    assert aggregate["any_success"] is True
    assert sorted(item.platform for item in aggregate["items"]) == ["AO3", "CxC 創利市集"]
    assert aggregate["total_works"] == 100
    assert aggregate["total_pages"] == 5


class FakeBlockedResponse:
    status_code = 403
    ok = False
    text = ""


def test_lofter_is_not_an_enabled_adapter_or_status_source():
    assert "lofter" not in adapter_index.SCRAPERS
    assert "lofter" not in adapter_index.PLATFORM_LABELS


def test_custom_cp_mapping_overrides_ao3_and_local_query_per_request():
    custom_map = build_custom_cp_map([
        type("Mapping", (), {
            "alias": "黑邪",
            "ao3Query": "Heiyan/Wu Xie",
            "localQuery": "黑邪 吳邪",
        })(),
    ])

    assert adapter_index.translated_query_for_platform("ao3", "黑邪", custom_map) == "Heiyan/Wu Xie"
    assert adapter_index.translated_query_for_platform("doujin", "黑邪", custom_map) == "黑邪"
    assert adapter_index.translated_query_for_platform("cxc", "黑邪", custom_map) == "黑邪"


def test_parallel_search_returns_partial_results_when_one_adapter_exceeds_deadline():
    class SlowAdapter:
        def __init__(self):
            self.last_warning = None

        def scrape(self, keyword: str, page: int = 1):
            time.sleep(0.5)
            return []

    with patch.object(adapter_index, "SCRAPERS", {"ao3": FakeAO3, "waterwriter": SlowAdapter}):
        aggregate = adapter_index.parallel_search_platforms(
            ["ao3", "waterwriter"],
            "花",
            timeout_seconds=0.001,
        )

    statuses = {status.platformId: status for status in aggregate["platform_statuses"]}
    assert [item.platform for item in aggregate["items"]] == ["AO3"]
    assert statuses["ao3"].status == "success"
    assert statuses["waterwriter"].status in ("error", "empty")


def test_source_cache_marks_fast_follow_up_and_force_refresh_bypasses_it():
    calls = 0

    class CacheableAdapter:
        def __init__(self):
            self.last_warning = None

        def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False):
            nonlocal calls
            calls += 1
            return {
                "items": [ScrapedFanfic(
                    title="cached source",
                    author="author",
                    platform="AO3",
                    url="https://archiveofourown.org/works/3001",
                    keyword=keyword,
                )],
                "total_works": 1,
                "total_pages": 1,
            }

    adapter_index._SOURCE_CACHE.clear()
    with patch.object(adapter_index, "SCRAPERS", {"ao3": CacheableAdapter}):
        _, _, _, _, first_status = adapter_index.search_single_platform("ao3", "cache probe")
        _, _, _, _, second_status = adapter_index.search_single_platform("ao3", "cache probe")
        _, _, _, _, refreshed_status = adapter_index.search_single_platform("ao3", "cache probe", force_refresh=True)

    assert calls == 2
    assert first_status.fromCache is False
    assert second_status.fromCache is True
    assert refreshed_status.fromCache is False


def test_single_platform_retry_only_executes_the_requested_adapter():
    calls: list[str] = []

    class AO3Probe:
        def __init__(self):
            self.last_warning = None

        def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False):
            calls.append("ao3")
            return {"items": [], "total_works": 0, "total_pages": 1}

    class CxCProbe(AO3Probe):
        def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False):
            calls.append("cxc")
            return {"items": [], "total_works": 0, "total_pages": 1}

    adapter_index._SOURCE_CACHE.clear()
    with patch.object(adapter_index, "SCRAPERS", {"ao3": AO3Probe, "cxc": CxCProbe}):
        aggregate = adapter_index.parallel_search_platforms(["cxc"], "單一重試", force_refresh=True)

    assert calls == ["cxc"]
    assert [status.platformId for status in aggregate["platform_statuses"]] == ["cxc"]
