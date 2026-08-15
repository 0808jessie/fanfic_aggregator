from bs4 import BeautifulSoup
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from constants.cp_tags import CP_TAG_MAP, MULTI_PLATFORM_CP_MAP, get_keyword_for_platform
from scrapers.ao3_scraper import AO3Scraper, extract_ao3_tag_metadata


def test_cp_tag_map_compound_query():
    assert "Tomioka Giyuu/Kochou Shinobu" in CP_TAG_MAP.get("義忍")
    assert "OR" in CP_TAG_MAP.get("義忍")
    assert "Gojo Satoru/Geto Suguru" in CP_TAG_MAP.get("五夏")


def test_cp_query_translator_uses_ao3_and_local_values_without_mutating_free_text():
    assert MULTI_PLATFORM_CP_MAP["義忍"].ao3_query == '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"'
    assert get_keyword_for_platform("義忍", "ao3") == '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"'
    assert get_keyword_for_platform("義忍", "local") == "義忍 富岡義勇 胡蝶忍"
    assert get_keyword_for_platform("自訂關鍵字", "ao3") == "自訂關鍵字"
    assert get_keyword_for_platform("自訂關鍵字", "local") == "自訂關鍵字"


def test_trope_query_translator_uses_platform_specific_worldbuilding_terms():
    assert get_keyword_for_platform("歐米茄", "ao3") == '"Alpha/Beta/Omega Dynamics"'
    assert get_keyword_for_platform("ABO", "local") == "ABO"
    assert get_keyword_for_platform("哨兵嚮導", "ao3") == '"Sentinel/Guide Dynamics"'
    assert get_keyword_for_platform("哨嚮", "local") == "哨嚮 哨兵嚮導"
    assert get_keyword_for_platform("現背", "ao3") == '"Alternate Universe - Modern Setting"'
    assert get_keyword_for_platform("校園", "cxc") == "學園Paro"
    assert get_keyword_for_platform("雙向暗戀", "local") == "雙向暗戀"


def test_ao3_scraper_methods_exist():
    scraper = AO3Scraper()
    assert hasattr(scraper, "scrape")
    assert scraper.last_total_heading is None


def test_ao3_tag_parser_separates_relationships_and_characters():
    work = BeautifulSoup(
        """
        <li class="work">
          <ul class="tags commas">
            <li class="relationships"><a>富岡義勇/胡蝶忍</a></li>
            <li class="characters"><a>富岡義勇</a></li>
            <li class="characters"><a>胡蝶忍</a></li>
            <li class="freeforms"><a>Post-Canon</a></li>
          </ul>
        </li>
        """,
        "html.parser",
    )

    relationships, characters, other = extract_ao3_tag_metadata(work)

    assert relationships == ["富岡義勇/胡蝶忍"]
    assert characters == ["富岡義勇", "胡蝶忍"]
    assert other == ["Post-Canon"]


def test_compound_query_url_construction_logic():
    keyword = "義忍"
    query_to_use = CP_TAG_MAP.get(keyword.strip())
    assert query_to_use is not None
    
    search_url = AO3Scraper.build_search_url(query_to_use)
    
    assert "work_search%5Bquery%5D=" in search_url
    assert "commit=Search" in search_url
    assert "with_real_author_name=1" in search_url
    assert "language_id" not in search_url
    assert "complete" not in search_url
    assert "Tomioka" in search_url
    assert "OR" in search_url


def test_native_ao3_query_url_uses_official_first_page_shape_and_explicit_pagination():
    first_page = AO3Scraper.build_search_url("鬼滅")
    later_page = AO3Scraper.build_search_url("鬼滅", page=3)

    assert first_page.startswith("https://archiveofourown.org/works/search?commit=Search&work_search%5Bquery%5D=")
    assert "%E9%AC%BC%E6%BB%85" in first_page
    assert "page=" not in first_page
    assert later_page.endswith("&page=3")


def test_ao3_adult_content_cookie_and_open_search_parameters_are_explicit():
    assert AO3Scraper.adult_content_cookie == {
        "name": "view_adult",
        "value": "true",
        "domain": "archiveofourown.org",
        "path": "/",
    }
    url = AO3Scraper.build_search_url("義忍")
    assert "with_real_author_name=1" in url
    assert "language_id" not in url
    assert "complete" not in url
    assert AO3Scraper.static_cookies == {"view_adult": "true", "accepted_tos": "2018"}
    assert AO3Scraper.static_headers["Cookie"] == "view_adult=true; accepted_tos=2018"
    assert "Chrome/124" in AO3Scraper.static_headers["User-Agent"]
    assert AO3Scraper.static_connect_timeout_seconds == 5
    assert AO3Scraper.static_read_timeout_seconds == 10
    assert AO3Scraper.static_search_budget_seconds == 10


