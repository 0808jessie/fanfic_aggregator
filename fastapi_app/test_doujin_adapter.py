from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.doujin_scraper import DoujinScraper, _PublicListingUnavailable
import main
from scrapers.index import SCRAPERS


RENDERED_BOOK_RESULTS = """
    <article class="book-card">
      <a href="/books/info/70859"><img src="/covers/giyushino.webp" alt="義忍：夏日短篇" />義忍：夏日短篇</a>
      <span class="author">島嶼繪師</span>
      <p class="summary">義忍的全年齡短篇同人誌。</p>
    </article>
"""


def test_doujin_adapter_parses_only_matching_verified_book_links():
    scraper = DoujinScraper()
    with patch.object(scraper, "_render_public_search_html", return_value=RENDERED_BOOK_RESULTS):
        payload = scraper.scrape("義忍")

    headers = scraper.headers
    assert headers["Referer"] == "https://www.doujin.com.tw/"
    assert "Windows NT 10.0" in headers["User-Agent"]
    assert headers["Accept-Language"] == "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
    assert payload["total_works"] == 1
    item = payload["items"][0]
    assert item.platform == "同人誌中心"
    assert item.title == "義忍：夏日短篇"
    assert item.author == "島嶼繪師"
    assert item.url == "https://www.doujin.com.tw/books/info/70859"
    assert item.coverUrl == "https://www.doujin.com.tw/covers/giyushino.webp"


def test_doujin_adapter_isolates_cloudflare_challenge_without_inventing_results():
    scraper = DoujinScraper()
    with patch.object(scraper, "_render_public_search_html", side_effect=_PublicListingUnavailable("Triggered verification page, skipping cleanly")):
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert "Triggered verification page" in (scraper.last_warning or "")
    assert DoujinScraper._is_protected_page("Just a moment... Cloudflare captcha")


def test_doujin_platform_is_registered_and_uses_a_trusted_host_boundary():
    assert "doujin" in SCRAPERS
    assert main.canonical_platforms(["doujin"]) == ["doujin"]
    assert main.is_real_platform_url("https://www.doujin.com.tw/books/info/70859", "同人誌中心")
    assert not main.is_real_platform_url("https://example.com/books/info/70859", "同人誌中心")
