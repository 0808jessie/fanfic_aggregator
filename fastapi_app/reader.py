"""Bounded, public-page reader extraction for Fanfic Atlas.

The reader keeps article text in the response only. It never stores page bodies,
cookies, or verification material, and it only requests known public work hosts.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from typing import Iterable
from urllib.parse import parse_qs, urlencode, urljoin, urlparse, urlunparse

from bs4 import BeautifulSoup, Tag
from curl_cffi import requests


READER_TIMEOUT_SECONDS = 10
WATERWRITER_THREAD_TIMEOUT_SECONDS = 35
PENANA_READER_TIMEOUT_SECONDS = 25
KADOKADO_READER_TIMEOUT_SECONDS = 20
READER_HOSTS: dict[str, str] = {
    "archiveofourown.org": "AO3",
    "penana.com": "Penana",
    "slashtw.space": "在水裡寫字",
    "waterfall.slashx.space": "在水裡寫字",
    "doujin.com.tw": "同人誌中心",
    "cxc.today": "CxC 創利市集",
    "pixiv.net": "Pixiv",
    "gamer.com.tw": "巴哈姆特創作大廳",
    "kadokado.com.tw": "KadoKado 角角者",
}
READER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}
PIXIV_AJAX_HEADERS = {
    **READER_HEADERS,
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.pixiv.net/",
}
BAHAMUT_HEADERS = {
    **READER_HEADERS,
    "Referer": "https://home.gamer.com.tw/",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
}
BAHAMUT_PUBLIC_COOKIES = {"over18": "1", "ckBH_adult": "1"}
CXC_PUBLIC_API_BASE = "https://api.cxc.today"
CXC_PUBLIC_HEADERS = {
    "Accept": "application/json",
    "device": "server",
    "uuid": "56833f18-52ae-4f1f-a3fd-ee5699e03f79",
    "lang": "zh",
    "timezone": "Asia/Taipei",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
}
SOURCE_CONTENT_SELECTORS: dict[str, tuple[str, ...]] = {
    "AO3": ("#chapters .userstuff", "div.userstuff", "#chapters"),
    "在水裡寫字": ("td[id^='postmessage_']", "div.pct .t_f", "div.t_f"),
    "Penana": (".issue-content", ".content_holder", ".story-content"),
    "CxC 創利市集": ("article .article-content", "article .content", "article [class*='content']"),
    "巴哈姆特創作大廳": (".article-content.main #article", ".c-article__content", "div.MSG-list8c", ".article-content"),
}
PENANA_WATERMARK_PATTERN = re.compile(
    r"\d*\s*please\s+respect\s+copyright\.\s*(?:[pＰ]\s*[eＥ]\s*[nＮ]\s*[aＡ]\s*[nＮ]\s*[aＡ])(?:[A-Za-z0-9]{0,24})?",
    re.IGNORECASE,
)
PENANA_COPYRIGHT_PATTERN = re.compile(r"copyright\s+protection\s*\d*", re.IGNORECASE)
PENANA_IP_WATERMARK_PATTERN = re.compile(r"\bns\d{1,3}(?:\.\d{1,3}){3}[A-Za-z0-9._-]*", re.IGNORECASE)
WATERWRITER_THREAD_PATH_PATTERN = re.compile(r"/thread/(?P<thread_id>\d+)")
CXC_WORK_PATH_PATTERN = re.compile(r"/@(?P<store>[^/]+)/work/(?P<work_id>\d+)(?:/reader/(?P<section_id>\d+))?/?$")
KADOKADO_BOOK_PATH_PATTERN = re.compile(r"/book/(?P<title_id>\d+)")
KADOKADO_CHAPTER_PATH_PATTERN = re.compile(r"/chapter/(?P<chapter_id>\d+)")


class ReaderRequestError(ValueError):
    """Raised when an untrusted or malformed source URL reaches the reader."""


class ReaderUnavailableError(RuntimeError):
    """Raised when a public page cannot be read without bypassing its protection."""


@dataclass(frozen=True)
class ExtractedReaderDocument:
    url: str
    title: str
    author: str
    source: str
    cover_url: str | None
    chapter_title: str
    paragraphs: list[str]
    table_of_contents: list["ReaderChapterEntry"] = field(default_factory=list)
    current_chapter_index: int = 0
    series_title: str | None = None
    all_chapters: list[tuple["ReaderChapterEntry", list[str]]] = field(default_factory=list)


@dataclass(frozen=True)
class ReaderChapterEntry:
    id: str
    title: str
    url: str
    index: int


def _normalized_host(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ReaderRequestError("閱讀器只接受公開作品的完整 https:// 來源網址。")
    return (parsed.hostname or "").lower().removeprefix("www.")


def source_for_reader_url(url: str) -> str:
    host = _normalized_host(url)
    for allowed_host, label in READER_HOSTS.items():
        if host == allowed_host or host.endswith(f".{allowed_host}"):
            return label
    raise ReaderRequestError("此來源尚未支援內建閱讀；請改由原始網站閱讀。")


def _normalize_bahamut_url(url: str) -> str:
    """Use Bahamut's public article route instead of its redirecting search route."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host.endswith("gamer.com.tw") and parsed.path.endswith("/creationDetail.php"):
        serial_number = parse_qs(parsed.query).get("sn", [""])[0]
        if serial_number.isdecimal():
            return urlunparse(("https", "home.gamer.com.tw", "/artwork.php", "", urlencode({"sn": serial_number}), parsed.fragment))
    return url


def _normalize_ao3_url(url: str, full_work: bool = False) -> str:
    """Request AO3's documented public adult/full-work view without user cookies."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower().removeprefix("www.")
    if host != "archiveofourown.org" or not re.match(r"^/(?:works|chapters)/\d+", parsed.path):
        return url
    query = parse_qs(parsed.query, keep_blank_values=True)
    query.setdefault("view_adult", ["true"])
    if full_work:
        query.setdefault("view_full_work", ["true"])
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(query, doseq=True), parsed.fragment))


def _is_protection_page(html: str) -> bool:
    sample = html[:12_000].lower()
    # Public sites frequently include harmless Cloudflare asset references in
    # otherwise complete article HTML. Only flag explicit challenge indicators.
    markers = ("cf-chl", "turnstile", "captcha", "verify you are human", "安全驗證", "請完成驗證")
    return any(marker in sample for marker in markers)


async def _public_get(
    url: str,
    headers: dict[str, str] | None = None,
    cookies: dict[str, str] | None = None,
    timeout: int = READER_TIMEOUT_SECONDS,
):
    """Perform one bounded, credential-free browser-profiled public request."""
    async with requests.AsyncSession(impersonate="chrome120", headers=headers or READER_HEADERS) as session:
        return await session.get(url, timeout=timeout, cookies=cookies)


async def _bahamut_public_get(url: str):
    """Warm one public Bahamut session before fetching an article.

    The values are the site's documented-style age preference flags, not a login,
    browser profile export, or verification credential.  No response cookie is
    saved, returned, or reused outside this one bounded request.
    """
    async with requests.AsyncSession(impersonate="chrome120", headers=BAHAMUT_HEADERS) as session:
        try:
            await session.get("https://home.gamer.com.tw/", timeout=READER_TIMEOUT_SECONDS, cookies=BAHAMUT_PUBLIC_COOKIES)
        except Exception:
            # The article request remains the source of truth; a homepage warm-up
            # failure must not block a public article that is otherwise readable.
            pass
        return await session.get(url, timeout=READER_TIMEOUT_SECONDS, cookies=BAHAMUT_PUBLIC_COOKIES)


async def _cxc_public_api_get(path: str) -> dict[str, object]:
    """Read CxC's anonymous public work or free-section API response."""
    try:
        async with requests.AsyncSession(impersonate="chrome120", headers=CXC_PUBLIC_HEADERS) as session:
            response = await session.get(f"{CXC_PUBLIC_API_BASE}/{path.lstrip('/')}", timeout=READER_TIMEOUT_SECONDS)
    except Exception as error:
        raise ReaderUnavailableError("CxC 公開章節資料暫時無法讀取，請稍後再試。") from error
    if response.status_code in {401, 403, 429} or response.status_code >= 500:
        raise ReaderUnavailableError("CxC 要求驗證或暫時拒絕公開讀取；本應用程式不會繞過該保護。")
    if response.status_code >= 400:
        raise ReaderUnavailableError(f"CxC 回傳 HTTP {response.status_code}，目前無法讀取此篇作品。")
    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError) as error:
        raise ReaderUnavailableError("CxC 未回傳可辨識的公開章節資料；請改由原始網站閱讀。") from error
    if not isinstance(payload, dict) or payload.get("code") != 0 or not isinstance(payload.get("data"), dict):
        raise ReaderUnavailableError("CxC 未提供可辨識的公開章節資料；請改由原始網站閱讀。")
    return payload["data"]


