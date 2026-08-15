from pathlib import Path
import sys
from unittest.mock import MagicMock, patch

import requests

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from scrapers.cxc_scraper import CxCScraper, _PublicSearchUnavailable
from constants.cp_tags import get_keyword_for_platform
from models import PlatformStatus
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


def test_cxc_adapter_parses_verified_static_public_work_cards_and_falls_back_to_card_count():
    scraper = CxCScraper()
    with patch.object(scraper, "_fetch_public_api_results", return_value=None), patch.object(
        scraper, "_fetch_public_search_html", return_value=RENDERED_CXC_RESULTS
    ) as fetch_html:
        payload = scraper.scrape("義忍")

    assert fetch_html.call_args.args == ("義忍",)
    assert "/zh/search?" in scraper.build_search_url("義忍")
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
    with patch("scrapers.cxc_scraper.requests.get", return_value=response) as request:
        payload = scraper.scrape("小說")

    assert request.called
    assert payload["total_works"] == 4145
    item = payload["items"][0]
    assert item.title == "《檔案存取中》"
    assert item.author == "碳烤巧克力"
    assert item.url == "https://cxc.today/@grilledchocolate/work/57417"
    assert item.tags == "原創, 小說"
    assert request.call_args.kwargs["timeout"] == (3, 6)


def test_cxc_uses_clean_cp_alias_and_matches_title_tags_or_intro_fields():
    scraper = CxCScraper()
    response = MagicMock()
    response.json.return_value = {
        "code": 0,
        "data": {
            "total": 2,
            "data": [
                {
                    "id": 1,
                    "name": "未標題短篇",
                    "partner": ["創作者"],
                    "hash_tag": ["佐櫻", "火影忍者"],
                    "intro": "以第七班為舞台的作品。",
                    "store": {"url_name": "ninja", "name": "忍者書店"},
                },
                {
                    "id": 2,
                    "name": "無關作品",
                    "partner": ["其他作者"],
                    "hash_tag": ["原創"],
                    "intro": "不含配對描述。",
                    "store": {"url_name": "other", "name": "其他書店"},
                },
            ],
        },
    }
    with patch("scrapers.cxc_scraper.requests.get", return_value=response) as request:
        payload = scraper.scrape("佐櫻")

    params = dict(request.call_args.kwargs["params"])
    assert params["keyword"] == "佐櫻"
    assert payload["total_works"] == 2
    assert [item.title for item in payload["items"]] == ["未標題短篇"]
    assert get_keyword_for_platform("佐櫻", "cxc") == "佐櫻"
    assert CxCScraper.clean_cxc_keyword('"義忍" OR "富岡義勇"') == "義忍 富岡義勇"


def test_cxc_rendered_card_keeps_cp_found_only_in_a_custom_tag_or_intro():
    html = """
    <div class="cxc-card-grid">
      <a class="work-card" href="/@ninja/work/77">
        <div class="cxc-work-card">
          <div class="info__name">未標題短篇</div>
          <div class="info__author">創作者</div>
          <span class="tag">佐櫻</span>
          <p>第七班的故事。</p>
        </div>
      </a>
    </div>
    """
    items = CxCScraper().parse_results(html, "佐櫻")
    assert len(items) == 1
    assert items[0].tags == "佐櫻"


def test_cxc_explicit_api_zero_results_are_successful_empty_not_error():
    scraper = CxCScraper()
    response = MagicMock()
    response.json.return_value = {"code": 0, "data": {"total": 0, "data": []}}
    with patch("scrapers.cxc_scraper.requests.get", return_value=response):
        payload = scraper.scrape("五夏")

    assert payload == {
        "items": [],
        "total_works": 0,
        "total_pages": 1,
        "status": "success",
        "count": 0,
        "message": "無公開結果",
    }
    assert scraper.last_warning is None
    assert classify_platform_status(0, scraper.last_warning) == "empty"


def test_cxc_public_api_timeout_returns_source_warning_without_a_second_http_request():
    scraper = CxCScraper()
    with patch("scrapers.cxc_scraper.requests.get", side_effect=requests.Timeout("slow public API")), patch.object(
        scraper, "_fetch_public_search_html", return_value=None
    ) as fetch_html:
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert "公開 API 連線不可用" in (scraper.last_warning or "")
    fetch_html.assert_not_called()


def test_search_api_preserves_completed_cxc_zero_result_as_live_empty():
    aggregate = {
        "items": [],
        "any_success": True,
        "total_works": 0,
        "total_pages": 1,
        "warnings": [],
        "platform_statuses": [
            PlatformStatus(
                platformId="cxc",
                label="CxC 創利市集",
                status="empty",
                itemCount=0,
                translatedQuery="佐櫻不存在測試CP",
            )
        ],
    }
    with patch("main.parallel_search_platforms", return_value=aggregate):
        response = TestClient(main.app).post(
            "/search",
            json={"keyword": "佐櫻不存在測試CP", "platforms": ["cxc"], "forceRefresh": True},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["source"] == "live"
    assert body["warning"] is None
    assert body["items"] == []
    assert body["platformStatuses"][0]["status"] == "empty"


def test_cxc_adapter_marks_unavailable_static_page_as_retryable_error_without_placeholder_data():
    scraper = CxCScraper()
    with patch.object(scraper, "_fetch_public_api_results", return_value=None), patch.object(
        scraper, "_fetch_public_search_html", return_value=None
    ):
        payload = scraper.scrape("義忍")

    assert payload["items"] == []
    assert payload["total_works"] == 0
    assert "No verified public search result" in (scraper.last_warning or "")
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
    assert translated_query_for_platform("cxc", "義忍") == "義忍"
    assert CxCScraper.is_real_work_url("https://cxc.today/@mori/work/9001")
    assert CxCScraper.is_real_work_url("https://cxc.today/works/giyushino-summer")
    assert not CxCScraper.is_real_work_url("https://cxc.today/zh/search?keyword=%E7%BE%A9%E5%BF%8D")
    assert main.is_real_platform_url("https://cxc.today/@mori/work/9001", "CxC 創利市集")
    assert not main.is_real_platform_url("https://example.com/@mori/work/9001", "CxC 創利市集")
