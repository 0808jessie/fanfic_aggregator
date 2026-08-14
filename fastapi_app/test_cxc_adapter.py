from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from scrapers.cxc_scraper import CxCScraper, _PublicSearchUnavailable
from scrapers.index import SCRAPERS, classify_platform_status, translated_query_for_platform


RENDERED_CXC_RESULTS = """
  <div class="cxc-card-grid">
    <a class="work-card" href="/@mori/work/9001">
      <div class="cxc-work-card">
      <img src="/media/giyushino-cover.webp" alt="義忍：夏夜短篇" />
      <div class="info__name">義忍：夏夜短篇</div>
      <div class="info__author">森野</div>
      <span class="tag">小說</span><span class="tag">鬼滅之刃</span>
      </div>
    </a>
  </div>
"""


def test_cxc_adapter_parses_verified_public_work_cards_and_falls_back_to_card_count():
    scraper = CxCScraper()
    with patch.object(scraper, "_fetch_public_api_results", return_value=None), patch.object(
        scraper, "_render_public_search_html", return_value=RENDERED_CXC_RESULTS
    ) as render:
        payload = scraper.scrape("義忍")

    assert render.call_args.args == ("義忍",)
    assert "/zh/explore?" in scraper.build_search_url("義忍")
    assert "is_new&sort_by=updated_at" in scraper.build_search_url("義忍")
    assert "keyword=%E7%BE%A9%E5%BF%8D" in scraper.build_search_url("義忍")
    assert payload["total_works"] == 1
    item = payload["items"][0]
    assert item.platform == "CxC 創利市集"
    assert item.title == "義忍：夏夜短篇"
    assert item.author == "森野"
    assert item.url == "https://cxc.today/@mori/work/9001"
    assert item.coverUrl == "https://cxc.today/media/giyushino-cover.webp"


def test_cxc_prefers_verified_public_api_records_with_creator_work_urls():
    scraper = CxCScraper()
    response = MagicMock()
    response.json.return_value = {
        "code": 0,
        "data": {
            "total": 4145,
            "data": [{
                "id": 57417,
                "name": "《檔案存取中》",
                "partner": ["碳烤巧克力"],
                "hash_tag": ["原創", "小說"],
                "intro": "公開作品摘要",
                "cover_photo": "https://cxc.today/fs/book/57417/coverphoto-sm.jpg",
                "store": {"url_name": "grilledchocolate", "name": "碳烤巧克力"},
            }],
        },
    }
    with patch("scrapers.cxc_scraper.requests.get", return_value=response) as request, patch.object(
        scraper, "_render_public_search_html"
    ) as render:
        payload = scraper.scrape("小說")

    assert request.called
    assert not render.called
    assert payload["total_works"] == 4145
    item = payload["items"][0]
    assert item.title == "《檔案存取中》"
    assert item.author == "碳烤巧克力"
    assert item.url == "https://cxc.today/@grilledchocolate/work/57417"
    assert item.tags == "原創, 小說"


def test_cxc_adapter_marks_unfinished_render_as_retryable_error_without_placeholder_data():
    scraper = CxCScraper()
    with patch.object(scraper, "_fetch_public_api_results", return_value=None), patch.object(
        scraper, "_render_public_search_html", side_effect=_PublicSearchUnavailable("連線逾時或等待渲染逾時（未完成渲染）")
    ):
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert payload["total_works"] == 0
    assert "連線逾時或等待渲染逾時" in (scraper.last_warning or "")
    assert classify_platform_status(0, scraper.last_warning) == "error"


def test_cxc_recognizes_its_public_error_page_as_retryable_not_empty():
    html = "<main>An error happened, please try again later</main>"
    assert CxCScraper.has_public_render_error(html)


def test_cxc_only_treats_an_explicit_no_result_page_as_empty():
    assert CxCScraper.has_explicit_empty_result("<main>沒有搜尋結果</main>")
    assert not CxCScraper.has_explicit_empty_result("<main>All Advanced search</main>")


def test_cxc_is_registered_translated_and_limited_to_trusted_work_urls():
    assert "cxc" in SCRAPERS
    assert main.canonical_platforms(["cxc"]) == ["cxc"]
    assert translated_query_for_platform("cxc", "義忍") == "義忍 富岡義勇 胡蝶忍"
    assert CxCScraper.is_real_work_url("https://cxc.today/@mori/work/9001")
    assert CxCScraper.is_real_work_url("https://cxc.today/works/giyushino-summer")
    assert not CxCScraper.is_real_work_url("https://cxc.today/zh/search?keyword=%E7%BE%A9%E5%BF%8D")
    assert main.is_real_platform_url("https://cxc.today/@mori/work/9001", "CxC 創利市集")
    assert not main.is_real_platform_url("https://example.com/@mori/work/9001", "CxC 創利市集")
