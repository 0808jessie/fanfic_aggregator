from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from fastapi.testclient import TestClient
from models import PlatformStatus, ScrapedFanfic
from scrapers.index import SCRAPERS, classify_platform_status
from scrapers.penana_scraper import PenanaScraper
from scrapers.doujin_scraper import DoujinScraper
from scrapers.waterwriter_scraper import WaterWriterScraper


WATERWRITER_RESULTS = """
<div class="slst">
  <h3><a href="forum.php?mod=viewthread&amp;tid=24680">義忍：水面之下</a></h3>
  <span class="xg1"><a href="home.php?mod=space&amp;uid=12">水滴作者</a> 2026-08-12</span>
  <div class="tag"><a>義忍</a><a>鬼滅之刃</a></div>
</div>
"""

WATERWRITER_MULTI_RESULTS = """
<div id="threadlist"><ul>
  <li class="pbm mbw thread_num_default" id="100"><h3 class="xs3"><a href="forum.php?mod=viewthread&amp;tid=100">義忍：第一篇</a></h3><div>第一篇摘要</div><span class="xg1"><a href="home.php?mod=space&amp;uid=1">作者甲</a> 2026-08-01</span></li>
  <li class="pbm mbw thread_num_default" id="101"><h3 class="xs3"><a href="forum.php?mod=viewthread&amp;tid=101">義忍：第二篇</a></h3><div>第二篇摘要</div><span class="xg1"><a href="home.php?mod=space&amp;uid=2">作者乙</a> 2026-08-02</span></li>
</ul></div>
"""

PENANA_RESULTS = """
<h1 class="search-title">Search Results (1,234)</h1>
<div class="newXbox p0 storydata" data-id="205687">
  <div class="newBookTextInfo">
    <div class="newAuthorname">Amy Symilton</div>
    <div class="newBookData"><span class="time">5 months ago · Updated to #6</span></div>
  </div>
  <div class="hiddenInfo">
    <a class="newBookTitle" href="/story/205687">Zoids Infinity</a>
    <a class="storyInfo" href="/story/205687"><p>A public fanfiction summary.</p></a>
    <div class="storyTag"><a href="/tag/fanfiction">fanfiction</a><a href="/tag/zoids">zoids</a></div>
    <div class="storyProperty"><span>Completed</span></div>
  </div>
</div>
"""

PENANA_DETAIL = """
<div class="dataimgrow"><span title="Word Count"><div class="bkwords">3.2K</div></span></div>
<div class="storyStatus">Completed</div>
"""


class PublicFinderResponse:
    status_code = 200
    text = PENANA_RESULTS

    def raise_for_status(self):
        return None


def test_waterwriter_parser_standardizes_verified_thread_results():
    results = WaterWriterScraper().parse_results(WATERWRITER_RESULTS, "義忍")

    assert len(results) == 1
    item = results[0]
    assert item.platform == "在水裡寫字"
    assert item.title == "義忍：水面之下"
    assert item.author == "水滴作者"
    assert item.url == "https://slashtw.space/forum.php?mod=viewthread&tid=24680"
    assert "義忍" in item.tags


def test_waterwriter_challenge_markers_are_isolated_without_creating_results():
    assert WaterWriterScraper._is_challenge_page('<a href="/cdn-cgi/content">blocked</a>')
    assert WaterWriterScraper._is_challenge_page('<img src="/template/error.jpg">')
    assert not WaterWriterScraper._is_challenge_page(WATERWRITER_RESULTS)
    assert "Windows NT 10.0" in WaterWriterScraper.headers["User-Agent"]
    assert WaterWriterScraper._is_search_cooldown_page("請等待 20 秒後再試")
    assert WaterWriterScraper._is_search_cooldown_page("Search is too frequent")
    assert not WaterWriterScraper._is_search_cooldown_page(WATERWRITER_RESULTS)
    assert "srchtxt=%E7%BE%A9%E5%BF%8D" in WaterWriterScraper.build_search_url("義忍")
    assert "srchfid=all" in WaterWriterScraper.build_search_url("義忍")


def test_waterwriter_static_search_results_are_standardized():
    scraper = WaterWriterScraper()
    with patch.object(scraper, "_fetch_static_search_html", return_value=WATERWRITER_RESULTS):
        payload = scraper.scrape("義忍")

    assert payload["total_works"] == 1
    assert payload["items"][0].url == "https://slashtw.space/forum.php?mod=viewthread&tid=24680"