def test_ao3_total_works_reads_only_explicit_result_heading():
    soup = BeautifulSoup(
        """
        <h2 class="heading">1 - 20 of 15,420 Works in 鬼滅</h2>
        <div>999,999 Works Found in unrelated body content</div>
        """,
        "html.parser",
    )

    assert AO3Scraper.extract_total_works_from_heading(soup) == 15420
    assert AO3Scraper.extract_total_works_heading(soup) == ("1 - 20 of 15,420 Works in 鬼滅", 15420)
    h3_result = BeautifulSoup('<main id="main"><h3>35 Works Found</h3></main>', "html.parser")
    assert AO3Scraper.extract_total_works_heading(h3_result) == ("35 Works Found", 35)
    current_heading = BeautifulSoup('<h2 class="heading">311,063 Found ?</h2>', "html.parser")
    assert AO3Scraper.extract_total_works_heading(current_heading) == ("311,063 Found ?", 311063)
    assert AO3Scraper.extract_total_works_from_heading(BeautifulSoup("<p>15,420 Works Found</p>", "html.parser")) is None


def test_ao3_static_html_path_parses_cards_and_official_heading_without_browser():
    static_html = """
    <h2 class="heading">1 - 20 of 51,428 Works</h2>
    <li class="work blurb">
      <h4 class="heading"><a href="/works/42001">Static AO3 Story</a><a rel="author">Static Author</a></h4>
      <blockquote class="userstuff">Public summary</blockquote>
      <ul class="tags"><li class="relationships">A/B</li><li class="characters">A</li></ul>
      <dd class="words">1,024</dd><p class="datetime">14 Aug 2026</p><dd class="status">Completed</dd>
    </li>
    """
    response = MagicMock(status_code=200, text=static_html)
    response.raise_for_status.return_value = None
    scraper = AO3Scraper()

    with patch("scrapers.ao3_scraper.requests.get", return_value=response) as get:
        payload = scraper.scrape("花", force_refresh=True)

    assert payload["total_works"] == 51428
    assert payload["total_pages"] == 2572
    assert payload["items"][0].title == "Static AO3 Story"
    assert payload["items"][0].url == "https://archiveofourown.org/works/42001"
    assert payload["items"][0].relationships == ["A/B"]
    assert get.call_args.kwargs["cookies"] == {"view_adult": "true", "accepted_tos": "2018"}


def test_ao3_boolean_translation_falls_back_to_the_original_keyword():
    scraper = AO3Scraper()
    long_boolean_query = '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"'
    response = MagicMock(status_code=200, text='<h2 class="heading">0 Works Found</h2>')
    response.raise_for_status.return_value = None

    with patch("scrapers.ao3_scraper.get_keyword_for_platform", return_value=long_boolean_query), patch(
        "scrapers.ao3_scraper.requests.get", return_value=response
    ) as get:
        scraper.scrape("蛇戀", force_refresh=True)

    assert "work_search%5Bquery%5D=%E8%9B%87%E6%88%80" in get.call_args.args[0]


def test_ao3_static_protection_returns_bounded_warning_without_browser_fallback():
    blocked_response = MagicMock(status_code=525, text="")
    blocked_response.raise_for_status.return_value = None
    scraper = AO3Scraper()

    with patch("scrapers.ao3_scraper.requests.get", return_value=blocked_response) as get, patch("scrapers.ao3_scraper.time.sleep") as sleep:
        payload = scraper.scrape("鬼滅", force_refresh=True)

    assert payload["items"] == []
    assert "HTTP 525" in (scraper.last_warning or "")
    assert get.call_count == 2
    sleep.assert_called_once_with(0.6)


def test_ao3_retries_one_temporary_525_then_parses_a_recovered_public_response():
    blocked_response = MagicMock(status_code=525, text="")
    static_html = """
    <h2 class="heading">1 - 20 of 21 Works</h2>
    <li class="work blurb"><h4 class="heading"><a href="/works/21">Recovered Work</a><a rel="author">Author</a></h4></li>
    """
    scraper = AO3Scraper()
    recovered_response = MagicMock(status_code=200, text=static_html)
    recovered_response.raise_for_status.return_value = None

    with patch("scrapers.ao3_scraper.requests.get", side_effect=[blocked_response, recovered_response]) as get, patch("scrapers.ao3_scraper.time.sleep") as sleep:
        payload = scraper.scrape("花", force_refresh=True)

    assert payload["items"][0].title == "Recovered Work"
    assert get.call_count == 2
    sleep.assert_called_once_with(0.6)