async def fetch_public_work_html(url: str) -> str:
    """Fetch one public work with a bounded browser-like request, never credentials."""
    source_for_reader_url(url)
    target_url = _normalize_bahamut_url(_normalize_ao3_url(url))
    try:
        source = source_for_reader_url(target_url)
        response = await (
            _bahamut_public_get(target_url)
            if source == "巴哈姆特創作大廳"
            else _public_get(target_url, timeout=PENANA_READER_TIMEOUT_SECONDS if source == "Penana" else READER_TIMEOUT_SECONDS)
        )
    except Exception as error:  # curl_cffi exposes transport-specific error classes.
        raise ReaderUnavailableError("原始網站暫時無法提供可閱讀的公開內文，請稍後再試。") from error
    if response.status_code in {401, 403, 429} or response.status_code >= 500:
        raise ReaderUnavailableError("原始網站要求驗證或暫時拒絕公開讀取；本應用程式不會繞過該保護。")
    if response.status_code >= 400:
        raise ReaderUnavailableError(f"原始網站回傳 HTTP {response.status_code}，目前無法讀取此篇作品。")
    html = response.text
    if _is_protection_page(html):
        raise ReaderUnavailableError("原始網站顯示安全驗證頁；請改由原始網站閱讀。")
    return html


def _meta_content(soup: BeautifulSoup, selector: str) -> str:
    node = soup.select_one(selector)
    return node.get("content", "").strip() if node else ""


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _first_text(soup: BeautifulSoup, selectors: Iterable[str], fallback: str) -> str:
    for selector in selectors:
        node = soup.select_one(selector)
        if node:
            text = _clean_text(node.get_text(" ", strip=True))
            if text:
                return text
    return fallback


def _ao3_title_and_author(soup: BeautifulSoup) -> tuple[str, str]:
    """Extract AO3's work metadata from its dedicated work header.

    AO3's OpenGraph title can include site-level suffixes, while its generic page
    title is often just ``Archive of Our Own`` on an interstitial.  The visible
    work header is therefore the source of truth whenever it is present.
    """
    title = _first_text(soup, ("h2.title.heading", "#workskin h2.title"), "")
    if not title:
        title = _meta_content(soup, "meta[property='og:title']")
    if title.casefold() in {"archive of our own", "organization for transformative works"}:
        title = ""

    author = _first_text(soup, ("h3.byline.heading a", "h3.byline a", "a[rel='author']"), "")
    if not author:
        author = _first_text(soup, ("h3.byline.heading", ".byline.heading", ".byline"), "")
        author = re.sub(r"^by\s+", "", author, flags=re.IGNORECASE)
    if not author:
        author = _meta_content(soup, "meta[name='author']")
    if author.casefold() in {"archive of our own", "organization for transformative works"}:
        author = ""
    return title or "未命名 AO3 作品", author or "原始作者以 AO3 來源頁為準"


def _content_root(soup: BeautifulSoup, source: str) -> Tag | None:
    selectors = (
        *SOURCE_CONTENT_SELECTORS.get(source, ()),
        "article .chapter-content",
        "article .article-content",
        "article .post-content",
        "main .chapter-content",
        "main .article-content",
        ".reader-content",
        "article",
        "main",
    )
    for selector in selectors:
        candidate = soup.select_one(selector)
        if candidate:
            return candidate
    return None


def _remove_non_article_nodes(root: Tag) -> None:
    for selector in ("script", "style", "nav", "aside", "footer", "form", ".advertisement", ".ads", ".ad", "[role='navigation']"):
        for node in root.select(selector):
            node.decompose()


def _clean_penana_reader_root(root: Tag) -> None:
    """Remove Penana's invisible copy-protection noise from a public issue only."""
    for node in root.select("[hidden], [aria-hidden='true'], [style]"):
        style = str(node.get("style") or "").lower().replace(" ", "")
        if node.has_attr("hidden") or node.get("aria-hidden") == "true" or "display:none" in style or "visibility:hidden" in style:
            node.decompose()
    for text_node in list(root.find_all(string=True)):
        raw_text = str(text_node)
        if PENANA_IP_WATERMARK_PATTERN.search(raw_text):
            # The public page can append an IP-shaped watermark immediately
            # before replaying the whole issue. Mark its nearest prose block so
            # the paragraph reader can stop before the repeated tail.
            parent = text_node.parent
            while parent is not None and parent is not root and parent.name not in {"p", "div", "blockquote", "li"}:
                parent = parent.parent
            if parent is not None and parent is not root:
                parent["data-reader-noise-boundary"] = "true"
        cleaned = PENANA_IP_WATERMARK_PATTERN.sub("", raw_text)
        cleaned = PENANA_WATERMARK_PATTERN.sub("", cleaned)
        cleaned = PENANA_COPYRIGHT_PATTERN.sub("", cleaned)
        if not cleaned.strip():
            text_node.extract()
        elif cleaned != str(text_node):
            text_node.replace_with(cleaned)


def _penana_innermost_reader_root(soup: BeautifulSoup) -> Tag | None:
    """Return one innermost Penana prose container instead of stacking wrappers."""
    selectors = ".issue-content, .content_holder, .story-content"
    candidates = soup.select(selectors)
    leaves = [candidate for candidate in candidates if not candidate.select_one(selectors)]
    return max(leaves or candidates, key=lambda candidate: len(candidate.get_text(" ", strip=True)), default=None)


