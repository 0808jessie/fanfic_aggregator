import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.index import PLATFORM_TIMEOUT_SECONDS, SCRAPERS, classify_platform_status
from scrapers.kadokado_scraper import KadoKadoScraper
from main import list_platforms


KADOKADO_RESULTS = '''
<main>
  <a href="/book/72641"><img alt="是誰在制服裡種了花" src="https://img.kadokado.com.tw/cover/72641" />
    <span>是誰在制服裡種了花</span><span>忍</span><span>#都市 #科幻 被植入豹基因的特級探員。</span>
  </a>
  <a href="/book/25945"><img alt="旭夕" src="https://www.kadokado.com.tw/_next/image?url=cover" />
    <span>完結</span><span>旭夕</span><span>义在</span><span>成人向 一段公開作品摘要。</span>
  </a>
  <a href="/chapter/900">不應收錄的章節連結</a>
</main>'''

KADOKADO_API_RESULTS = {
    "current": 1,
    "limit": 20,
    "more": False,
    "total": 2,
    "data": [
        {
            "id": 72641,
            "displayName": "是誰在制服裡種了花",
            "logline": "被植入豹基因的特級探員。",
            "coverUrls": ["https://img.kadokado.com.tw/cover/72641"],
            "tags": ["都市", "科幻"],
            "genreDisplayNames": ["科幻"],
            "isRRated": False,
            "isSerialized": True,
            "authorsDisplayNames": ["忍"],
            "wordCount": 25600,
        },
        {
            "id": 25945,
            "displayName": "旭夕",
            "oneLineIntro": "一段公開作品摘要。",
            "coverUrls": [],
            "tags": ["成人向"],
            "genreDisplayNames": [],
            "isRRated": True,
            "isSerialized": False,
            "ownerDisplayName": "义在",
            "wordCount": 3400,
        },
    ],
}


def test_kadokado_parser_maps_only_verified_public_book_cards():
    items = KadoKadoScraper().parse_results(KADOKADO_RESULTS, "義忍")
    assert len(items) == 2
    assert items[0].url == "https://www.kadokado.com.tw/book/72641"
    assert items[0].platform == "KadoKado 角角者"
    assert items[0].author == "忍"
    assert "#都市" in items[0].tags
    assert items[0].coverUrl == "https://img.kadokado.com.tw/cover/72641"
    assert items[1].isComplete is True
    assert items[1].rating == "R18"


def test_kadokado_public_request_and_protection_degrade_safely(capsys):
    scraper = KadoKadoScraper()
    with patch("scrapers.kadokado_scraper.httpx.get") as request:
        request.return_value = MagicMock(status_code=200, json=lambda: KADOKADO_API_RESULTS)
        payload = scraper.scrape("義忍")
    assert len(payload["items"]) == 2
    assert payload["total_works"] == 2
    assert request.call_args.kwargs["params"] == {"current": 1, "limit": 20, "sentence": "義忍"}
    assert request.call_args.kwargs["timeout"] == 8.0
    assert PLATFORM_TIMEOUT_SECONDS["kadokado"] == 12.0
    assert "kadokado" in SCRAPERS
    assert "[KadoKado PublicSearch] stage=search endpoint=https://api.kadokado.com.tw/v3/search status=200" in capsys.readouterr().out
    assert payload["items"][0].wordCount == "25600"
    assert payload["items"][1].rating == "R18"
    assert payload["items"][1].isComplete is True

    scraper = KadoKadoScraper()
    with patch("scrapers.kadokado_scraper.httpx.get") as request:
        request.return_value = MagicMock(status_code=403)
        assert scraper.scrape("義忍") == {"items": [], "total_works": 0, "total_pages": 1}
    assert classify_platform_status(0, scraper.last_warning) == "blocked"


def test_kadokado_is_listed_by_platform_information_endpoint():
    platforms = list_platforms()
    assert {"id": "kadokado", "label": "KadoKado 角角者", "status": "best-effort"} in platforms
