from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from scrapers.index import SCRAPERS
from scrapers.penana_scraper import PenanaScraper
from scrapers.waterwriter_scraper import WaterWriterScraper


WATERWRITER_RESULTS = """
<div class="slst">
  <h3><a href="forum.php?mod=viewthread&amp;tid=24680">義忍：水面之下</a></h3>
  <span class="xg1"><a href="home.php?mod=space&amp;uid=12">水滴作者</a> 2026-08-12</span>
  <div class="tag"><a>義忍</a><a>鬼滅之刃</a></div>
</div>
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


def test_taiwan_platforms_are_registered_and_constrained_to_trusted_hosts():
    assert "waterwriter" in SCRAPERS
    assert "penana" in SCRAPERS
    assert main.canonical_platforms(["waterwriter", "penana"]) == ["waterwriter", "penana"]
    assert main.is_real_platform_url("https://slashtw.space/forum.php?mod=viewthread&tid=24680", "在水裡寫字")
    assert main.is_real_platform_url("https://www.penana.com/story/205687", "Penana")
    assert not main.is_real_platform_url("https://example.com/story/205687", "Penana")