def _penana_paragraphs_from(root: Tag) -> list[str]:
    """Extract one clean public Penana prose sequence without replaying a body tail."""
    for node in root.select("br"):
        node.replace_with("\n")
    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in root.select("p, div, blockquote, li"):
        if node.has_attr("data-reader-noise-boundary") or node.select_one("[data-reader-noise-boundary='true']"):
            break
        if node.name == "div" and node.select_one("p, div, blockquote, li"):
            continue
        text = re.sub(r"[^\S\r\n]+", " ", node.get_text("\n", strip=True))
        text = re.sub(r"\s*\n\s*", "\n", text).strip()
        if len(text) < 2 or text in seen:
            continue
        seen.add(text)
        paragraphs.append(text)
    if paragraphs:
        return paragraphs
    fallback_text = root.get_text("\n", strip=True)
    if PENANA_IP_WATERMARK_PATTERN.search(fallback_text):
        fallback_text = PENANA_IP_WATERMARK_PATTERN.split(fallback_text, maxsplit=1)[0]
    for line in fallback_text.splitlines():
        text = _clean_text(line)
        if len(text) < 2 or text in seen:
            continue
        seen.add(text)
        paragraphs.append(text)
    return paragraphs


def _paragraphs_from(root: Tag) -> list[str]:
    _remove_non_article_nodes(root)
    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in root.select("br"):
        node.replace_with("\n")
    for node in root.select("p, blockquote, li"):
        # A source-level <br> is an intentional line break (often dialogue), not
        # a whitespace separator.  ReaderView renders this newline with
        # whitespace-pre-line inside one semantic paragraph.
        text = re.sub(r"[^\S\r\n]+", " ", node.get_text("\n", strip=True))
        text = re.sub(r"\s*\n\s*", "\n", text).strip()
        if len(text) < 2 or text in seen or re.match(r"^(作者|發表|閱讀|回覆)[：:]", text):
            continue
        seen.add(text)
        paragraphs.append(text)
    line_paragraphs = [
        line
        for line in (_clean_text(line) for line in root.get_text("\n").splitlines())
        if len(line) >= 2 and not re.match(r"^(作者|發表|閱讀|回覆)[：:]", line)
    ]
    # Discuz-style pages often expose a short author <p> plus the real prose as
    # newline-separated text nodes. Prefer that longer, readable sequence.
    if sum(map(len, line_paragraphs)) > sum(map(len, paragraphs)) + 10:
        return line_paragraphs
    return paragraphs or line_paragraphs


def _paragraphs_from_text(text: str) -> list[str]:
    """Preserve source paragraph boundaries while normalising client-visible whitespace."""
    paragraphs: list[str] = []
    seen: set[str] = set()
    for block in re.split(r"\n\s*\n|\r\n\s*\r\n", text.replace("\r\n", "\n")):
        cleaned = _clean_text(block)
        if len(cleaned) < 2 or cleaned in seen:
            continue
        seen.add(cleaned)
        paragraphs.append(cleaned)
    return paragraphs


def _waterwriter_rich_paragraphs(root: Tag) -> list[str]:
    """Preserve all first-floor rich-text nodes, including bare divs and <br> lines."""
    _remove_non_article_nodes(root)
    for node in root.select("br"):
        node.replace_with("\n")
    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in root.select("p, div, details, blockquote, li"):
        # Container divs repeat text from nested child blocks; only consume leaf
        # blocks and let the complete-root fallback handle plain text nodes.
        if node.name in {"div", "details"} and node.select_one("p, div, details, blockquote, li"):
            continue
        for block in re.split(r"\n\s*\n", node.get_text("\n", strip=True)):
            text = re.sub(r"[^\S\r\n]+", " ", block)
            text = re.sub(r"\s*\n\s*", "\n", text).strip()
            if len(text) < 2 or text in seen or re.match(r"^(作者|發表|閱讀|回覆)[：:]", text):
                continue
            seen.add(text)
            paragraphs.append(text)
    full_text = _paragraphs_from_text(root.get_text("\n", strip=True))
    # Rich public threads commonly use p/div blocks and br nodes for intentional
    # prose rhythm. Once two or more leaf blocks were identified, they are more
    # faithful than the flat-text fallback, which intentionally treats a single
    # newline as ordinary whitespace.
    if len(paragraphs) > 1 or any("\n" in paragraph for paragraph in paragraphs):
        return paragraphs
    return full_text if sum(map(len, full_text)) > sum(map(len, paragraphs)) else paragraphs


def _is_penana_story_home(url: str) -> bool:
    path = urlparse(url).path.lower()
    return path.startswith("/story/") and not re.search(r"/(?:issue|chapter)/", path)


def _is_penana_issue_url(url: str) -> bool:
    return bool(re.search(r"/(?:issue|chapter)/", urlparse(url).path.lower()))


def _penana_story_root_url(url: str) -> str | None:
    """Return a Penana work landing URL for an issue URL without guessing a chapter."""
    parsed = urlparse(url)
    match = re.match(r"^(?P<story>/story/\d+(?:/[^/?#]+)?)", parsed.path, re.IGNORECASE)
    if not match:
        return None
    return urlunparse((parsed.scheme, parsed.netloc, match.group("story"), "", "", ""))


def _cxc_work_reference(url: str) -> tuple[str, str, str | None] | None:
    match = CXC_WORK_PATH_PATTERN.search(urlparse(url).path)
    if not match:
        return None
    return match.group("store"), match.group("work_id"), match.group("section_id")


def _has_cxc_text_protection(value: str) -> bool:
    """Detect the source's private-use font mapping without attempting to decode it."""
    private_use_characters = sum(1 for character in value if "\ue000" <= character <= "\uf8ff")
    return private_use_characters >= 3


def _readability_fallback(soup: BeautifulSoup) -> Tag | None:
    """Pick the most paragraph-dense visible block when a platform selector changes.

    This is intentionally a local HTML heuristic rather than a browser, login or
    verification fallback. It is used only after source-specific public selectors.
    """
    candidates = soup.select("article, main, section, div")
    scored: list[tuple[int, Tag]] = []
    for candidate in candidates:
        _remove_non_article_nodes(candidate)
        paragraphs = _paragraphs_from(candidate)
        if not paragraphs:
            continue
        text_length = sum(len(paragraph) for paragraph in paragraphs)
        if text_length < 40:
            continue
        score = text_length + (len(paragraphs) * 120)
        scored.append((score, candidate))
    return max(scored, key=lambda item: item[0])[1] if scored else None


def _pixiv_novel_id(url: str) -> str:
    parsed = urlparse(url)
    novel_id = parse_qs(parsed.query).get("id", [""])[0]
    if not novel_id.isdecimal():
        raise ReaderUnavailableError("Pixiv 小說網址缺少可辨識的作品 ID；請改由原始網站閱讀。")
    return novel_id


def _same_reader_source(root_url: str, chapter_url: str) -> bool:
    try:
        return source_for_reader_url(root_url) == source_for_reader_url(chapter_url)
    except ReaderRequestError:
        return False


def _toc_entry(url: str, title: str, index: int) -> ReaderChapterEntry:
    return ReaderChapterEntry(id=f"chapter-{index}", title=_clean_text(title) or f"第 {index} 章", url=url, index=index)


def _dedupe_toc(entries: list[ReaderChapterEntry]) -> list[ReaderChapterEntry]:
    seen: set[str] = set()
    result: list[ReaderChapterEntry] = []
    for entry in entries:
        if entry.url in seen:
            continue
        seen.add(entry.url)
        result.append(entry)
    return result


def _waterwriter_owner_name(soup: BeautifulSoup) -> str:
    meta_author = _meta_content(soup, "meta[name='author']")
    if meta_author:
        return meta_author
    author_line = soup.find(string=re.compile(r"^\s*作者[：:]"))
    if author_line:
        return re.sub(r"^\s*作者[：:]\s*", "", str(author_line)).strip()
    return ""


