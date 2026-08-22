import asyncio
import sys
from dataclasses import replace
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reader import ReaderRequestError, ReaderUnavailableError, _is_protection_page, _normalize_ao3_url, extract_reader_document, read_public_work, source_for_reader_url
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


def test_ao3_reader_uses_work_header_for_title_author_and_full_chapter_menu():
    html = """
    <html><head><meta property='og:title' content='Archive of Our Own' /><meta name='author' content='Organization for Transformative Works' /></head><body>
      <h2 class='title heading'>  正確的 AO3 作品標題  </h2>
      <h3 class='byline heading'>by <a rel='author' href='/users/orphan_account'>orphan_account</a></h3>
      <select id='selected_id'><option value='301'>第 1 章</option><option value='302'>第 2 章</option></select>
      <div id='chapters'><h3 class='title heading'>第 1 章</h3><div class='userstuff'><p>AO3 正文。</p></div></div>
    </body></html>
    """

    document = extract_reader_document("https://archiveofourown.org/works/100", html)

    assert document.title == "正確的 AO3 作品標題"
    assert document.author == "orphan_account"
    assert document.chapter_title == "第 1 章"
    assert [entry.title for entry in document.table_of_contents] == ["第 1 章", "第 2 章"]


def test_reader_rejects_untrusted_hosts_before_any_public_page_request():
    with pytest.raises(ReaderRequestError):
        source_for_reader_url("https://example.com/not-a-supported-work")


def test_reader_accepts_the_current_public_waterwriter_host():
    assert source_for_reader_url("https://waterfall.slashx.space/thread/90144") == "在水裡寫字"


def test_ao3_reader_uses_public_adult_view_query_without_user_cookie_handling():
    assert _normalize_ao3_url("https://archiveofourown.org/works/42") == "https://archiveofourown.org/works/42?view_adult=true"
    assert _normalize_ao3_url("https://archiveofourown.org/chapters/43?view_full_work=true") == "https://archiveofourown.org/chapters/43?view_full_work=true&view_adult=true"
    assert _normalize_ao3_url("https://archiveofourown.org/works/42", full_work=True) == "https://archiveofourown.org/works/42?view_adult=true&view_full_work=true"


def test_ao3_work_landing_page_returns_all_public_chapters_for_local_switching(monkeypatch):
    work_url = "https://archiveofourown.org/works/100"
    full_work_html = """
    <html><body><h2 class='title heading'>完整 AO3 作品</h2><h3 class='byline heading'><a>測試作者</a></h3>
    <select id='selected_id'><option value='301'>第一章</option><option value='302'>第二章</option></select>
    <div id='chapters'>
      <div class='chapter'><h3 class='title'>第一章</h3><div class='userstuff'><p>第一章正文。</p></div></div>
      <div class='chapter'><h3 class='title'>第二章</h3><div class='userstuff'><p>第二章正文。</p></div></div>
    </div></body></html>
    """
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        return full_work_html

    monkeypatch.setattr("reader.fetch_public_work_html", fake_fetch)

    document = asyncio.run(read_public_work(work_url))

    assert calls == ["https://archiveofourown.org/works/100?view_adult=true&view_full_work=true"]
    assert [entry.title for entry in document.table_of_contents] == ["第一章", "第二章"]
    assert [paragraphs for _, paragraphs in document.all_chapters] == [["第一章正文。"], ["第二章正文。"]]


def test_reader_does_not_mistake_a_normal_cloudflare_asset_reference_for_a_challenge_page():
    public_html = "<html><script src='https://cdnjs.cloudflare.com/example.js'></script><main>公開正文。</main></html>"

    assert not _is_protection_page(public_html)
    assert _is_protection_page("<html><div class='cf-chl-widget'>請完成驗證</div></html>")


