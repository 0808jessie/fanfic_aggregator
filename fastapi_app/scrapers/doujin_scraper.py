"""Public-listing adapter for Doujinshi Center (同人誌中心).

It renders only public search results. A CAPTCHA or timeout is treated as an
unavailable source and is never solved, retried aggressively, or transformed
into a result card.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup
import requests

from constants.cp_tags import CPTagConfig, get_keyword_for_platform
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicListingUnavailable(RuntimeError):
    """Raised for protected or unavailable public book listing pages."""


class DoujinScraper(BaseScraper):
    """Parse verified public `/books/info/` cards from rendered search listings."""

    base_url = "https://www.doujin.com.tw"
    search_url = f"{base_url}/books/search/q"
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    )
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.doujin.com.tw/",
        "User-Agent": user_agent,
    }
    result_selectors = (".work_item", ".book_item", ".work-list-item", "div[class*='book']")

    @classmethod
    def build_search_url(cls, keyword: str, page: int = 1) -> str:
        # The site's own works-search form routes to /books/search/q with a
        # `keyword` parameter. The legacy /books/search?q= route redirects to
        # the unfiltered catalogue and cannot provide a trustworthy total.
        query = f"keyword={quote_plus(keyword)}"
        if page > 1:
            query = f"{query}&page={page}"
        return f"{cls.search_url}?{query}"

    def scrape(
        self,
        keyword: str,
        page: int = 1,
        force_refresh: bool = False,
        custom_cp_map: dict[str, CPTagConfig] | None = None,
        mode: str = "keyword",
    ) -> dict[str, object]:
        self.last_warning = None
        self._static_unavailable_warning: str | None = None
        if not keyword.strip():
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            # The native catalogue treats whitespace as restrictive AND input.
            # Use the original first term rather than the longer CP expansion.
            search_keyword = keyword.strip() if mode == "author" else keyword.strip().split()[0]
            html = self._fetch_static_search_html(search_keyword, page)
            if html is None:
                raise _PublicListingUnavailable(
                    self._static_unavailable_warning or "No verified public listing was available"
                )
            items = self.parse_results(html, search_keyword)
            total_works = self.extract_total_works(html) or len(items)
            total_pages = self.extract_total_pages(html) or 1
            for item in items:
                item.keyword = keyword
            print(f"[同人誌中心] 成功抓取 {len(items)} 筆")
            if not items:
                self.last_warning = f"[同人誌中心] No verified public result matched '{keyword}'"
            return {"items": items, "total_works": total_works, "total_pages": total_pages}
        except _PublicListingUnavailable as error:
            self.last_warning = f"[同人誌中心] {error}"
            print(self.last_warning)
        except Exception as error:
            self.last_warning = f"[同人誌中心] 純 HTTP 解析失敗：{error}"
            print(self.last_warning)
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_static_search_html(self, keyword: str, page_number: int = 1) -> str | None:
        """Read only the native server-rendered listing with a generous read budget."""
        try:
            response = requests.get(
                self.build_search_url(keyword, page_number),
                headers=self.headers,
                timeout=(5, 12),
            )
            if response.status_code in (403, 429, 503, 520, 521, 522, 525):
                self._static_unavailable_warning = f"Request blocked (HTTP {response.status}), skipping cleanly"
                return None
            response.raise_for_status()
            html = response.text
            text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
            if self._is_protected_page(text):
                self._static_unavailable_warning = "Triggered verification page, skipping cleanly"
                return None
            soup = BeautifulSoup(html, "html.parser")
            if not soup.select('a[href*="/books/info/"]') and not re.search(r"共\s*\d+\s*本", text):
                self._static_unavailable_warning = "公開搜尋頁未提供可驗證的靜態書目"
                return None
            print("[同人誌中心 Static] Parsed native public listing HTML")
            return html
        except requests.RequestException as error:
            self._static_unavailable_warning = f"Public HTTP request unavailable: {error}"
            print(f"[同人誌中心 Static] {self._static_unavailable_warning}")
            return None


    @staticmethod
    def _is_protected_page(text: str) -> bool:
        lowered = text.casefold()
        return any(marker in lowered for marker in ("cloudflare", "cf-chl", "just a moment", "captcha", "驗證"))

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        soup = BeautifulSoup(html, "html.parser")
        query_terms = [term.casefold() for term in keyword.split() if term]
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        # The site appends a separate "你可能會感興趣" recommendations block
        # after the official matches. Only cards directly inside books_list_con
        # belong to the declared `共 N 本` search total.
        primary_cards = soup.select(".books_list_con > .books_sim_info")
        anchors = [
            anchor
            for card in primary_cards
            for anchor in card.select('a[href*="/books/info/"]')
        ]
        if not anchors:
            # Retain tolerant parsing for small verified fixtures and pages
            # that use an older public card structure.
            anchors = soup.select('a[href*="/books/info/"]')

        for anchor in anchors:
            href = anchor.get("href")
            if not href:
                continue
            url = urljoin(self.base_url, href)
            if url in seen_urls or not url.startswith(f"{self.base_url}/books/info/"):
                continue

            card = anchor.find_parent("div", class_="books_sim_info") or anchor.find_parent(
                ["article", "li", "section", "div"]
            ) or anchor
            # On the production page, the image link contains sale-state text
            # such as "完售". The authoritative title is the matching strong
            # link inside the result card, not the image anchor's text.
            title_node = card.select_one("strong > a[href*='/books/info/']") or card.select_one(
                ".title, .book_name, h3, h4"
            )
            title = (title_node or anchor).get_text(" ", strip=True)
            if not title:
                image = anchor.select_one("img[alt]") or card.select_one("img[alt]")
                title = image.get("alt", "").strip() if image else ""
            card_text = card.get_text(" ", strip=True)
            searchable_text = f"{title} {card_text}".casefold()
            if not title or (query_terms and not any(term in searchable_text for term in query_terms)):
                continue

            image = anchor.select_one("img[src]") or card.select_one("img[src]")
            cover_url = urljoin(self.base_url, image.get("src")) if image and image.get("src") else None
            author_node = card.select_one(".painter_name a, .author, .author_name, .artist, [data-author]")
            author = author_node.get_text(" ", strip=True) if author_node else "未知創作者"
            summary_node = card.select_one(".books_view .info_txt, .summary, .description, .intro, p")
            summary = (summary_node.get_text(" ", strip=True) if summary_node else card_text)[:800]

            results.append(
                ScrapedFanfic(
                    id=f"doujin:{url}",
                    title=title[:240],
                    author=author[:160],
                    platform="同人誌中心",
                    url=url,
                    tags=keyword,
                    summary=summary,
                    coverUrl=cover_url,
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> int | None:
        """Prefer a verified search-header or paginator total over rendered cards."""
        soup = BeautifulSoup(html, "html.parser")
        result_nodes = soup.select(
            ".search_result_info, .search-results-info, .search-result-info, "
            ".listing-header, .pagination, .pager, [class*='search'][class*='info']"
        )
        candidate_text = " ".join(node.get_text(" ", strip=True) for node in result_nodes)
        # The production results page places `共 N 本` directly in its listing
        # header without a stable class. It is safe to inspect page text because
        # the exact book-count marker is distinct from pagination's `共 N 頁`.
        page_text = soup.get_text(" ", strip=True)
        patterns = (
            r"(?:共|總計)\s*([\d,]+)\s*(?:本|筆|件|項|部|作品|結果)",
            r"找到\s*([\d,]+)\s*(?:本|筆|件|項|部|作品|結果)",
            r"搜尋結果\s*(?:共)?\s*([\d,]+)\s*(?:本|筆|件|項|部|作品|結果)",
        )
        for pattern in patterns:
            match = re.search(pattern, candidate_text, re.IGNORECASE)
            if match:
                return int(match.group(1).replace(",", ""))
        page_match = re.search(r"共\s*([\d,]+)\s*本", page_text)
        if page_match:
            return int(page_match.group(1).replace(",", ""))
        return None

    @staticmethod
    def extract_total_pages(html: str) -> int | None:
        """Read the official page count from the result navigator when present."""
        soup = BeautifulSoup(html, "html.parser")
        pagination_text = " ".join(
            node.get_text(" ", strip=True)
            for node in soup.select("nav.pagination, .pagination, .pager, .pages")
        )
        match = re.search(r"(?:總共|共)\s*([\d,]+)\s*頁", pagination_text)
        return int(match.group(1).replace(",", "")) if match else None