def _waterwriter_identity_values(candidate: Tag) -> set[str]:
    """Collect public author name/UID values exposed by a Discuz floor."""
    values: set[str] = set()
    nodes = [candidate, *candidate.select(".authi a, .author a, .username, [data-username], [data-author], [data-author-name], [data-user-name], [data-uid], [data-user-id], [data-author-id], a[href*='uid=']")]
    for node in nodes:
        for attribute in ("data-username", "data-author", "data-author-name", "data-user-name", "data-uid", "data-user-id", "data-author-id"):
            value = _clean_text(str(node.get(attribute) or ""))
            if value:
                values.add(value.casefold())
        href = str(node.get("href") or "")
        uid = parse_qs(urlparse(href).query).get("uid", [""])[0]
        if uid:
            values.add(uid.casefold())
        text = _clean_text(node.get_text(" ", strip=True))
        if text:
            values.add(text.casefold())
    return values


def _waterwriter_content_root(container: Tag) -> Tag | None:
    """Find an individual public floor's prose without relying on one forum skin."""
    for selector in (
        "td[id^='postmessage_']",
        "div.pct .t_f",
        "div.t_f",
        "[data-post-content]",
        "[data-role='content']",
        ".post-content",
        ".thread-content",
        ".message-content",
        "article",
    ):
        candidate = container.select_one(selector)
        if candidate:
            return candidate
    return container if container.get_text(" ", strip=True) else None


def _waterwriter_floor_nodes(soup: BeautifulSoup, owner: str) -> list[Tag]:
    """Return every public prose floor authored by the original poster.

    Legacy Discuz pages expose `post_*` wrappers.  The current SSR surface uses
    article/data attributes instead, so both structures are accepted.  Reader
    chapters deliberately exclude other readers' replies but retain every later
    original-poster floor even when a discussion reply appears in between.
    """
    candidates = soup.select("[id^='post_'], [data-floor], [data-post-id], [data-thread-floor], .thread-post, .post-item, .floor, .reply-item, .post, [role='article'], article")
    unique: list[Tag] = []
    for candidate in candidates:
        if any(parent is other for parent in candidate.parents for other in candidates):
            continue
        if _waterwriter_content_root(candidate) is not None and candidate not in unique:
            unique.append(candidate)
    owner_identities = {owner.casefold()} if owner else set()
    if unique:
        # First floor is the only authoritative fallback when SSR omitted a
        # meta author. Preserve UID matching for subsequent self-replies.
        owner_identities.update(_waterwriter_identity_values(unique[0]))
    floors: list[Tag] = []
    started = False
    for candidate in unique:
        text = _clean_text(candidate.get_text(" ", strip=True))
        if not text:
            continue
        candidate_identities = _waterwriter_identity_values(candidate)
        owns_floor = bool(owner_identities and candidate_identities.intersection(owner_identities))
        if owner and re.search(rf"作者[：:]\s*{re.escape(owner)}", text, re.IGNORECASE):
            owns_floor = True
        if not candidate_identities and not floors:
            owns_floor = True
        if owns_floor:
            floors.append(candidate)
            started = True
    fallback = soup.select_one("#ssr-content article") or soup.select_one("article")
    return floors or ([fallback] if fallback else [])


def _waterwriter_floor_number(floor: Tag, fallback_index: int) -> int:
    """Prefer the public floor identifier so Reader navigation mirrors the thread."""
    for attribute in ("data-floor", "data-thread-floor", "data-post-id", "id"):
        value = str(floor.get(attribute) or "")
        match = re.search(r"(\d+)(?!.*\d)", value)
        if match:
            return int(match.group(1))
    return fallback_index


def _waterwriter_document(url: str, html: str) -> ExtractedReaderDocument:
    soup = BeautifulSoup(html, "html.parser")
    title = _meta_content(soup, "meta[property='og:title']") or _first_text(soup, ("h1",), "未命名作品")
    author = _waterwriter_owner_name(soup) or _first_text(soup, (".authi a", ".author a"), "原始作者以來源頁為準")
    cover_url = _meta_content(soup, "meta[property='og:image']") or None
    floors = _waterwriter_floor_nodes(soup, author)
    chapters: list[tuple[int, list[str]]] = []
    used_floor_numbers: set[int] = set()
    for ordinal, floor in enumerate(floors, start=1):
        copied = BeautifulSoup(str(floor), "html.parser")
        root = _waterwriter_content_root(copied) or copied
        for node in root.select(".sign, .signature, .reply, .quote, .authi, .pi, .pls"):
            node.decompose()
        paragraphs = _waterwriter_rich_paragraphs(root)
        if paragraphs:
            floor_number = _waterwriter_floor_number(floor, ordinal)
            while floor_number in used_floor_numbers:
                floor_number += 1
            used_floor_numbers.add(floor_number)
            chapters.append((floor_number, paragraphs))
    if not chapters:
        raise ReaderUnavailableError("在水裡寫字未提供可辨識的樓主公開正文；請改由原始網站閱讀。")
    base_url = url.split("#", 1)[0]
    toc = [_toc_entry(f"{base_url}#floor-{floor_number}", f"第 {floor_number} 樓", index) for index, (floor_number, _) in enumerate(chapters, start=1)]
    fragment = urlparse(url).fragment
    requested_fragment = fragment.removeprefix("floor-")
    current_index = next((index for index, (floor_number, _) in enumerate(chapters) if str(floor_number) == requested_fragment), 0)
    return ExtractedReaderDocument(url, title, author, "在水裡寫字", cover_url, toc[current_index].title, chapters[current_index][1], toc, current_index, title if len(toc) > 1 else None)


async def _waterwriter_public_json(path: str) -> object:
    """Read the public thread payload used by the source's own reader route."""
    try:
        async with requests.AsyncSession(
            impersonate="chrome120",
            headers={**READER_HEADERS, "Accept": "application/json, text/plain, */*"},
        ) as session:
            response = await session.get(
                f"https://waterfall.slashtw.space/{path.lstrip('/')}",
                timeout=WATERWRITER_THREAD_TIMEOUT_SECONDS,
            )
    except Exception as error:
        raise ReaderUnavailableError("在水裡寫字公開樓層資料暫時無法讀取，請稍後再試。") from error
    if response.status_code in {401, 403, 429} or response.status_code >= 500:
        raise ReaderUnavailableError("在水裡寫字要求驗證或暫時拒絕公開讀取；本應用程式不會繞過該保護。")
    if response.status_code >= 400:
        raise ReaderUnavailableError(f"在水裡寫字回傳 HTTP {response.status_code}，目前無法讀取此篇作品。")
    try:
        return response.json()
    except (ValueError, json.JSONDecodeError) as error:
        raise ReaderUnavailableError("在水裡寫字未回傳可辨識的公開樓層資料；請改由原始網站閱讀。") from error