def test_reader_endpoint_returns_one_explicitly_attributed_clean_chapter(monkeypatch):
    async def fake_read(_url, _chapter_url=None):
        return extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML)

    monkeypatch.setattr("main.read_public_work", fake_read)
    response = TestClient(app).post("/reader", json={"url": "https://archiveofourown.org/works/42"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "AO3"
    assert payload["chapters"][0]["paragraphs"] == ["第一段公開正文。", "第二段公開正文。"]


def test_reader_endpoint_preserves_optional_series_context(monkeypatch):
    async def fake_read(_url, _chapter_url=None):
        return replace(extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML), series_title="測試系列")

    monkeypatch.setattr("main.read_public_work", fake_read)
    response = TestClient(app).post("/reader", json={"url": "https://archiveofourown.org/works/42"})

    assert response.status_code == 200
    assert response.json()["seriesTitle"] == "測試系列"


def test_reader_api_prefix_alias_matches_the_desktop_root_path(monkeypatch):
    async def fake_read(_url, _chapter_url=None):
        return extract_reader_document("https://archiveofourown.org/works/42", PUBLIC_WORK_HTML)

    monkeypatch.setattr("main.read_public_work", fake_read)

    response = TestClient(app).post("/api/reader", json={"url": "https://archiveofourown.org/works/42"})

    assert response.status_code == 200
    assert response.json()["chapters"][0]["title"] == "第一章"


@pytest.mark.parametrize(
    ("url", "html", "expected_source", "expected_text"),
    [
        (
            "https://slashtw.space/forum.php?mod=viewthread&tid=90144",
            "<html><h1>水裡主樓</h1><td id='postmessage_90144'><p>首樓正文保留。</p><div class='sign'>簽名檔不保留。</div></td><div class='reply'><p>回覆不保留。</p></div></html>",
            "在水裡寫字",
            "首樓正文保留。",
        ),
        (
            "https://archiveofourown.org/works/42",
            "<html><h1>AO3 作品</h1><div id='chapters'><div class='userstuff'><p>AO3 正文保留。</p></div></div></html>",
            "AO3",
            "AO3 正文保留。",
        ),
        (
            "https://www.penana.com/story/42",
            "<html><h1>Penana 作品</h1><div class='issue-content'><p>Penana 正文保留。</p></div></html>",
            "Penana",
            "Penana 正文保留。",
        ),
        (
            "https://www.cxc.today/novel/42",
            "<html><h1>CxC 作品</h1><article><div class='article-content'><p>CxC 正文保留。</p></div></article></html>",
            "CxC 創利市集",
            "CxC 正文保留。",
        ),
    ],
)
def test_reader_uses_source_specific_public_content_selectors(url, html, expected_source, expected_text):
    document = extract_reader_document(url, html)

    assert document.source == expected_source
    assert expected_text in document.paragraphs
    assert "簽名檔不保留。" not in document.paragraphs


def test_reader_uses_text_density_fallback_when_common_container_selectors_miss():
    html = """
    <html><head><title>一般公開頁</title></head><body>
      <div class='site-shell'>選單</div>
      <div class='unusual-prose'><span>第一段足夠長的公開正文，供可讀性降級辨識。</span><br/><br/>
        <span>第二段同樣屬於公開作品正文，而不是導覽或頁尾。</span></div>
    </body></html>
    """

    document = extract_reader_document("https://doujin.com.tw/books/info/42", html)

    assert any("第一段足夠長" in paragraph for paragraph in document.paragraphs)


def test_reader_prefers_discuz_style_newline_prose_over_a_short_author_paragraph():
    html = """
    <html><body><td id="postmessage_90144"><p>作者：m19910228</p>
    第一段以純文字換行呈現的首樓正文，應優先保留。

    第二段同樣是公開作品內容，不應在作者資訊後被截斷。</td></body></html>
    """

    document = extract_reader_document("https://slashtw.space/forum.php?mod=viewthread&tid=90144", html)

    assert "作者：m19910228" not in document.paragraphs
    assert any("第一段以純文字換行" in paragraph for paragraph in document.paragraphs)


def test_waterwriter_keeps_all_original_poster_floors_as_chapters_even_after_a_reply():
    html = """
    <html><head><meta name="author" content="原作者" /></head><body>
      <div id="post_1"><div class="authi"><a>原作者</a></div><td id="postmessage_1"><p>第一樓正文。</p></td></div>
      <div id="post_2"><div class="authi"><a>原作者</a></div><td id="postmessage_2"><p>第二樓續章。</p></td></div>
      <div id="post_3"><div class="authi"><a>讀者</a></div><td id="postmessage_3"><p>讀者留言不應收錄。</p></td></div>
      <div id="post_4"><div class="authi"><a>原作者</a></div><td id="postmessage_4"><p>第三樓續章也應保留。</p></td></div>
    </body></html>
    """
    from reader import _waterwriter_document

    first = _waterwriter_document("https://slashtw.space/forum.php?mod=viewthread&tid=42", html)
    second = _waterwriter_document("https://slashtw.space/forum.php?mod=viewthread&tid=42#floor-2", html)

    assert first.paragraphs == ["第一樓正文。"]
    assert [entry.title for entry in first.table_of_contents] == ["第 1 樓", "第 2 樓", "第 4 樓"]
    assert second.current_chapter_index == 1
    assert second.paragraphs == ["第二樓續章。"]


def test_waterwriter_ssr_floor_attributes_keep_all_owner_chapters_and_line_breaks():
    html = """
    <html><head><meta name='author' content='原作者' /></head><body>
      <article data-floor='1' data-author='原作者'><div data-role='content'><p>第一樓正文。</p></div></article>
      <article data-floor='2' data-author='讀者'><div data-role='content'><p>讀者留言不應收錄。</p></div></article>
      <article data-floor='3' data-author='原作者'><div data-role='content'><p>第三樓續章。<br/>仍是同一段。</p></div></article>
    </body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://waterfall.slashtw.space/thread/92521", html)

    assert [entry.title for entry in document.table_of_contents] == ["第 1 樓", "第 3 樓"]
    assert document.paragraphs == ["第一樓正文。"]
    continuation = _waterwriter_document("https://waterfall.slashtw.space/thread/92521#floor-3", html)
    assert continuation.paragraphs == ["第三樓續章。\n仍是同一段。"]


def test_waterwriter_keeps_every_rich_text_line_in_a_single_long_first_floor():
    html = """
    <html><head><meta name="author" content="原作者" /></head><body>
      <div id="post_1"><div class="authi"><a>原作者</a></div>
        <td id="postmessage_1"><div>開頭完整保留。<br/>這段期間真是辛苦你了。</div>
        <p>中段也不能因為節點數量而遺失。</p><div>這是自我催眠後得出的結果。</div>
        <div class="sign">簽名檔不應保留。</div></td>
      </div>
    </body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://slashtw.space/forum.php?mod=viewthread&tid=90144", html)
    rendered = "\n".join(document.paragraphs)

    assert "這段期間真是辛苦你了。" in rendered
    assert "這是自我催眠後得出的結果。" in rendered
    assert "簽名檔不應保留。" not in rendered


def test_waterwriter_keeps_public_collapsed_details_content_without_duplicating_nested_prose():
    html = """
    <html><head><meta name="author" content="原作者" /></head><body>
      <div id="post_1"><div class="authi"><a>原作者</a></div><td id="postmessage_1">
        <p>開頭正文。</p><details><summary>展開後續</summary><p>折疊區內的完整正文。</p></details><p>結尾正文。</p>
      </td></div>
    </body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://waterfall.slashtw.space/thread/90144", html)

    assert document.paragraphs.count("折疊區內的完整正文。") == 1
    assert document.paragraphs == ["開頭正文。", "折疊區內的完整正文。", "結尾正文。"]


def test_penana_preserves_br_delimited_public_issue_text():
    html = "<html><div class='issue-content'>第一段 Penana 正文。<br/>第二段 Penana 正文。</div></html>"
    document = extract_reader_document("https://www.penana.com/story/42/issue/1", html)
    assert document.paragraphs == ["第一段 Penana 正文。", "第二段 Penana 正文。"]


def test_penana_uses_only_the_innermost_issue_container_without_duplicate_prose():
    html = """<html><div class='content_holder'><div class='issue-content'><p>第一段唯一正文。</p><p>第二段唯一正文。</p></div></div></html>"""

    document = extract_reader_document("https://www.penana.com/story/157645/issue/1", html)

    assert document.paragraphs == ["第一段唯一正文。", "第二段唯一正文。"]


def test_kadokado_book_uses_public_catalogue_to_open_first_free_chapter(monkeypatch):
    calls = []

    async def fake_kadokado_api(path):
        calls.append(path)
        if path == "v2/titles/80718":
            return {"displayName": "公開 KadoKado 作品", "ownerDisplayName": "測試作者"}
        if path == "v1/work/collection-episode?titleId=80718":
            return [{"id": "120765-null"}]
        if path == "v2/collection/withIsPurchased?publishedOnly=true&collectionId=120765":
            return [{"id": 797041, "sequenceNum": 1, "displayName": "第壹章", "free": True}, {"id": 797104, "sequenceNum": 2, "displayName": "第貳章", "free": True}]
        if path == "v2/chapter/797041":
            return {"content": "<p>第一段 KadoKado 正文。</p><p>第二段 KadoKado 正文。</p>"}
        raise AssertionError(path)

    monkeypatch.setattr("reader._kadokado_public_json", fake_kadokado_api)

    document = asyncio.run(read_public_work("https://www.kadokado.com.tw/book/80718"))

    assert calls[-1] == "v2/chapter/797041"
    assert document.url == "https://www.kadokado.com.tw/chapter/797041?titleId=80718"
    assert [entry.title for entry in document.table_of_contents] == ["第壹章", "第貳章"]
    assert document.paragraphs == ["第一段 KadoKado 正文。", "第二段 KadoKado 正文。"]


def test_penana_story_home_uses_first_public_issue_and_removes_hidden_copy_protection_noise(monkeypatch):
    story_url = "https://www.penana.com/story/195625/demo-story"
    issue_url = "https://www.penana.com/story/195625/demo-story/issue/1"
    story_html = f"<html><h1>Penana 故事</h1><li class='issue_li'><a href='{issue_url}'>第一章</a></li><button>開始閱讀</button><a>義忍</a></html>"
    issue_html = """
    <html><div class='issue-content'><span style='display: none'>不可見干擾文字</span>
    <p>第一段乾淨正文。</p><p>123Please respect copyright. P E N A N A</p>
    <p>463Please respect copyright.ＰＥＮＡＮＡi8wcHGybPc</p>
    <p>第二段乾淨正文。copyright protection42</p></div></html>
    """
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        return story_html if url == story_url else issue_html

    monkeypatch.setattr("reader.fetch_public_work_html", fake_fetch)

    document = asyncio.run(read_public_work(story_url))

    assert calls == [story_url, issue_url]
    assert document.url == issue_url
    assert document.paragraphs == ["第一段乾淨正文。", "第二段乾淨正文。"]
    assert [entry.url for entry in document.table_of_contents] == [issue_url]


def test_penana_direct_issue_keeps_the_complete_story_table_of_contents(monkeypatch):
    story_url = "https://www.penana.com/story/195625/demo-story"
    issue_one = f"{story_url}/issue/1"
    issue_two = f"{story_url}/issue/2"
    story_html = f"<html><h1>Penana 故事</h1><ul><li class='issue_li'><a href='{issue_one}'>第一章</a></li><li class='issue_li'><a href='{issue_two}'>第二章</a></li></ul></html>"
    issue_html = "<html><div class='issue-content'><p>第二章對話。<br/>下一行仍屬同一段。</p><p>另一個自然段落。</p></div></html>"
    calls = []

    async def fake_fetch(url):
        calls.append(url)
        return story_html if url == story_url else issue_html

    monkeypatch.setattr("reader.fetch_public_work_html", fake_fetch)

    document = asyncio.run(read_public_work(issue_two))

    assert calls == [issue_two, story_url]
    assert [entry.title for entry in document.table_of_contents] == ["第一章", "第二章"]
    assert document.current_chapter_index == 1
    assert document.paragraphs == ["第二章對話。\n下一行仍屬同一段。", "另一個自然段落。"]


def test_penana_table_of_contents_omits_public_engagement_counters():
    html = "<html><li class='issue_li'><a href='/story/88/issue/1'>#1 第一章 0 喜歡 461 閱讀 0 留言 ☰</a></li><div class='issue-content'><p>正文。</p></div></html>"

    document = extract_reader_document("https://www.penana.com/story/88/issue/1", html)

    assert [entry.title for entry in document.table_of_contents] == ["第一章"]


def test_waterwriter_preserves_p_and_br_boundaries_on_the_current_public_host():
    html = """
    <html><head><meta name='author' content='原作者' /></head><body><article>
    <div class='t_f'><p>第一段保持獨立。</p><p>第二段保留換行。<br/>仍是第二段內容。</p>
    <div>這是自我催眠後得出的結果。</div></div></article></body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://waterfall.slashtw.space/thread/90144", html)

    assert "第一段保持獨立。" in document.paragraphs
    assert "第二段保留換行。\n仍是第二段內容。" in document.paragraphs
    assert "這是自我催眠後得出的結果。" in document.paragraphs


def test_waterwriter_ssr_article_keeps_br_delimited_long_form_text_and_tail():
    html = """
    <html><body><article><p>這是一樓的第一段。<br/>這是一樓的第二行。<br/>
    這段期間真是辛苦你了。<br/>這是自我催眠後得出的結果。</p></article></body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://waterfall.slashtw.space/thread/90144", html)

    assert document.paragraphs == ["這是一樓的第一段。\n這是一樓的第二行。\n這段期間真是辛苦你了。\n這是自我催眠後得出的結果。"]


def test_waterwriter_uses_public_uid_to_keep_contiguous_owner_self_replies():
    html = """
    <html><body>
      <div id='post_1'><div class='authi'><a href='home.php?mod=space&uid=42'>原作者</a></div><td id='postmessage_1'><p>第一樓正文。</p></td></div>
      <div id='post_2'><div class='authi'><a data-uid='42'>改名後作者</a></div><td id='postmessage_2'><p>第二樓續章。</p></td></div>
      <div id='post_3'><div class='authi'><a data-uid='99'>讀者</a></div><td id='postmessage_3'><p>讀者留言。</p></td></div>
    </body></html>
    """
    from reader import _waterwriter_document

    document = _waterwriter_document("https://waterfall.slashtw.space/thread/90144", html)

    assert [entry.title for entry in document.table_of_contents] == ["第 1 樓", "第 2 樓"]
    assert document.paragraphs == ["第一樓正文。"]


def test_waterwriter_public_thread_api_splits_every_owner_post_into_reader_chapters(monkeypatch):
    payload = {
        "thread": {"authorid": 94701, "subject": "公開連載"},
        "posts": [
            {"pid": 1, "authorid": 94701, "position": 1, "content": "<p>第一樓前言。</p>"},
            {"pid": 2, "authorid": 94701, "position": 2, "content": "<p>第二樓正文。</p>"},
            {"pid": 3, "authorid": 99, "position": 3, "content": "<p>讀者留言不得收錄。</p>"},
            {"pid": 4, "authorid": 94701, "position": 4, "content": "<p>第四樓續章。<br/>保留原始換行。</p>"},
        ],
    }
    calls = []

    async def fake_thread_json(path):
        calls.append(path)
        return payload

    monkeypatch.setattr("reader._waterwriter_public_json", fake_thread_json, raising=False)
    from reader import _waterwriter_api_document

    document = asyncio.run(_waterwriter_api_document("https://waterfall.slashtw.space/thread/86226#floor-4"))

    assert calls == ["w/thread/86226"]
    assert [entry.title for entry in document.table_of_contents] == ["第 1 樓", "第 2 樓", "第 4 樓"]
    assert document.current_chapter_index == 2
    assert document.paragraphs == ["第四樓續章。\n保留原始換行。"]
    assert "讀者留言不得收錄。" not in "\n".join(document.paragraphs)


def test_waterwriter_public_thread_api_collects_owner_posts_from_later_pages_and_preloads_every_floor(monkeypatch):
    first_page = {
        "thread": {"authorid": 24885, "subject": "30 樓公開連載", "count": 4},
        "posts": [
            {"pid": 1, "authorid": 24885, "position": 1, "content": "<p>第一樓正文。</p>"},
            {"pid": 2, "authorid": 99, "position": 2, "content": "<p>讀者留言。</p>"},
        ],
    }
    second_page = {
        "thread": {"authorid": 24885, "subject": "30 樓公開連載", "count": 4},
        "posts": [
            {"pid": 3, "authorid": 24885, "position": 3, "content": "<p>第三樓續章。</p>"},
            {"pid": 4, "authorid": 24885, "position": 4, "content": "<p>第四樓續章。</p>"},
        ],
    }
    calls = []

    async def fake_thread_json(path):
        calls.append(path)
        return first_page if path == "w/thread/21886" else second_page

    monkeypatch.setattr("reader._waterwriter_public_json", fake_thread_json, raising=False)
    from reader import _waterwriter_api_document

    document = asyncio.run(_waterwriter_api_document("https://waterfall.slashtw.space/thread/21886#floor-4"))

    assert calls == ["w/thread/21886", "w/thread/21886?page=2"]
    assert [entry.title for entry in document.table_of_contents] == ["第 1 樓", "第 3 樓", "第 4 樓"]
    assert [entry.title for entry, _ in document.all_chapters] == ["第 1 樓", "第 3 樓", "第 4 樓"]
    assert document.current_chapter_index == 2
    assert document.paragraphs == ["第四樓續章。"]


def test_reader_endpoint_serializes_every_ao3_full_work_chapter_for_local_switching(monkeypatch):
    from reader import ExtractedReaderDocument, ReaderChapterEntry

    first = ReaderChapterEntry("chapter-1", "第一章", "https://archiveofourown.org/chapters/1", 1)
    second = ReaderChapterEntry("chapter-2", "第二章", "https://archiveofourown.org/chapters/2", 2)

    async def fake_read(_url, _chapter_url=None):
        return ExtractedReaderDocument(
            url=first.url,
            title="44 章 AO3 作品",
            author="測試作者",
            source="AO3",
            cover_url=None,
            chapter_title=first.title,
            paragraphs=["第一章正文。"],
            table_of_contents=[first, second],
            all_chapters=[(first, ["第一章正文。"]), (second, ["第二章正文。"])],
        )

    monkeypatch.setattr("main.read_public_work", fake_read)
    response = TestClient(app).post("/reader", json={"url": "https://archiveofourown.org/works/84479586"})

    assert response.status_code == 200
    assert [chapter["paragraphs"] for chapter in response.json()["chapters"]] == [["第一章正文。"], ["第二章正文。"]]


@pytest.mark.parametrize(
    ("url", "source"),
    [
        ("https://archiveofourown.org/works/84479586", "AO3"),
        ("https://waterfall.slashtw.space/thread/21886", "在水裡寫字"),
        ("https://www.penana.com/story/157645/issue/1", "Penana"),
        ("https://home.gamer.com.tw/creationDetail.php?sn=6229601", "巴哈姆特創作大廳"),
        ("https://www.kadokado.com.tw/book/80718", "KadoKado 角角者"),
    ],
)
def test_reader_endpoint_returns_a_nonempty_chapter_array_for_each_supported_public_source(monkeypatch, url, source):
    from reader import ExtractedReaderDocument, ReaderChapterEntry

    entry = ReaderChapterEntry("chapter-1", "全一話", url, 1)

    async def fake_read(request_url, _chapter_url=None):
        return ExtractedReaderDocument(
            url=request_url,
            title="公開測試作品",
            author="公開測試作者",
            source=source,
            cover_url=None,
            chapter_title=entry.title,
            paragraphs=["可讀取的公開正文。"],
            table_of_contents=[entry],
        )

    monkeypatch.setattr("main.read_public_work", fake_read)
    response = TestClient(app).post("/api/reader", json={"url": url})

    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == source
    assert payload["chapters"] == [{"id": "chapter-1", "title": "全一話", "index": 1, "url": url, "paragraphs": ["可讀取的公開正文。"]}]


def test_penana_discards_ip_watermark_tail_and_repeated_body_after_fin():
    html = """
    <html><div class='content_holder'><div class='issue-content'>
      <p>第一段唯一正文。</p><p>Fin.</p>
      <p>ns196.189.121.135da2 Please respect copyright. P E N A N A</p>
      <p>第一段唯一正文。</p><p>Fin.</p>
    </div></div></html>
    """

    document = extract_reader_document("https://www.penana.com/story/198592/issue/1969479", html)

    assert document.paragraphs == ["第一段唯一正文。", "Fin."]
    rendered = "\n".join(document.paragraphs)
    assert "ns196.189.121.135" not in rendered
    assert rendered.count("第一段唯一正文。") == 1


def test_cxc_uses_anonymous_public_api_for_a_free_readable_section(monkeypatch):
    calls = []

    async def fake_cxc_api(path):
        calls.append(path)
        if path == "store/Tecchan/work/17068":
            return {"name": "公開 CxC 作品", "cover_photo": "https://cxc.today/cover.jpg", "partner": [{"member": {"nickname": "測試創作者"}}]}
        if path == "store/Tecchan/work/17068/section":
            return {"data": [{"id": 101, "name": "第一章", "is_readable": True}, {"id": 102, "name": "付費章節", "is_readable": False}]}
        if path == "store/Tecchan/work/17068/section/101":
            return {"name": "第一章", "content_hant": "<div>第一段 CxC 正文。<br/>第二段 CxC 正文。</div>"}
        raise AssertionError(path)

    monkeypatch.setattr("reader._cxc_public_api_get", fake_cxc_api)

    document = asyncio.run(read_public_work("https://cxc.today/@Tecchan/work/17068"))

    assert calls == ["store/Tecchan/work/17068", "store/Tecchan/work/17068/section", "store/Tecchan/work/17068/section/101"]
    assert document.author == "測試創作者"
    assert document.paragraphs == ["第一段 CxC 正文。", "第二段 CxC 正文。"]
    assert [chapter.title for chapter in document.table_of_contents] == ["第一章"]


def test_cxc_preserves_source_text_protection_without_attempting_to_decode_it(monkeypatch):
    async def fake_cxc_api(path):
        if path == "store/Tecchan/work/17068":
            return {"name": "公開 CxC 作品", "partner": []}
        if path == "store/Tecchan/work/17068/section":
            return {"data": [{"id": 101, "name": "第一章", "is_readable": True}]}
        if path == "store/Tecchan/work/17068/section/101":
            return {"name": "第一章", "content_hant": "<div>正常\ue001\ue002\ue003</div>"}
        raise AssertionError(path)

    monkeypatch.setattr("reader._cxc_public_api_get", fake_cxc_api)

    with pytest.raises(ReaderUnavailableError, match="字型內容保護"):
        asyncio.run(read_public_work("https://cxc.today/@Tecchan/work/17068"))


def test_bahamut_public_fetch_uses_dedicated_credential_free_preference_flow(monkeypatch):
    class FakeResponse:
        status_code = 200
        text = "<html><div class='article-content main'><div id='article'><p>巴哈公開正文。</p></div></div></html>"

    calls = []

    async def fake_bahamut_get(url):
        calls.append(url)
        return FakeResponse()

    monkeypatch.setattr("reader._bahamut_public_get", fake_bahamut_get)
    from reader import fetch_public_work_html

    html = asyncio.run(fetch_public_work_html("https://home.gamer.com.tw/creationDetail.php?sn=100"))
    document = extract_reader_document("https://home.gamer.com.tw/artwork.php?sn=100", html)

    assert calls == ["https://home.gamer.com.tw/artwork.php?sn=100"]
    assert document.paragraphs == ["巴哈公開正文。"]


@pytest.mark.parametrize(
    ("url", "html", "expected_titles"),
    [
        ("https://archiveofourown.org/works/100", "<h1>AO3 長篇</h1><select id='selected_id'><option value='301'>第一章</option><option value='302'>第二章</option></select><div class='userstuff'><p>正文</p></div>", ["第一章", "第二章"]),
        ("https://www.penana.com/story/100", "<h1>Penana 長篇</h1><ul><li class='issue_li'><a href='/story/100/chapter/1'>第一章</a></li><li class='issue_li'><a href='/story/100/chapter/2'>第二章</a></li></ul><div class='issue-content'><p>正文</p></div>", ["第一章", "第二章"]),
        ("https://home.gamer.com.tw/artwork.php?sn=100", "<h1>巴哈系列</h1><div class='article-list'><a href='artwork.php?sn=100'>第一章</a><a href='artwork.php?sn=101'>第二章</a></div><article><p>正文</p></article>", ["第一章", "第二章"]),
        ("https://www.kadokado.com.tw/book/100", "<h1>角角者</h1><a href='/book/100/chapters/1'>第一章</a><a href='/book/100/chapters/2'>第二章</a><article><p>正文</p></article>", ["第一章", "第二章"]),
        ("https://www.cxc.today/novel/100", "<h1>CxC</h1><div class='chapter-list'><a href='/novel/100/chapter/1'>第一章</a><a href='/novel/100/chapter/2'>第二章</a></div><article class='article-content'><p>正文</p></article>", ["第一章", "第二章"]),
        ("https://www.doujin.com.tw/books/info/100", "<h1>同人誌</h1><article><p>試閱正文</p></article>", ["全一話"]),
    ],
)
def test_public_platform_chapter_tables_are_extracted_or_marked_as_one_shot(url, html, expected_titles):
    document = extract_reader_document(url, html)
    assert [entry.title for entry in document.table_of_contents] == expected_titles


def test_bahamut_previous_and_next_controls_are_not_misidentified_as_chapters():
    html = """
    <h1>巴哈系列</h1><div class='article-content main'><div id='article'><p>公開正文。</p></div></div>
    <div class='ct-btn-box'><a href='artwork.php?sn=99'>上一篇</a><a href='artwork.php?sn=101'>下一篇</a></div>
    """

    document = extract_reader_document("https://home.gamer.com.tw/artwork.php?sn=100", html)

    assert [entry.title for entry in document.table_of_contents] == ["全一話"]
    assert document.current_chapter_index == 0


def test_reader_fetches_pixiv_novel_json_instead_of_dynamic_html(monkeypatch):
    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {
                "error": False,
                "body": {
                    "title": "森林的中心",
                    "userName": "測試繪師",
                    "coverUrl": "https://i.pximg.net/cover.jpg",
                    "seriesTitle": "第一章",
                    "content": "第一段 Pixiv 公開正文。\n\n第二段 Pixiv 公開正文。",
                    "seriesNavData": {
                        "order": 5,
                        "next": {"id": "12298405", "title": "第二章", "order": 6, "available": True},
                    },
                },
            }

    calls = []

    async def fake_public_get(url, headers=None):
        calls.append((url, headers))
        return FakeResponse()

    monkeypatch.setattr("reader._public_get", fake_public_get)

    document = asyncio.run(read_public_work("https://www.pixiv.net/novel/show.php?id=12298402"))

    assert calls[0][0] == "https://www.pixiv.net/ajax/novel/12298402"
    assert calls[0][1]["Referer"].endswith("id=12298402")
    assert document.title == "森林的中心"
    assert document.author == "測試繪師"
    assert document.paragraphs == ["第一段 Pixiv 公開正文。", "第二段 Pixiv 公開正文。"]
    assert document.current_chapter_index == 0
    assert [(entry.index, entry.url) for entry in document.table_of_contents] == [
        (5, "https://www.pixiv.net/novel/show.php?id=12298402"),
        (6, "https://www.pixiv.net/novel/show.php?id=12298405"),
    ]


def test_pixiv_series_payload_returns_all_chapters_and_preserves_dialogue_line_breaks(monkeypatch):
    class FakeResponse:
        status_code = 200

        def __init__(self, payload):
            self.payload = payload

        def json(self):
            return self.payload

    async def fake_public_get(url, headers=None):
        if "/ajax/novel/12298402" in url:
            return FakeResponse({"error": False, "body": {"title": "第二章", "userName": "測試繪師", "content": "對話第一行。\n對話第二行。\n\n[newpage]\n第三段開始。", "seriesId": "7788", "seriesNavData": {"order": 2}}})
        if "/ajax/novel/series/7788/content_titles" in url:
            return FakeResponse({"error": False, "body": [{"id": "separator", "title": "-----", "available": False}, {"id": "12298401", "title": "第一章", "available": True}, {"id": "12298402", "title": "第二章", "available": True}, {"id": "12298403", "title": "第三章", "available": True}]})
        raise AssertionError(url)

    monkeypatch.setattr("reader._public_get", fake_public_get)

    document = asyncio.run(read_public_work("https://www.pixiv.net/novel/show.php?id=12298402"))

    assert [chapter.title for chapter in document.table_of_contents] == ["第一章", "第二章", "第三章"]
    assert document.current_chapter_index == 1
    assert document.paragraphs == ["對話第一行。\n對話第二行。", "第三段開始。"]


def test_cxc_uses_public_content_html_when_hant_content_is_absent(monkeypatch):
    async def fake_cxc_api(path):
        if path == "store/reader/work/12":
            return {"name": "公開 CxC", "partner": [{"member": {"nickname": "作者"}}]}
        if path == "store/reader/work/12/section":
            return {"data": [{"id": 34, "name": "第一章", "is_readable": True}]}
        if path == "store/reader/work/12/section/34":
            return {"name": "第一章", "content_html": "<p>第一段。</p><p>第二段。<br/>自然換行。</p>"}
        raise AssertionError(path)

    monkeypatch.setattr("reader._cxc_public_api_get", fake_cxc_api)

    document = asyncio.run(read_public_work("https://cxc.today/@reader/work/12"))

    assert document.paragraphs == ["第一段。", "第二段。\n自然換行。"]