def test_taiwan_adapters_prefer_explicit_page_totals_over_rendered_card_counts():
    waterwriter_html = WATERWRITER_RESULTS + '<div id="ct">共檢索到 1,234 篇主題</div>'
    scraper = WaterWriterScraper()
    with patch.object(scraper, "_fetch_static_search_html", return_value=waterwriter_html):
        payload = scraper.scrape("義忍")

    assert payload["total_works"] == 1234
    assert WaterWriterScraper.extract_total_works(waterwriter_html) == 1234
    assert WaterWriterScraper.extract_total_works('結果: 找到 「義忍 富岡義勇 胡蝶忍」 相關內容 1 個') == 1

    doujin_html = '<div class="search_result_info">搜尋結果共 456 本作品</div>'
    assert DoujinScraper.extract_total_works(doujin_html) == 456
    assert "keyword=%E7%BE%A9%E5%BF%8D" in DoujinScraper.build_search_url("義忍")
    assert "/books/search/q?" in DoujinScraper.build_search_url("義忍")


def test_doujin_native_keyword_route_and_public_total_are_parsed():
    scraper = DoujinScraper()
    html = """
    <main>
      <div class="listing-header">義忍同人誌、二創同人本 共 24 本</div>
      <div class="books_sim_info">
        <a class="imgborder" href="/books/info/52634"><span>可線上購買</span><img alt="《義忍》平行線的奇蹟" /></a>
        <div class="bks_sim_info_list">
          <strong><a href="/books/info/52634">《義忍》平行線的奇蹟</a></strong>
          <div class="painter_name">作者：<a>子路</a></div>
          <div class="books_view"><span class="info_txt">公開作品摘要</span></div>
        </div>
      </div>
      <section class="books_related_results">
        <a href="/books/info/99999">不應納入的延伸推薦</a>
      </div>
      <nav class="pagination">第一頁上 10 頁 <span aria-label="總共 2 頁">共 2 頁</span> 下 10 頁</nav>
    </main>
    """

    assert scraper.build_search_url("義忍") == "https://www.doujin.com.tw/books/search/q?keyword=%E7%BE%A9%E5%BF%8D"
    assert scraper.build_search_url("義忍", page=2).endswith("keyword=%E7%BE%A9%E5%BF%8D&page=2")
    assert scraper.extract_total_works(html) == 24
    assert scraper.extract_total_pages(html) == 2
    items = scraper.parse_results(html, "義忍")
    assert len(items) == 1
    assert items[0].title == "《義忍》平行線的奇蹟"
    assert items[0].author == "子路"
    assert items[0].url == "https://www.doujin.com.tw/books/info/52634"


def test_doujin_single_page_result_safely_defaults_to_one_page():
    single_page_html = '<main><div class="listing-header">共 4 本</div></main>'
    assert DoujinScraper.extract_total_works(single_page_html) == 4
    assert DoujinScraper.extract_total_pages(single_page_html) is None


def test_taiwan_adapters_pass_chinese_cp_query_to_public_search_pages():
    waterwriter = WaterWriterScraper()
    with patch.object(waterwriter, "_fetch_static_search_html", return_value=WATERWRITER_RESULTS) as fetch_waterwriter:
        waterwriter.scrape("義忍")
    assert fetch_waterwriter.call_args.args == ("義忍",)

    doujin = DoujinScraper()
    with patch.object(doujin, "_fetch_static_search_html", return_value='<main><div class="listing-header">共 0 本</div></main>') as fetch_doujin:
        doujin.scrape("義忍")
    assert fetch_doujin.call_args.args == ("義忍", 1)


def test_taiwan_static_adapters_use_relaxed_http_timeout_and_single_primary_keyword():
    class WaterwriterResponse:
        status_code = 200
        text = WATERWRITER_RESULTS

        def raise_for_status(self):
            return None

    with patch("scrapers.waterwriter_scraper.requests.get", return_value=WaterwriterResponse()) as water_request:
        payload = WaterWriterScraper().scrape("義忍 富岡義勇 胡蝶忍")

    assert payload["items"]
    assert "srchtxt=%E7%BE%A9%E5%BF%8D" in water_request.call_args.args[0]
    assert water_request.call_args.kwargs["timeout"] == (5, 12)

    class DoujinResponse:
        status_code = 200
        text = '<main><div class="listing-header">共 1 本</div></main>'

        def raise_for_status(self):
            return None

    with patch("scrapers.doujin_scraper.requests.get", return_value=DoujinResponse()) as doujin_request:
        payload = DoujinScraper().scrape("義忍 富岡義勇 胡蝶忍")

    assert payload["total_works"] == 1
    assert "keyword=%E7%BE%A9%E5%BF%8D" in doujin_request.call_args.args[0]
    assert doujin_request.call_args.kwargs["timeout"] == (5, 12)