async def _waterwriter_api_document(url: str) -> ExtractedReaderDocument:
    """Build chapter navigation from every public original-poster post in a thread."""
    match = WATERWRITER_THREAD_PATH_PATTERN.search(urlparse(url).path)
    if match is None:
        raise ReaderUnavailableError("在水裡寫字網址缺少可辨識的主題 ID；請改由原始網站閱讀。")
    thread_id = match.group("thread_id")
    payload = await _waterwriter_public_json(f"w/thread/{thread_id}")
    record = payload if isinstance(payload, dict) else {}
    posts = record.get("posts") if isinstance(record.get("posts"), list) else []
    thread = record.get("thread") if isinstance(record.get("thread"), dict) else {}
    total_posts = int(thread.get("count") or 0) if str(thread.get("count") or "").isdigit() else 0
    # Short threads currently arrive in one response (including thread/21886's
    # 30 floors). For a paged public payload, request only the advertised
    # remainder and dedupe IDs so an endpoint that ignores `page` cannot replay
    # a floor into the Reader chapter list.
    if total_posts > len(posts) and posts:
        page_size = len(posts)
        known_post_ids = {str(post.get("pid") or post.get("position") or "") for post in posts if isinstance(post, dict)}
        for page in range(2, (total_posts + page_size - 1) // page_size + 1):
            page_payload = await _waterwriter_public_json(f"w/thread/{thread_id}?page={page}")
            page_record = page_payload if isinstance(page_payload, dict) else {}
            page_posts = page_record.get("posts") if isinstance(page_record.get("posts"), list) else []
            added = 0
            for post in page_posts:
                if not isinstance(post, dict):
                    continue
                post_id = str(post.get("pid") or post.get("position") or "")
                if post_id and post_id in known_post_ids:
                    continue
                if post_id:
                    known_post_ids.add(post_id)
                posts.append(post)
                added += 1
            if not added:
                break
    owner_id = str(thread.get("authorid") or thread.get("author_id") or "")
    if not owner_id and posts:
        first_post = posts[0]
        owner_id = str(first_post.get("authorid") or first_post.get("author_id") or "") if isinstance(first_post, dict) else ""
    owner_posts = [
        post
        for post in posts
        if isinstance(post, dict)
        and str(post.get("authorid") or post.get("author_id") or "") == owner_id
        and post.get("invisible") in {None, 0, False}
        and str(post.get("content") or "").strip()
    ]
    if not owner_posts:
        raise ReaderUnavailableError("在水裡寫字未提供可辨識的樓主公開正文；請改由原始網站閱讀。")
    chapters: list[tuple[int, list[str]]] = []
    author = ""
    for ordinal, post in enumerate(owner_posts, start=1):
        content_root = BeautifulSoup(str(post.get("content") or ""), "html.parser")
        for node in content_root.select(".pstatus, .sign, .signature, .reply, .quote, .authi, .pi, .pls"):
            node.decompose()
        paragraphs = _waterwriter_rich_paragraphs(content_root)
        if not paragraphs:
            continue
        position = post.get("position")
        floor_number = int(position) if str(position).isdigit() else ordinal
        chapters.append((floor_number, paragraphs))
        if not author:
            author = _clean_text(str(post.get("author") or ""))
    if not chapters:
        raise ReaderUnavailableError("在水裡寫字未提供可辨識的樓主公開正文；請改由原始網站閱讀。")
    base_url = url.split("#", 1)[0]
    toc = [_toc_entry(f"{base_url}#floor-{floor_number}", f"第 {floor_number} 樓", index) for index, (floor_number, _) in enumerate(chapters, start=1)]
    fragment = urlparse(url).fragment.removeprefix("floor-")
    current_index = next((index for index, (floor_number, _) in enumerate(chapters) if str(floor_number) == fragment), 0)
    title = _clean_text(str(thread.get("subject") or thread.get("title") or "")) or "未命名作品"
    all_chapters = [(toc[index], paragraphs) for index, (_, paragraphs) in enumerate(chapters)]
    return ExtractedReaderDocument(
        toc[current_index].url,
        title,
        author or "原始作者以來源頁為準",
        "在水裡寫字",
        None,
        toc[current_index].title,
        chapters[current_index][1],
        toc,
        current_index,
        title if len(toc) > 1 else None,
        all_chapters,
    )


def _html_table_of_contents(url: str, source: str, soup: BeautifulSoup, title: str) -> list[ReaderChapterEntry]:
    selectors = {
        "AO3": ("select#selected_id option[value]", "ol.chapter.index a[href]", ".chapter.index a[href]"),
        "Penana": (".issue_li a[href]", ".chapter-list a[href]", ".episode-list a[href]", "a[href*='chapter']", "a[href*='issue']"),
        "CxC 創利市集": (".chapter-list a[href]", ".episode-list a[href]", "a[href*='chapter']", "a[href*='episode']"),
        "巴哈姆特創作大廳": (".article-list a[href*='creationDetail.php']", ".article-list a[href*='artwork.php']", ".creation-list a[href*='creationDetail.php']", ".creation-list a[href*='artwork.php']", ".series-list a[href*='artwork.php']"),
        "KadoKado 角角者": ("a[href*='/chapters/']", "a[href*='/episode/']", ".chapter-list a[href]"),
    }.get(source, ())
    entries: list[ReaderChapterEntry] = []
    for selector in selectors:
        for node in soup.select(selector):
            raw_href = str(node.get("value") or node.get("href") or "").strip()
            if not raw_href:
                continue
            if source == "AO3" and node.name == "option" and raw_href.isdecimal():
                parsed = urlparse(url)
                chapter_url = urlunparse((parsed.scheme, parsed.netloc, f"/chapters/{raw_href}", "", "", ""))
            else:
                chapter_url = urljoin(url, raw_href)
            if not _same_reader_source(url, chapter_url):
                continue
            if source == "Penana" and not _is_penana_issue_url(chapter_url):
                continue
            chapter_title = _clean_text(node.get_text(" ", strip=True)) or _clean_text(str(node.get("title") or ""))
            if source == "Penana":
                # Penana's issue cards append public engagement counters and a
                # menu glyph after the title. They are UI metadata, not prose.
                chapter_title = re.sub(r"^\s*#\d+\s+", "", chapter_title)
                chapter_title = re.split(r"\s+\d+\s*喜歡\b", chapter_title, maxsplit=1)[0]
                chapter_title = _clean_text(chapter_title)
            if not chapter_title:
                continue
            entries.append(_toc_entry(chapter_url, chapter_title, len(entries) + 1))
    entries = _dedupe_toc(entries)
    if source == "巴哈姆特創作大廳":
        # `.ct-btn-box` is only previous/next navigation, not a chapter list.
        # If the page does not expose a genuine series list, present one stable
        # one-shot entry rather than falsely labelling adjacent articles as chapters.
        entries = [entry for entry in entries if entry.title not in {"上一篇", "下一篇"}]
        if not entries:
            return [_toc_entry(url, "全一話", 1)]
    if not entries:
        label = "全一話" if source == "同人誌中心" else title
        entries = [_toc_entry(url, label, 1)]
    return [ReaderChapterEntry(entry.id, entry.title, entry.url, position) for position, entry in enumerate(entries, start=1)]


async def _penana_story_document(url: str, html: str) -> ExtractedReaderDocument:
    """Resolve a public Penana story landing page to its first public issue."""
    soup = BeautifulSoup(html, "html.parser")
    title = _meta_content(soup, "meta[property='og:title']") or _first_text(soup, ("h1", ".title"), "未命名 Penana 作品")
    table_of_contents = _html_table_of_contents(url, "Penana", soup, title)
    first_issue = next((entry for entry in table_of_contents if _is_penana_issue_url(entry.url)), None)
    if first_issue is None:
        raise ReaderUnavailableError("Penana 故事首頁未提供可讀取的公開章節；請改由原始網站閱讀。")
    issue_html = await fetch_public_work_html(first_issue.url)
    document = extract_reader_document(first_issue.url, issue_html)
    current_index = next((index for index, entry in enumerate(table_of_contents) if entry.url == first_issue.url), 0)
    return ExtractedReaderDocument(document.url, title, document.author, document.source, document.cover_url, document.chapter_title, document.paragraphs, table_of_contents, current_index, title if len(table_of_contents) > 1 else None)


async def _penana_issue_document(url: str, html: str) -> ExtractedReaderDocument:
    """Keep the full public Penana TOC when a reader enters on a chapter URL."""
    document = extract_reader_document(url, html)
    story_url = _penana_story_root_url(url)
    if not story_url or story_url == url:
        return document
    try:
        story_html = await fetch_public_work_html(story_url)
        story_soup = BeautifulSoup(story_html, "html.parser")
        table_of_contents = _html_table_of_contents(story_url, "Penana", story_soup, document.title)
    except ReaderUnavailableError:
        # A source may allow direct public issues while protecting its landing
        # page. Keep the readable chapter rather than turning it into an error.
        return document
    issue_entries = [entry for entry in table_of_contents if _is_penana_issue_url(entry.url)]
    if not issue_entries:
        return document
    current_index = next((index for index, entry in enumerate(issue_entries) if entry.url == url), 0)
    story_title = _meta_content(story_soup, "meta[property='og:title']") or _first_text(story_soup, ("h1", ".title"), document.title)
    return ExtractedReaderDocument(document.url, story_title, document.author, document.source, document.cover_url, document.chapter_title, document.paragraphs, issue_entries, current_index, story_title if len(issue_entries) > 1 else None)


async def _cxc_document(url: str) -> ExtractedReaderDocument:
    """Read a CxC work's published, readable section from its anonymous API."""
    reference = _cxc_work_reference(url)
    if reference is None:
        raise ReaderUnavailableError("CxC 作品網址缺少可辨識的創作者或作品 ID；請改由原始網站閱讀。")
    store, work_id, requested_section_id = reference
    work = await _cxc_public_api_get(f"store/{store}/work/{work_id}")
    section_list = await _cxc_public_api_get(f"store/{store}/work/{work_id}/section")
    raw_sections = section_list.get("data")
    if not isinstance(raw_sections, list):
        raise ReaderUnavailableError("CxC 未提供可辨識的公開章節目錄；請改由原始網站閱讀。")
    readable_sections = [section for section in raw_sections if isinstance(section, dict) and section.get("is_readable") is True and str(section.get("id") or "").isdigit()]
    if not readable_sections:
        raise ReaderUnavailableError("CxC 作品未提供可公開讀取的免費章節；請改由原始網站閱讀。")
    selected_section = next((section for section in readable_sections if str(section.get("id")) == requested_section_id), readable_sections[0])
    selected_section_id = str(selected_section["id"])
    base_url = f"https://cxc.today/@{store}/work/{work_id}"
    toc = [_toc_entry(f"{base_url}/reader/{section['id']}", str(section.get("name") or f"第 {position} 章"), position) for position, section in enumerate(readable_sections, start=1)]
    section = await _cxc_public_api_get(f"store/{store}/work/{work_id}/section/{selected_section_id}")
    content = str(
        section.get("content_hant")
        or section.get("content_html")
        or section.get("content")
        or section.get("trial_content_hant")
        or section.get("trial_content")
        or ""
    )
    if _has_cxc_text_protection(content):
        raise ReaderUnavailableError("CxC 此章節以原始網站的字型內容保護呈現；本應用程式不會解碼或繞過該保護，請改由原始網站閱讀。")
    content_root = BeautifulSoup(content, "html.parser")
    paragraphs = _paragraphs_from(content_root)
    if not paragraphs:
        raise ReaderUnavailableError("CxC 公開章節未提供可辨識的正文；請改由原始網站閱讀。")
    partners = work.get("partner")
    first_partner = partners[0] if isinstance(partners, list) and partners and isinstance(partners[0], dict) else {}
    member = first_partner.get("member") if isinstance(first_partner, dict) else {}
    author = _clean_text(str(member.get("nickname") or "")) if isinstance(member, dict) else ""
    current_url = f"{base_url}/reader/{selected_section_id}"
    current_index = next((index for index, entry in enumerate(toc) if entry.url == current_url), 0)
    return ExtractedReaderDocument(
        url=current_url,
        title=_clean_text(str(work.get("name") or "")) or "未命名 CxC 作品",
        author=author or "原始作者以 CxC 來源頁為準",
        source="CxC 創利市集",
        cover_url=_clean_text(str(work.get("cover_photo") or "")) or None,
        chapter_title=_clean_text(str(section.get("name") or selected_section.get("name") or "正文")),
        paragraphs=paragraphs,
        table_of_contents=toc,
        current_chapter_index=current_index,
    )


def _pixiv_paragraphs_from_text(text: str) -> list[str]:
    """Turn Pixiv's newlines and page breaks into ReaderView-safe prose blocks."""
    normalized = re.sub(r"\[newpage\]", "\n\n", text, flags=re.IGNORECASE).replace("\r\n", "\n")
    paragraphs: list[str] = []
    seen: set[str] = set()
    for block in re.split(r"\n\s*\n+", normalized):
        cleaned = re.sub(r"[^\S\r\n]+", " ", block)
        cleaned = re.sub(r"\s*\n\s*", "\n", cleaned).strip()
        if len(cleaned) < 2 or cleaned in seen:
            continue
        seen.add(cleaned)
        paragraphs.append(cleaned)
    return paragraphs


def _pixiv_series_id(body: dict[str, object]) -> str | None:
    navigation = body.get("seriesNavData")
    candidates = [body.get("seriesId"), body.get("series_id")]
    if isinstance(navigation, dict):
        candidates.extend([navigation.get("seriesId"), navigation.get("series_id")])
    for candidate in candidates:
        value = str(candidate or "")
        if value.isdecimal():
            return value
    return None


def _pixiv_series_entries(payload: object) -> list[ReaderChapterEntry]:
    """Parse documented Pixiv series responses across their public payload variants."""
    body = payload.get("body") if isinstance(payload, dict) else None
    if isinstance(body, list):
        entries: list[ReaderChapterEntry] = []
        for item in body:
            if not isinstance(item, dict) or item.get("available") is False:
                continue
            novel_id = str(item.get("id") or item.get("novelId") or "")
            if not novel_id.isdecimal():
                continue
            title = _clean_text(str(item.get("title") or f"第 {len(entries) + 1} 章"))
            entries.append(_toc_entry(f"https://www.pixiv.net/novel/show.php?id={novel_id}", title, len(entries) + 1))
        return entries
    if not isinstance(body, dict):
        return []
    containers = [body]
    page = body.get("page")
    if isinstance(page, dict):
        containers.append(page)
    raw_items: list[object] = []
    for container in containers:
        for key in ("novels", "items", "contents", "seriesContents"):
            value = container.get(key)
            if isinstance(value, list):
                raw_items.extend(value)
        series = container.get("series")
        if isinstance(series, dict):
            for key in ("novels", "items", "contents"):
                value = series.get(key)
                if isinstance(value, list):
                    raw_items.extend(value)
    entries: list[ReaderChapterEntry] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        novel_id = str(item.get("id") or item.get("novelId") or item.get("novel_id") or "")
        if not novel_id.isdecimal():
            continue
        order_value = item.get("order") or item.get("seriesOrder") or item.get("series_order") or len(entries) + 1
        order = int(order_value) if str(order_value).isdigit() else len(entries) + 1
        title = _clean_text(str(item.get("title") or item.get("name") or f"第 {order} 章"))
        entries.append(_toc_entry(f"https://www.pixiv.net/novel/show.php?id={novel_id}", title, order))
    return sorted(_dedupe_toc(entries), key=lambda entry: entry.index)


async def _pixiv_series_table_of_contents(body: dict[str, object], referer: str) -> list[ReaderChapterEntry]:
    series_id = _pixiv_series_id(body)
    if not series_id:
        return []
    try:
        response = await _public_get(
            f"https://www.pixiv.net/ajax/novel/series/{series_id}/content_titles",
            headers={**PIXIV_AJAX_HEADERS, "Referer": referer},
        )
        if response.status_code != 200:
            return []
        payload = response.json()
    except Exception:
        return []
    return _pixiv_series_entries(payload)


async def _pixiv_document(url: str) -> ExtractedReaderDocument:
    """Fetch Pixiv's public Novel JSON instead of its JavaScript application shell."""
    novel_id = _pixiv_novel_id(url)
    try:
        response = await _public_get(
            f"https://www.pixiv.net/ajax/novel/{novel_id}",
            headers={**PIXIV_AJAX_HEADERS, "Referer": url},
        )
    except Exception as error:
        raise ReaderUnavailableError("Pixiv 公開小說資料暫時無法讀取，請稍後再試。") from error
    if response.status_code in {401, 403, 429} or response.status_code >= 500:
        raise ReaderUnavailableError("Pixiv 要求驗證或暫時拒絕公開讀取；本應用程式不會繞過該保護。")
    if response.status_code >= 400:
        raise ReaderUnavailableError(f"Pixiv 回傳 HTTP {response.status_code}，目前無法讀取此篇作品。")
    try:
        payload = response.json()
    except (ValueError, json.JSONDecodeError) as error:
        raise ReaderUnavailableError("Pixiv 未回傳可辨識的公開小說資料；請改由原始網站閱讀。") from error
    body = payload.get("body") if isinstance(payload, dict) else None
    if payload.get("error") or not isinstance(body, dict):
        raise ReaderUnavailableError("Pixiv 未提供可辨識的公開小說正文；請改由原始網站閱讀。")
    paragraphs = _pixiv_paragraphs_from_text(str(body.get("content") or ""))
    if not paragraphs:
        raise ReaderUnavailableError("Pixiv 作品未提供可辨識的公開正文；請改由原始網站閱讀。")
    title = _clean_text(str(body.get("title") or "")) or "未命名 Pixiv 小說"
    author = _clean_text(str(body.get("userName") or "")) or "原始作者以 Pixiv 來源頁為準"
    chapter_title = _clean_text(str(body.get("title") or "")) or _clean_text(str(body.get("seriesTitle") or "")) or "正文"
    cover_url = _clean_text(str(body.get("coverUrl") or "")) or None
    navigation = body.get("seriesNavData") if isinstance(body.get("seriesNavData"), dict) else {}
    current_order = int(navigation.get("order") or 1) if str(navigation.get("order") or "").isdigit() else 1
    toc = await _pixiv_series_table_of_contents(body, url)
    for relation, fallback_order in (("prev", current_order - 1), ("next", current_order + 1)):
        item = navigation.get(relation) if isinstance(navigation, dict) else None
        if not isinstance(item, dict) or not item.get("available") or not str(item.get("id") or "").isdigit():
            continue
        item_order = int(item.get("order") or fallback_order)
        item_url = f"https://www.pixiv.net/novel/show.php?id={item['id']}"
        toc.append(_toc_entry(item_url, str(item.get("title") or f"第 {item_order} 章"), item_order))
    toc.append(_toc_entry(url, chapter_title, current_order))
    toc = sorted(_dedupe_toc(toc), key=lambda entry: entry.index)
    current_index = next((index for index, entry in enumerate(toc) if entry.url == url), 0)
    series_title = _clean_text(str(body.get("seriesTitle") or navigation.get("title") or "")) if len(toc) > 1 else ""
    return ExtractedReaderDocument(url, title, author, "Pixiv", cover_url, chapter_title, paragraphs, toc, current_index, series_title or None)


def _kadokado_reference(url: str) -> tuple[str, str | None]:
    """Recognise either a KadoKado book landing page or a public chapter URL."""
    parsed = urlparse(url)
    chapter_match = KADOKADO_CHAPTER_PATH_PATTERN.search(parsed.path)
    title_id = parse_qs(parsed.query).get("titleId", [""])[0]
    book_match = KADOKADO_BOOK_PATH_PATTERN.search(parsed.path)
    if book_match:
        title_id = book_match.group("title_id")
    if not title_id.isdecimal():
        raise ReaderUnavailableError("KadoKado 網址缺少可辨識的作品 ID；請改由原始網站閱讀。")
    return title_id, chapter_match.group("chapter_id") if chapter_match else None


async def _kadokado_public_json(path: str) -> object:
    try:
        response = await _public_get(
            f"https://api.kadokado.com.tw/{path.lstrip('/')}",
            headers={**READER_HEADERS, "Accept": "application/json"},
            timeout=KADOKADO_READER_TIMEOUT_SECONDS,
        )
    except Exception as error:
        raise ReaderUnavailableError("KadoKado 公開章節資料暫時無法讀取，請稍後再試。") from error
    if response.status_code in {401, 403, 429} or response.status_code >= 500:
        raise ReaderUnavailableError("KadoKado 要求驗證或暫時拒絕公開讀取；本應用程式不會繞過該保護。")
    if response.status_code >= 400:
        raise ReaderUnavailableError(f"KadoKado 回傳 HTTP {response.status_code}，目前無法讀取此篇作品。")
    try:
        return response.json()
    except (ValueError, json.JSONDecodeError) as error:
        raise ReaderUnavailableError("KadoKado 未回傳可辨識的公開章節資料；請改由原始網站閱讀。") from error


async def _kadokado_document(url: str) -> ExtractedReaderDocument:
    """Read public/free KadoKado chapters via its JSON catalogue, never page chrome."""
    title_id, requested_chapter_id = _kadokado_reference(url)
    title_payload, collections_payload = await asyncio.gather(
        _kadokado_public_json(f"v2/titles/{title_id}"),
        _kadokado_public_json(f"v1/work/collection-episode?titleId={title_id}"),
    )
    title_record = title_payload if isinstance(title_payload, dict) else {}
    collections = collections_payload if isinstance(collections_payload, list) else []
    collection_ids: list[str] = []
    for collection in collections:
        if not isinstance(collection, dict):
            continue
        collection_id = re.match(r"(\d+)", str(collection.get("id") or ""))
        if collection_id is None:
            continue
        collection_ids.append(collection_id.group(1))
    collection_payloads = await asyncio.gather(
        *[
            _kadokado_public_json(f"v2/collection/withIsPurchased?publishedOnly=true&collectionId={collection_id}")
            for collection_id in collection_ids
        ]
    )
    chapter_records: list[dict[str, object]] = []
    for payload in collection_payloads:
        if isinstance(payload, list):
            chapter_records.extend(item for item in payload if isinstance(item, dict) and item.get("free") is True and str(item.get("id") or "").isdigit())
    deduped_chapter_records = {str(item.get("id")): item for item in chapter_records}
    chapter_records = list(deduped_chapter_records.values())
    chapter_records.sort(key=lambda item: (int(item.get("sequenceNum") or 0), int(item.get("id") or 0)))
    if not chapter_records:
        raise ReaderUnavailableError("KadoKado 書籍未提供可讀取的公開章節；請改由原始網站閱讀。")
    toc = [
        _toc_entry(
            f"https://www.kadokado.com.tw/chapter/{item['id']}?titleId={title_id}",
            str(item.get("displayName") or f"第 {position} 章"),
            position,
        )
        for position, item in enumerate(chapter_records, start=1)
    ]
    selected_index = next((index for index, entry in enumerate(toc) if str(entry.url).split("/chapter/")[-1].split("?")[0] == requested_chapter_id), 0)
    selected = toc[selected_index]
    chapter_id = selected.url.split("/chapter/")[-1].split("?")[0]
    chapter_payload = await _kadokado_public_json(f"v2/chapter/{chapter_id}")
    chapter_record = chapter_payload if isinstance(chapter_payload, dict) else {}
    content_root = BeautifulSoup(str(chapter_record.get("content") or ""), "html.parser")
    paragraphs = _paragraphs_from(content_root)
    if not paragraphs:
        raise ReaderUnavailableError("KadoKado 公開章節未提供可辨識的正文；請改由原始網站閱讀。")
    title = _clean_text(str(title_record.get("displayName") or title_record.get("title") or "")) or "未命名 KadoKado 作品"
    author = _clean_text(str(title_record.get("ownerDisplayName") or title_record.get("author") or "")) or "原始作者以 KadoKado 來源頁為準"
    cover_candidates = title_record.get("coverUrls") or title_record.get("coverUrl") or []
    cover_url = str(cover_candidates[0]) if isinstance(cover_candidates, list) and cover_candidates else str(cover_candidates or "")
    return ExtractedReaderDocument(selected.url, title, author, "KadoKado 角角者", cover_url or None, selected.title, paragraphs, toc, selected_index, title if len(toc) > 1 else None)


def extract_reader_document(url: str, html: str) -> ExtractedReaderDocument:
    """Extract a single chapter's readable paragraphs from verified public HTML."""
    source = source_for_reader_url(url)
    soup = BeautifulSoup(html, "html.parser")
    if source == "AO3":
        title, author = _ao3_title_and_author(soup)
    else:
        title = _meta_content(soup, "meta[property='og:title']") or _first_text(soup, ("h1", ".title", "header h2"), "未命名作品")
        author = _meta_content(soup, "meta[name='author']") or _first_text(soup, ("a[rel='author']", ".byline a", ".author a", ".byline", ".author"), "原始作者以來源頁為準")
    cover_url = _meta_content(soup, "meta[property='og:image']") or None
    root = _content_root(soup, source)
    if source == "Penana":
        root = _penana_innermost_reader_root(soup) or root
    if source == "Penana" and root is not None:
        _clean_penana_reader_root(root)
    initial_paragraphs = _penana_paragraphs_from(root) if source == "Penana" and root is not None else (_paragraphs_from(root) if root is not None else [])
    if root is None or not initial_paragraphs:
        root = _readability_fallback(soup)
    if root is None:
        raise ReaderUnavailableError("找不到可辨識的公開正文區塊；請改由原始網站閱讀。")
    if source == "Penana":
        _clean_penana_reader_root(root)
    chapter_title = _first_text(soup, ("#chapters .chapter h3.title", "#chapters h3.title", "h3.title.heading", ".chapter-title", "#chapters h2"), "正文") if source == "AO3" else _first_text(root, ("h2", "h3", ".chapter-title"), "正文")
    paragraphs = _penana_paragraphs_from(root) if source == "Penana" else _paragraphs_from(root)
    if not paragraphs:
        raise ReaderUnavailableError("來源頁未提供可辨識的公開正文；請改由原始網站閱讀。")
    toc = _html_table_of_contents(url, source, soup, title)
    current_index = next((index for index, entry in enumerate(toc) if entry.url == url), 0)
    return ExtractedReaderDocument(
        url=url,
        title=title,
        author=author,
        source=source,
        cover_url=cover_url,
        chapter_title=chapter_title,
        paragraphs=paragraphs,
        table_of_contents=toc,
        current_chapter_index=current_index,
        series_title=title if len(toc) > 1 else None,
    )


def _ao3_full_work_document(url: str, html: str) -> ExtractedReaderDocument:
    """Parse AO3's documented public full-work page into locally switchable chapters."""
    soup = BeautifulSoup(html, "html.parser")
    title, author = _ao3_title_and_author(soup)
    cover_url = _meta_content(soup, "meta[property='og:image']") or None
    table_of_contents = _html_table_of_contents(url, "AO3", soup, title)
    chapter_nodes = soup.select("#chapters > .chapter") or soup.select("#chapters .chapter")
    parsed_chapters: list[tuple[ReaderChapterEntry, list[str]]] = []
    for index, node in enumerate(chapter_nodes, start=1):
        content = node.select_one(".userstuff")
        if content is None:
            continue
        paragraphs = _paragraphs_from(content)
        if not paragraphs:
            continue
        chapter_title = _first_text(node, ("h3.title", "h3.heading", ".chapter-title"), f"第 {index} 章")
        entry = table_of_contents[index - 1] if index <= len(table_of_contents) else _toc_entry(url, chapter_title, index)
        parsed_chapters.append((ReaderChapterEntry(entry.id, chapter_title, entry.url, index), paragraphs))
    if not parsed_chapters:
        return extract_reader_document(url, html)
    toc = [entry for entry, _ in parsed_chapters]
    first_entry, first_paragraphs = parsed_chapters[0]
    return ExtractedReaderDocument(
        url=first_entry.url,
        title=title,
        author=author,
        source="AO3",
        cover_url=cover_url,
        chapter_title=first_entry.title,
        paragraphs=first_paragraphs,
        table_of_contents=toc,
        current_chapter_index=0,
        series_title=title if len(toc) > 1 else None,
        all_chapters=parsed_chapters,
    )


async def read_public_work(url: str, chapter_url: str | None = None) -> ExtractedReaderDocument:
    """Fetch and extract on demand; content is deliberately never persisted."""
    requested_url = chapter_url or url
    requested_source = source_for_reader_url(requested_url)
    target_url = _normalize_bahamut_url(_normalize_ao3_url(requested_url, full_work=requested_source == "AO3" and chapter_url is None))
    if not _same_reader_source(url, target_url):
        raise ReaderRequestError("指定章節不屬於原始作品的平台；請改由原始網站閱讀。")
    source = source_for_reader_url(target_url)
    if source == "CxC 創利市集":
        return await _cxc_document(target_url)
    if source == "Pixiv":
        return await _pixiv_document(target_url)
    if source == "KadoKado 角角者":
        return await _kadokado_document(target_url)
    if source == "在水裡寫字":
        try:
            return await _waterwriter_api_document(target_url)
        except ReaderUnavailableError:
            # Keep the existing SSR parser as a safe fallback if the source has
            # not exposed its public thread API for a particular legacy route.
            pass
    html = await fetch_public_work_html(target_url)
    if source == "AO3" and chapter_url is None:
        return _ao3_full_work_document(url, html)
    if source == "Penana" and _is_penana_story_home(target_url):
        return await _penana_story_document(target_url, html)
    if source == "Penana" and _is_penana_issue_url(target_url):
        return await _penana_issue_document(target_url, html)
    if source == "在水裡寫字":
        return _waterwriter_document(target_url, html)
    return extract_reader_document(target_url, html)
