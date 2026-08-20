import asyncio
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

from reader import ReaderRequestError, ReaderUnavailableError, _is_protection_page, extract_reader_document, read_public_work, source_for_reader_url
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


def test_reader_accepts_the_current_public_waterwriter_host():
    assert source_for_reader_url("https://waterfall.slashx.space/thread/90144") == "在水裡寫字"


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


def test_waterwriter_splits_only_contiguous_original_poster_floors_into_chapters():
    html = """
    <html><head><meta name="author" content="原作者" /></head><body>
      <div id="post_1"><div class="authi"><a>原作者</a></div><td id="postmessage_1"><p>第一樓正文。</p></td></div>
      <div id="post_2"><div class="authi"><a>原作者</a></div><td id="postmessage_2"><p>第二樓續章。</p></td></div>
      <div id="post_3"><div class="authi"><a>讀者</a></div><td id="postmessage_3"><p>讀者留言不應收錄。</p></td></div>
      <div id="post_4"><div class="authi"><a>原作者</a></div><td id="postmessage_4"><p>非連續自回覆不應自動混入。</p></td></div>
    </body></html>
    """
    from reader import _waterwriter_document

    first = _waterwriter_document("https://slashtw.space/forum.php?mod=viewthread&tid=42", html)
    second = _waterwriter_document("https://slashtw.space/forum.php?mod=viewthread&tid=42#floor-2", html)

    assert first.paragraphs == ["第一樓正文。"]
    assert [entry.title for entry in first.table_of_contents] == ["第 1 章", "第 2 章"]
    assert second.current_chapter_index == 1
    assert second.paragraphs == ["第二樓續章。"]


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


def test_penana_preserves_br_delimited_public_issue_text():
    html = "<html><div class='issue-content'>第一段 Penana 正文。<br/>第二段 Penana 正文。</div></html>"
    document = extract_reader_document("https://www.penana.com/story/42/issue/1", html)
    assert document.paragraphs == ["第一段 Penana 正文。", "第二段 Penana 正文。"]


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


def test_bahamut_article_navigation_places_the_current_work_between_public_previous_and_next_links():
    html = """
    <h1>巴哈系列</h1><div class='article-content main'><div id='article'><p>公開正文。</p></div></div>
    <div class='ct-btn-box'><a href='artwork.php?sn=99'>上一篇</a><a href='artwork.php?sn=101'>下一篇</a></div>
    """

    document = extract_reader_document("https://home.gamer.com.tw/artwork.php?sn=100", html)

    assert [entry.title for entry in document.table_of_contents] == ["上一篇", "巴哈系列", "下一篇"]
    assert document.current_chapter_index == 1
    assert document.table_of_contents[2].url.endswith("sn=101")


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
