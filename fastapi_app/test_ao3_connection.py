from __future__ import annotations

import os
import sys
from time import monotonic
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from scrapers.ao3_scraper import AO3Scraper


def test_ao3_search_url_uses_standard_percent_encoding():
    url = AO3Scraper.build_search_url("義忍 & test")
    assert "work_search%5Bquery%5D=" in url
    assert "%E7%BE%A9%E5%BF%8D+%26+test" in url
    assert "work_search%5Blanguage_id%5D=zh" in AO3Scraper.build_search_url("義忍", language="zh")


def test_ao3_simplifies_boolean_cp_mapping_to_primary_literal():
    assert AO3Scraper.simplify_query('"Uchiha Sasuke/Haruno Sakura" OR "佐櫻"') == "Uchiha Sasuke/Haruno Sakura"


def test_ao3_reuses_one_persistent_http_session():
    scraper = AO3Scraper()
    first_session = scraper._get_http_session()
    second_session = scraper._get_http_session()
    assert first_session is second_session


def test_ao3_session_uses_matching_chrome_120_fingerprint_and_headers():
    class FakeSession:
        def __init__(self):
            self.headers = {}
            self.cookies = {}

    fake_session = FakeSession()
    with patch("scrapers.ao3_scraper.curl_requests.Session", return_value=fake_session) as build_session:
        scraper = AO3Scraper()
        session = scraper._get_http_session()

    assert session is fake_session
    build_session.assert_called_once_with(impersonate="chrome120")
    assert fake_session.headers["User-Agent"].find("Chrome/120") != -1
    assert fake_session.headers["Sec-Ch-Ua"].find('v="120"') != -1
    assert fake_session.cookies["view_adult"] == "true"


def test_ao3_retries_403_once_with_low_frequency_backoff():
    class ForbiddenResponse:
        status_code = 403

    class FakeSession:
        def __init__(self):
            self.calls = 0

        def get(self, url: str, timeout: float):
            self.calls += 1
            return ForbiddenResponse()

    scraper = AO3Scraper()
    fake_session = FakeSession()
    scraper._http_session = fake_session
    scraper._static_deadline = monotonic() + 5

    with patch("scrapers.ao3_scraper.time.sleep") as sleep:
        result = scraper._fetch_static_search_html("義忍", 1)

    assert result is None
    assert fake_session.calls == 2
    sleep.assert_called_once_with(1.8)
    assert scraper._static_terminal_warning == "AO3 靜態搜尋暫時不可用（HTTP 403）"


def test_ao3_verification_page_returns_a_source_warning_without_attempting_to_bypass_it():
    class VerificationResponse:
        status_code = 200
        text = "<html><title>Just a moment…</title></html>"

        def raise_for_status(self):
            return None

    class FakeSession:
        def get(self, url: str, timeout: float):
            return VerificationResponse()

    scraper = AO3Scraper()
    scraper._http_session = FakeSession()
    scraper._static_deadline = monotonic() + 5

    result = scraper._fetch_static_search_html("義忍", 1)

    assert result is None
    assert scraper._static_terminal_warning == "AO3 觸發安全驗證；請使用官方搜尋連結繼續。"
