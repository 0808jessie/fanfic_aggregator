from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from fastapi.testclient import TestClient
from models import PlatformStatus, ScrapedFanfic
from scrapers.index import SCRAPERS
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


def test_waterwriter_browser_rendered_search_results_are_standardized():
    scraper = WaterWriterScraper()
    with patch.object(scraper, "_render_public_search_html", return_value=WATERWRITER_RESULTS):
        payload = scraper.scrape("義忍")

    assert payload["total_works"] == 1
    assert payload["items"][0].url == "https://slashtw.space/forum.php?mod=viewthread&tid=24680"


def test_taiwan_adapters_pass_chinese_cp_query_to_public_search_pages():
    waterwriter = WaterWriterScraper()
    with patch.object(waterwriter, "_render_public_search_html", return_value=WATERWRITER_RESULTS) as render_waterwriter:
        waterwriter.scrape("義忍")
    assert render_waterwriter.call_args.args == ("義忍 富岡義勇 胡蝶忍",)

    doujin = DoujinScraper()
    with patch.object(doujin, "_render_public_search_html", return_value="") as render_doujin:
        doujin.scrape("義忍")
    assert render_doujin.call_args.args == ("義忍 富岡義勇 胡蝶忍",)


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


def test_penana_detail_metadata_uses_labelled_word_count_and_explicit_status_only():
    metadata = PenanaScraper.parse_detail_metadata(PENANA_DETAIL)
    assert metadata == {"wordCount": "3,200 words", "isComplete": True}

    unknown = PenanaScraper.parse_detail_metadata('<span class="newBkwords">1.5K reads</span>')
    assert unknown == {"wordCount": None, "isComplete": None}
    assert PenanaScraper._is_verification_page('<div>Just a moment… Cloudflare</div>')
    assert not PenanaScraper._is_verification_page(PENANA_DETAIL)


def test_penana_uses_ordinary_public_finder_headers_before_rendered_fallback():
    with patch("scrapers.penana_scraper.requests.get", return_value=PublicFinderResponse()) as request:
        html = PenanaScraper()._fetch_public_search_html("fanfiction")

    assert html == PENANA_RESULTS
    headers = request.call_args.kwargs["headers"]
    assert headers["Referer"] == "https://www.penana.com/"
    assert "Windows NT 10.0" in headers["User-Agent"]


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
    assert body["platformStatuses"] == [
        {"platformId": "ao3", "label": "AO3", "status": "success", "itemCount": 1, "warning": None, "translatedQuery": "fanfiction"},
        {"platformId": "waterwriter", "label": "在水裡寫字", "status": "blocked", "itemCount": 0, "warning": "[水裡寫字] Triggered Challenge, skipping cleanly", "translatedQuery": "fanfiction"},
    ]


def test_taiwan_platforms_are_registered_and_constrained_to_trusted_hosts():
    assert "waterwriter" in SCRAPERS
    assert "penana" in SCRAPERS
    assert main.canonical_platforms(["waterwriter", "penana"]) == ["waterwriter", "penana"]
    assert main.is_real_platform_url("https://slashtw.space/forum.php?mod=viewthread&tid=24680", "在水裡寫字")
    assert main.is_real_platform_url("https://www.penana.com/story/205687", "Penana")
    assert not main.is_real_platform_url("https://example.com/story/205687", "Penana")
