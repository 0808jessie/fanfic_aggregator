"""Bounded, public-page reader extraction for Fanfic Atlas.

The reader keeps article text in the response only. It never stores page bodies,
cookies, or verification material, and it only requests known public work hosts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable
from urllib.parse import urlparse

from bs4 import BeautifulSoup, Tag
from curl_cffi import requests


MAX_READER_PARAGRAPHS = 900
READER_TIMEOUT_SECONDS = 10
READER_HOSTS: dict[str, str] = {
    "archiveofourown.org": "AO3",
    "penana.com": "Penana",
    "slashtw.space": "在水裡寫字",
    "doujin.com.tw": "同人誌中心",
    "cxc.today": "CxC 創利市集",
    "pixiv.net": "Pixiv",
    "gamer.com.tw": "巴哈姆特創作大廳",
    "popo.tw": "POPO 原創市集",
    "kadokado.com.tw": "KadoKado 角角者",
}
READER_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
}


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


def _is_protection_page(html: str) -> bool:
    sample = html[:12_000].lower()
    markers = ("cf-chl", "cloudflare", "captcha", "verify you are human", "安全驗證", "請完成驗證")
    return any(marker in sample for marker in markers)


def fetch_public_work_html(url: str) -> str:
    """Fetch one public work with a bounded browser-like request, never credentials."""
    source_for_reader_url(url)
    try:
        response = requests.get(url, headers=READER_HEADERS, impersonate="chrome120", timeout=READER_TIMEOUT_SECONDS)
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


def _content_root(soup: BeautifulSoup) -> Tag | None:
    selectors = (
        "#chapters",
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


def _paragraphs_from(root: Tag) -> list[str]:
    _remove_non_article_nodes(root)
    paragraphs: list[str] = []
    seen: set[str] = set()
    for node in root.select("p, blockquote, li"):
        text = _clean_text(node.get_text(" ", strip=True))
        if len(text) < 2 or text in seen:
            continue
        seen.add(text)
        paragraphs.append(text)
        if len(paragraphs) >= MAX_READER_PARAGRAPHS:
            return paragraphs
    if paragraphs:
        return paragraphs
    return [line for line in (_clean_text(line) for line in root.get_text("\n").splitlines()) if len(line) >= 2][:MAX_READER_PARAGRAPHS]


def extract_reader_document(url: str, html: str) -> ExtractedReaderDocument:
    """Extract a single chapter's readable paragraphs from verified public HTML."""
    source = source_for_reader_url(url)
    soup = BeautifulSoup(html, "html.parser")
    title = _meta_content(soup, "meta[property='og:title']") or _first_text(soup, ("h1", ".title", "header h2"), "未命名作品")
    author = _meta_content(soup, "meta[name='author']") or _first_text(soup, ("a[rel='author']", ".byline a", ".author a", ".byline", ".author"), "原始作者以來源頁為準")
    cover_url = _meta_content(soup, "meta[property='og:image']") or None
    root = _content_root(soup)
    if root is None:
        raise ReaderUnavailableError("找不到可辨識的公開正文區塊；請改由原始網站閱讀。")
    chapter_title = _first_text(root, ("h2", "h3", ".chapter-title"), "正文")
    paragraphs = _paragraphs_from(root)
    if not paragraphs:
        raise ReaderUnavailableError("來源頁未提供可辨識的公開正文；請改由原始網站閱讀。")
    return ExtractedReaderDocument(
        url=url,
        title=title,
        author=author,
        source=source,
        cover_url=cover_url,
        chapter_title=chapter_title,
        paragraphs=paragraphs,
    )


def read_public_work(url: str) -> ExtractedReaderDocument:
    """Fetch and extract on demand; content is deliberately never persisted."""
    return extract_reader_document(url, fetch_public_work_html(url))
