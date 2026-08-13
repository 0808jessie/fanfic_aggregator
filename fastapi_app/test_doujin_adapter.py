from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.doujin_scraper import DoujinScraper
import main
from scrapers.index import SCRAPERS


class FakeResponse:
    status_code = 200

    text = """
    <article class="book-card">
      <a href="/books/info/70859"><img src="/covers/giyushino.webp" alt="義忍：夏日短篇" />義忍：夏日短篇</a>
      <span class="author">島嶼繪師</span>
      <p class="summary">義忍的全年齡短篇同人誌。</p>
    </article>
    """

    def raise_for_status(self):
        return None


class FakeChallengeResponse:
    status_code = 200
    text = "<html><title>Just a moment...</title><div>Cloudflare</div></html>"

    def raise_for_status(self):
        return None


def test_doujin_adapter_parses_only_matching_verified_book_links():
    with patch("scrapers.doujin_scraper.requests.get", return_value=FakeResponse()) as request:
        payload = DoujinScraper().scrape("義忍")

    request.assert_called_once()
    assert payload["total_works"] == 1
    item = payload["items"][0]
    assert item.platform == "同人誌中心"
    assert item.title == "義忍：夏日短篇"
    assert item.author == "島嶼繪師"
    assert item.url == "https://www.doujin.com.tw/books/info/70859"
    assert item.coverUrl == "https://www.doujin.com.tw/covers/giyushino.webp"


def test_doujin_adapter_isolates_cloudflare_challenge_without_inventing_results():
    with patch("scrapers.doujin_scraper.requests.get", return_value=FakeChallengeResponse()):
        scraper = DoujinScraper()
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert "verification challenge" in (scraper.last_warning or "")


def test_doujin_platform_is_registered_and_uses_a_trusted_host_boundary():
    assert "doujin" in SCRAPERS
    assert main.canonical_platforms(["doujin"]) == ["doujin"]
    assert main.is_real_platform_url("https://www.doujin.com.tw/books/info/70859", "同人誌中心")
    assert not main.is_real_platform_url("https://example.com/books/info/70859", "同人誌中心")
