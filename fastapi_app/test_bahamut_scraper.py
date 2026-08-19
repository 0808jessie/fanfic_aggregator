import sys
from pathlib import Path
from unittest.mock import patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.bahamut_scraper import BahamutScraper
from scrapers.index import PLATFORM_TIMEOUT_SECONDS, SCRAPERS, classify_platform_status


BAHAMUT_RESULTS = """
<div class="HOME-mainbox1">
  <div class="HOME-mainbox1a"><img src="https://p2.bahamut.com.tw/HOME/creationCover/01/0000000001.JPG" /></div>
  <div class="HOME-mainbox1b">
    <h1><img class="IMG-C08" /><a class="TS1" href="creationDetail.php?sn=24680">【義忍】公開小說</a></h1>
    <span class="ST1">作者：<a href="//home.gamer.com.tw/author">巴哈作者</a>│2026-08-19 07:56:58│巴幣：2│人氣：18</span>
    <p>公開小說摘要...(<a class="BH-txtmore">繼續閱讀</a>)</p>
  </div>
</div>
<div class="HOME-mainbox1">
  <div class="HOME-mainbox1b">
    <h1><img class="IMG-C07" /><a class="TS1" href="creationDetail.php?sn=99999">插畫不應納入</a></h1>
    <span class="ST1">作者：<a>繪師</a>│2026-08-19 08:00:00</span><p>插畫摘要</p>
  </div>
</div>
<div id="BH-pagebtn"><a>1</a><a href="search.php?page=2&amp;keyword=%E7%BE%A9%E5%BF%8D&amp;o=tag&amp;v=3">2</a></div>
"""


def test_bahamut_parser_keeps_only_verified_public_novel_cards():
    items = BahamutScraper().parse_results(BAHAMUT_RESULTS, "義忍")

    assert len(items) == 1
    item = items[0]
    assert item.platform == "巴哈姆特創作大廳"
    assert item.title == "【義忍】公開小說"
    assert item.author == "巴哈作者"
    assert item.url == "https://home.gamer.com.tw/creationDetail.php?sn=24680"
    assert item.coverUrl == "https://p2.bahamut.com.tw/HOME/creationCover/01/0000000001.JPG"
    assert item.updatedAt == "2026-08-19 07:56:58"
    assert item.language == "zh-TW"
    assert "公開小說摘要" in item.summary


def test_bahamut_url_and_pagination_contract_are_public_and_bounded():
    scraper = BahamutScraper()
    assert scraper.build_search_url("義忍", page=2) == "https://home.gamer.com.tw/search.php?page=2&keyword=%E7%BE%A9%E5%BF%8D&o=tag&v=3"
    assert scraper.extract_total_pages(BAHAMUT_RESULTS) == 2
    assert not scraper._is_verified_creation_url("https://example.com/creationDetail.php?sn=24680")
    assert PLATFORM_TIMEOUT_SECONDS["bahamut"] == 12.0
    assert "bahamut" in SCRAPERS


def test_bahamut_http_timeout_and_challenge_page_degrade_without_browser_fallback():
    scraper = BahamutScraper()
    with patch("scrapers.bahamut_scraper.requests.get", side_effect=requests.Timeout("slow public search")):
        payload = scraper.scrape("義忍")
    assert payload == {"items": [], "total_works": 0, "total_pages": 1}
    assert "Public HTTP request unavailable" in (scraper.last_warning or "")

    class BlockedResponse:
        status_code = 403
        text = "<title>Just a moment… Cloudflare</title>"

    with patch("scrapers.bahamut_scraper.requests.get", return_value=BlockedResponse()):
        payload = scraper.scrape("義忍")
    assert payload == {"items": [], "total_works": 0, "total_pages": 1}
    assert classify_platform_status(0, scraper.last_warning) == "blocked"
