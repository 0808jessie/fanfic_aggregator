import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reader import ReaderRequestError, extract_reader_document, source_for_reader_url
from main import app


PUBLIC_WORK_HTML = """
<html>
  <head><meta property="og:title" content="測試作品" /><meta name="author" content="測試作者" /><meta property="og:image" content="https://images.example.test/cover.jpg" /></head>
  <body>
    <nav>不應保留的導覽</nav>
    <main id="chapters"><h2>第一章</h2><p>第一段公開正文。</p><p>第二段公開正文。</p><footer>不應保留的頁尾</footer></main>
  </body>
</html>
"""


def test_reader_extracts_clean_chapter_paragraphs_with_explicit_source_attribution():
    document = extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML)

    assert document.title == "測試作品"
    assert document.author == "測試作者"
    assert document.source == "AO3"
    assert document.chapter_title == "第一章"
    assert document.paragraphs == ["第一段公開正文。", "第二段公開正文。"]
    assert document.cover_url == "https://images.example.test/cover.jpg"


def test_reader_rejects_untrusted_hosts_before_any_public_page_request():
    with pytest.raises(ReaderRequestError):
        source_for_reader_url("https://example.com/not-a-supported-work")


def test_reader_endpoint_returns_one_explicitly_attributed_clean_chapter(monkeypatch):
    from main import read_public_work

    monkeypatch.setattr("main.read_public_work", lambda _url: extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML))
    response = TestClient(app).post("/reader", json={"url": "https://archiveofourown.org/works/42"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "AO3"
    assert payload["chapters"][0]["paragraphs"] == ["第一段公開正文。", "第二段公開正文。"]


def test_reader_api_prefix_alias_matches_the_desktop_root_path(monkeypatch):
    monkeypatch.setattr("main.read_public_work", lambda _url: extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML))

    response = TestClient(app).post("/api/reader", json={"url": "https://archiveofourown.org/works/42"})

    assert response.status_code == 200
    assert response.json()["chapters"][0]["title"] == "第一章"
