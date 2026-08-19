"""Public book-index adapter for POPO 原創市集.

POPO's public search form includes a page-scoped anti-forgery field.  This
adapter performs the same minimal public form flow: fetch the public index,
submit one book-only search, and parse only the returned public book cards.
It does not authenticate, access paid chapters, or attempt to bypass a failed
token or protection response.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicSearchUnavailable(RuntimeError):
    """Raised for unavailable, protected, or structurally invalid public pages."""


class PopoScraper(BaseScraper):
    """Expose public POPO books as metadata-only links to the official site."""

    base_url = "https://www.popo.tw"
    index_url = f"{base_url}/index"
    search_url = f"{base_url}/search"
    connect_timeout_seconds = 8
    read_timeout_seconds = 15
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/index",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ),
    }

    def scrape(
        self,
        keyword: str,
        page: int = 1,
        force_refresh: bool = False,
        custom_cp_map: object | None = None,
        mode: str = "keyword",
    ) -> dict[str, object]:
        self.last_warning = None
        normalized_keyword = keyword.strip()
        if not normalized_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            html = self._fetch_public_book_search_html(normalized_keyword, page)
            items = self.parse_results(html, normalized_keyword)
            total_works = self.extract_total_works(html)
            total_pages = self.extract_total_pages(html) or 1
            if not items:
                self.last_warning = f"[POPO 原創市集] No verified public book result matched '{normalized_keyword}'"
            return {"items": items, "total_works": total_works, "total_pages": total_pages}
        except _PublicSearchUnavailable as error:
            self.last_warning = f"[POPO 原創市集] {error}"
        except Exception as error:
            self.last_warning = f"[POPO 原創市集] Public search parse failed safely: {error}"
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_public_book_search_html(self, keyword: str, page: int) -> str:
        """Execute one ordinary public token + book-search form submission."""
        try:
            with curl_requests.Session(impersonate="chrome120") as session:
                index_response = session.get(
                    self.index_url,
                    headers=self.headers,
                    timeout=self.read_timeout_seconds,
                )
                self._assert_public_response(index_response, "public index")
                index_soup = BeautifulSoup(index_response.text, "html.parser")
                token_input = index_soup.select_one('form#header-search-form input[type="hidden"][name]')
                if not token_input:
                    raise _PublicSearchUnavailable("Public search token was not present")
                token_name = str(token_input.get("name") or "")
                token_value = str(token_input.get("value") or "")
                if not token_name or not token_value:
                    raise _PublicSearchUnavailable("Public search token was incomplete")

                data = {token_name: token_value, "name": keyword, "searchtype": "book"}
                if page > 1:
                    data["page"] = str(page)
                response = session.post(
                    self.search_url,
                    data=data,
                    headers={**self.headers, "Referer": self.index_url},
                    timeout=self.read_timeout_seconds,
                )
                self._assert_public_response(response, "public book search")
                html = response.text
        except Exception as error:
            raise _PublicSearchUnavailable(f"Public HTTP request unavailable: {error}") from error

        soup = BeautifulSoup(html, "html.parser")
        if not soup.select("div.search-book #BOOK.result_list"):
            raise _PublicSearchUnavailable("Public book result markup was unavailable")
        return html

    @staticmethod
    def _assert_public_response(response: object, stage: str) -> None:
        status_code = int(getattr(response, "status_code", 0))
        if response.status_code in (401, 403, 429, 503, 520, 521, 522, 525):
            raise _PublicSearchUnavailable(f"{stage.capitalize()} blocked (HTTP {status_code}), skipping cleanly")
        response.raise_for_status()
        text = response.text.casefold()
        if any(marker in text for marker in ("cloudflare", "just a moment", "cdn-cgi", "captcha", "安全驗證")):
            raise _PublicSearchUnavailable(f"{stage.capitalize()} returned a verification page, skipping cleanly")

    @classmethod
    def _is_verified_book_url(cls, value: str) -> bool:
        parsed = urlparse(value)
        return parsed.scheme == "https" and parsed.netloc == "www.popo.tw" and bool(re.fullmatch(r"/books/\d+", parsed.path))

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        """Normalize only public `/books/<id>` cards from the book-result section."""
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        for card in soup.select("div.search-book #BOOK.result_list div.box"):
            title_anchor = card.select_one('a.bname[href^="/books/"]')
            if not title_anchor:
                continue
            url = urljoin(f"{self.base_url}/", str(title_anchor.get("href") or ""))
            if url in seen_urls or not self._is_verified_book_url(url):
                continue
            title = title_anchor.get_text(" ", strip=True)
            author_node = card.select_one('a.author[href^="/users/"]')
            author = author_node.get_text(" ", strip=True) if author_node else "未知作者"
            cover_node = card.select_one('div.left a[href^="/books/"] img[src]')
            cover_url = urljoin(f"{self.base_url}/", str(cover_node.get("src"))) if cover_node else None
            if cover_url and urlparse(cover_url).netloc != "cdn0.popo.tw":
                cover_url = None

            fields: dict[str, str] = {}
            for label in card.select("dl dt"):
                value = label.find_next_sibling("dd")
                if value:
                    fields[label.get_text(" ", strip=True)] = value.get_text(" ", strip=True)
            latest_chapter = fields.get("最新章回", "")
            summary = fields.get("書摘", "")
            published_at = fields.get("公開時間") or None
            tags = ["原創／付費章節依官方為準", keyword]
            if latest_chapter:
                tags.append(f"最新章回：{latest_chapter}")
            if not title:
                continue
            results.append(
                ScrapedFanfic(
                    id=f"popo:{url}",
                    title=title[:240],
                    author=author[:160] or "未知作者",
                    platform="POPO 原創市集",
                    url=url,
                    tags=", ".join(tags),
                    summary=summary[:800],
                    coverUrl=cover_url,
                    updatedAt=published_at,
                    language="zh-TW",
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> int:
        section = BeautifulSoup(html, "html.parser").select_one("div.search-book #BOOK.result_list")
        if not section:
            return 0
        match = re.search(r"共找到\s*([\d,]+)\s*筆資料", section.get_text(" ", strip=True))
        return int(match.group(1).replace(",", "")) if match else 0

    @staticmethod
    def extract_total_pages(html: str) -> int | None:
        soup = BeautifulSoup(html, "html.parser")
        page_numbers = []
        for anchor in soup.select("div.search-book .pagenum a.num"):
            text = anchor.get_text(" ", strip=True)
            if text.isdigit():
                page_numbers.append(int(text))
        return max(page_numbers) if page_numbers else None