def test_taiwan_adapters_use_verified_static_html_without_browser_fallback():
    waterwriter_html = WATERWRITER_RESULTS + '<div id="ct">共檢索到 25 篇主題</div>'
    waterwriter = WaterWriterScraper()
    with patch.object(waterwriter, "_fetch_static_search_html", return_value=waterwriter_html):
        water_payload = waterwriter.scrape("義忍")

    assert len(water_payload["items"]) == 1
    assert water_payload["total_works"] == 25

    doujin_html = '<main><div class="listing-header">共 4 本</div></main>'
    doujin = DoujinScraper()
    with patch.object(doujin, "_fetch_static_search_html", return_value=doujin_html) as fetch_doujin:
        doujin_payload = doujin.scrape("義忍")

    assert doujin_payload["total_works"] == 4
    fetch_doujin.assert_called_once_with("義忍", 1)


def test_waterwriter_keeps_each_rendered_discuz_row_title_and_summary_separate():
    items = WaterWriterScraper().parse_results(WATERWRITER_MULTI_RESULTS, "義忍")

    assert [item.title for item in items] == ["義忍：第一篇", "義忍：第二篇"]
    assert [item.author for item in items] == ["作者甲", "作者乙"]
    assert "第一篇摘要" in items[0].summary
    assert "第二篇摘要" in items[1].summary


def test_penana_parser_standardizes_public_story_cards_without_mislabeling_reads_as_words():
    results = PenanaScraper().parse_results(PENANA_RESULTS, "fanfiction")

    assert len(results) == 1
    item = results[0]
    assert item.platform == "Penana"
    assert item.title == "Zoids Infinity"
    assert item.author == "Amy Symilton"
    assert item.url == "https://www.penana.com/story/205687"
    assert item.summary == "A public fanfiction summary."
    assert item.tags == "fanfiction, zoids"
    assert item.wordCount is None
    assert item.isComplete is True
    assert PenanaScraper.extract_total_works(PENANA_RESULTS) == 1234


def test_penana_scrape_prefers_its_declared_search_total_over_visible_cards():
    scraper = PenanaScraper()
    with patch.object(scraper, "_fetch_public_search_html", return_value=PENANA_RESULTS):
        payload = scraper.scrape("fanfiction")

    assert len(payload["items"]) == 1
    assert payload["total_works"] == 1234


def test_penana_detail_metadata_uses_labelled_word_count_and_explicit_status_only():
    metadata = PenanaScraper.parse_detail_metadata(PENANA_DETAIL)
    assert metadata == {"wordCount": "3,200 words", "isComplete": True}

    unknown = PenanaScraper.parse_detail_metadata('<span class="newBkwords">1.5K reads</span>')
    assert unknown == {"wordCount": None, "isComplete": None}
    assert PenanaScraper._is_verification_page('<div>Just a moment… Cloudflare</div>')
    assert not PenanaScraper._is_verification_page(PENANA_DETAIL)


def test_penana_uses_ordinary_public_finder_headers_without_browser_fallback():
    with patch("scrapers.penana_scraper.curl_requests.get", return_value=PublicFinderResponse()) as request:
        html = PenanaScraper()._fetch_public_search_html("fanfiction")

    assert html == PENANA_RESULTS
    headers = request.call_args.kwargs["headers"]
    assert headers["Referer"] == "https://www.penana.com/"
    assert "Windows NT 10.0" in headers["User-Agent"]
    assert headers["Sec-CH-UA-Mobile"] == "?0"
    assert headers["Sec-CH-UA-Platform"] == '"Windows"'
    assert headers["Sec-Fetch-Mode"] == "navigate"
    assert headers["Sec-Fetch-Site"] == "same-origin"
    assert headers["Sec-Fetch-User"] == "?1"
    assert headers["Upgrade-Insecure-Requests"] == "1"
    assert request.call_args.kwargs["params"] == {"t": "story", "search": "fanfiction"}
    assert request.call_args.kwargs["timeout"] == 30.0


def test_penana_http_timeout_returns_source_warning_without_browser_navigation():
    scraper = PenanaScraper()
    with patch("scrapers.penana_scraper.curl_requests.get", side_effect=requests.Timeout("slow public finder")):
        payload = scraper.scrape("義忍")

    assert payload == {"items": [], "total_works": 0, "total_pages": 1}
    assert "Public Finder HTTP request unavailable" in (scraper.last_warning or "")


def test_penana_cloudflare_403_returns_a_blocked_source_warning_without_browser_navigation():
    blocked_response = MagicMock(status_code=403, text="<html>Cloudflare</html>")
    scraper = PenanaScraper()

    with patch("scrapers.penana_scraper.curl_requests.get", return_value=blocked_response):
        payload = scraper.scrape("義忍")

    assert payload == {"items": [], "total_works": 0, "total_pages": 1}
    assert "觸發人機保護" in (scraper.last_warning or "")


