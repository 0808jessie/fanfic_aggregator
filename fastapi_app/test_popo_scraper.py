import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.index import PLATFORM_TIMEOUT_SECONDS, SCRAPERS, classify_platform_status
from scrapers.popo_scraper import PopoScraper


POPO_INDEX = '''<form id="header-search-form"><input type="hidden" name="_poporf-tk001" value="public-token" /></form>'''
POPO_RESULTS = '''
<div class="search-book"><div id="BOOK" class="result_list">
  <h3>書本搜尋結果，共找到 <span class="num">1,234</span> 筆資料</h3>
  <div class="box"><div class="left"><a href="/books/718299"><img src="https://cdn0.popo.tw/bc/91/718299/O.jpg" /></a></div><div class="right">
    <a class="bname" href="/books/718299">[鬼滅之刃/義忍]公開書籍</a><a class="author" href="/users/author">POPO 作者</a>
    <dl><dt>最新章回</dt><dd><a>冬日景色 01</a></dd><dt>公開時間</dt><dd>2020-06-28 14:52</dd><dt>書摘</dt><dd><div class="desc">公開作品書摘。</div></dd></dl>
  </div></div>
  <div class="pagenum"><a class="num current">1</a><a class="num">2</a></div>
</div></div>'''


def test_popo_parser_maps_only_verified_public_book_cards():
    items = PopoScraper().parse_results(POPO_RESULTS, "義忍")
    assert len(items) == 1
    item = items[0]
    assert item.platform == "POPO 原創市集"
    assert item.url == "https://www.popo.tw/books/718299"
    assert item.author == "POPO 作者"
    assert item.updatedAt == "2020-06-28 14:52"
    assert item.coverUrl == "https://cdn0.popo.tw/bc/91/718299/O.jpg"
    assert "付費章節依官方為準" in item.tags
    assert PopoScraper.extract_total_works(POPO_RESULTS) == 1234
    assert PopoScraper.extract_total_pages(POPO_RESULTS) == 2


def test_popo_uses_public_token_then_book_only_submission(capsys):
    scraper = PopoScraper()
    index_response = MagicMock(status_code=200, text=POPO_INDEX)
    search_response = MagicMock(status_code=200, text=POPO_RESULTS)
    with patch("scrapers.popo_scraper.curl_requests.Session") as session_factory:
        session = session_factory.return_value.__enter__.return_value
        session.get.return_value = index_response
        session.post.return_value = search_response
        payload = scraper.scrape("義忍", page=2)

    assert payload["total_works"] == 1234
    assert session.post.call_args.args[0] == "https://www.popo.tw/search"
    assert session.post.call_args.kwargs["data"] == {"_poporf-tk001": "public-token", "name": "義忍", "searchtype": "book", "page": "2"}
    assert session.get.call_args.kwargs["timeout"] == 10
    assert session.post.call_args.kwargs["timeout"] == 10
    assert PLATFORM_TIMEOUT_SECONDS["popo"] == 20.0
    assert "popo" in SCRAPERS
    diagnostics = capsys.readouterr().out
    assert "[POPO PublicSearch] stage=index endpoint=https://www.popo.tw/index status=200" in diagnostics
    assert "[POPO PublicSearch] stage=search endpoint=https://www.popo.tw/search status=200" in diagnostics


def test_popo_http_failure_and_protection_degrade_without_access_workarounds():
    scraper = PopoScraper()
    with patch("scrapers.popo_scraper.curl_requests.Session") as session_factory:
        session = session_factory.return_value.__enter__.return_value
        session.get.side_effect = RuntimeError("slow public index")
        assert scraper.scrape("義忍") == {"items": [], "total_works": 0, "total_pages": 1}
    assert "Public HTTP request unavailable" in (scraper.last_warning or "")

    scraper = PopoScraper()
    with patch("scrapers.popo_scraper.curl_requests.Session") as session_factory:
        session = session_factory.return_value.__enter__.return_value
        session.get.return_value = MagicMock(status_code=403, text="<title>Cloudflare</title>")
        assert scraper.scrape("義忍") == {"items": [], "total_works": 0, "total_pages": 1}
    assert classify_platform_status(0, scraper.last_warning) == "blocked"