def test_penana_verification_html_returns_a_blocked_source_warning_without_browser_navigation():
    verification_response = MagicMock(status_code=200, text="<title>Just a moment… Cloudflare</title>")
    verification_response.raise_for_status.return_value = None
    scraper = PenanaScraper()

    with patch("scrapers.penana_scraper.curl_requests.get", return_value=verification_response):
        payload = scraper.scrape("義忍")

    assert payload == {"items": [], "total_works": 0, "total_pages": 1}
    assert "觸發人機保護" in (scraper.last_warning or "")
    assert classify_platform_status(0, scraper.last_warning) == "blocked"


def test_partial_platform_warnings_are_silent_when_a_verified_result_exists():
    item = ScrapedFanfic(
        id="ao3:silent-warning",
        title="Verified AO3 result",
        author="Author",
        platform="AO3",
        url="https://archiveofourown.org/works/24680",
        tags="fanfiction",
        summary="Verified public result",
        keyword="fanfiction",
    )
    aggregate = {
        "items": [item],
        "any_success": True,
        "total_works": 1,
        "total_pages": 1,
        "warnings": ["[水裡寫字] Triggered Challenge, skipping cleanly"],
        "platform_statuses": [
            PlatformStatus(
                platformId="ao3",
                label="AO3",
                status="success",
                itemCount=1,
                translatedQuery="fanfiction",
            ),
            PlatformStatus(
                platformId="waterwriter",
                label="在水裡寫字",
                status="blocked",
                itemCount=0,
                warning="[水裡寫字] Triggered Challenge, skipping cleanly",
                translatedQuery="fanfiction",
            ),
        ],
    }
    with patch("main.parallel_search_platforms", return_value=aggregate), patch("main.save_fanfic_to_db"):
        response = TestClient(main.app).post(
            "/search",
            json={"keyword": "fanfiction", "platforms": ["ao3", "waterwriter"], "forceRefresh": True},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["items"][0]["title"] == "Verified AO3 result"
    assert body.get("warning") is None
    assert body["items"][0].get("warning") is None
    statuses = {status["platformId"]: status for status in body["platformStatuses"]}
    assert statuses["ao3"]["status"] == "success"
    assert statuses["ao3"]["itemCount"] == 1
    assert statuses["waterwriter"]["status"] == "blocked"
    assert "Triggered Challenge" in statuses["waterwriter"]["warning"]


def test_custom_cp_mapping_is_forwarded_as_a_request_scoped_adapter_override():
    item = ScrapedFanfic(
        id="ao3:black-xie",
        title="黑邪公開作品",
        author="測試作者",
        platform="AO3",
        url="https://archiveofourown.org/works/24681",
        keyword="黑邪",
    )
    aggregate = {
        "items": [item],
        "any_success": True,
        "total_works": 7,
        "total_pages": 1,
        "warnings": [],
        "platform_statuses": [
            PlatformStatus(
                platformId="ao3",
                label="AO3",
                status="success",
                itemCount=7,
                translatedQuery="Heiyan/Wu Xie",
            ),
        ],
    }
    with patch("main.parallel_search_platforms", return_value=aggregate) as search, patch("main.save_fanfic_to_db"):
        response = TestClient(main.app).post(
            "/search",
            json={
                "keyword": "黑邪",
                "platforms": ["ao3"],
                "forceRefresh": True,
                "customCpMappings": [{"alias": "黑邪", "ao3Query": "Heiyan/Wu Xie", "localQuery": "黑邪 吳邪"}],
            },
        )

    assert response.status_code == 200
    custom_map = search.call_args.kwargs["custom_cp_map"]
    assert custom_map["黑邪"].ao3_query == "Heiyan/Wu Xie"
    assert custom_map["黑邪"].local_query == "黑邪 吳邪"


def test_malformed_custom_cp_payload_falls_back_to_default_vocabulary():
    parsed = main.normalize_custom_cp_mappings('{not valid JSON')
    assert parsed == []

    response = TestClient(main.app).post(
        "/search",
        json={"keyword": "花", "platforms": ["unsupported"], "customCpMappings": "{bad"},
    )
    assert response.status_code == 400


def test_taiwan_platforms_are_registered_and_constrained_to_trusted_hosts():
    assert "waterwriter" in SCRAPERS
    assert "penana" in SCRAPERS
    assert main.canonical_platforms(["waterwriter", "penana"]) == ["waterwriter", "penana"]
    assert main.is_real_platform_url("https://slashtw.space/forum.php?mod=viewthread&tid=24680", "在水裡寫字")
    assert main.is_real_platform_url("https://www.penana.com/story/205687", "Penana")
    assert not main.is_real_platform_url("https://example.com/story/205687", "Penana")
