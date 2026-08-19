"""Public, static search adapter for Bahamut Creation Hall novel entries.

The adapter intentionally reads only the server-rendered public search page.
It never logs in, creates browser windows, or attempts to solve site protections.
Because the search page contains several creative-media types, results are kept
only when Bahamut's publicly rendered novel icon is present.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlencode, urljoin, urlparse

from bs4 import BeautifulSoup
import requests

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicPageUnavailable(RuntimeError):
    """Raised when a public source page cannot be safely parsed."""


class BahamutScraper(BaseScraper):
    """Index only verified novel cards from Bahamut's public tag search."""

    base_url = "https://home.gamer.com.tw"
    search_url = f"{base_url}/search.php"
    connect_timeout_seconds = 4
    read_timeout_seconds = 12
    # ``IMG-C08`` was verified against Bahamut's public novel listing. Unknown
    # icon types are intentionally excluded rather than guessed to be text work.
    novel_icon_classes = frozenset({"IMG-C08"})
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ),
    }

    @classmethod
    def build_search_url(cls, keyword: str, page: int = 1) -> str:
        """Build Bahamut's documented public tag-search URL."""
        parameters = {"page": max(1, page), "keyword": keyword.strip(), "o": "tag", "v": "3"}
        return f"{cls.search_url}?{urlencode(parameters)}"

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
            html = self._fetch_public_search_html(normalized_keyword, page)
            items = self.parse_results(html, normalized_keyword)
            total_pages = self.extract_total_pages(html) or 1
            if not items:
                self.last_warning = f"[巴哈姆特創作大廳] No verified public novel result matched '{normalized_keyword}'"
            return {"items": items, "total_works": 0, "total_pages": total_pages}
        except _PublicPageUnavailable as error:
            self.last_warning = f"[巴哈姆特創作大廳] {error}"
        except Exception as error:
            self.last_warning = f"[巴哈姆特創作大廳] Public HTTP parse failed safely: {error}"
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_public_search_html(self, keyword: str, page: int) -> str:
        """Fetch one public rendered result page without browser fallback."""
        try:
            response = requests.get(
                self.build_search_url(keyword, page),
                headers=self.headers,
                timeout=(self.connect_timeout_seconds, self.read_timeout_seconds),
            )
            if response.status_code in (401, 403, 429, 503, 520, 521, 522, 525):
                raise _PublicPageUnavailable(f"Request blocked (HTTP {response.status_code}), skipping cleanly")
            response.raise_for_status()
            html = response.text
        except requests.RequestException as error:
            raise _PublicPageUnavailable(f"Public HTTP request unavailable: {error}") from error

        page_text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True).casefold()
        challenge_markers = ("cloudflare", "just a moment", "cdn-cgi", "cf-chl", "captcha", "安全驗證")
        if any(marker in page_text for marker in challenge_markers):
            raise _PublicPageUnavailable("Triggered verification page, skipping cleanly")
        if not BeautifulSoup(html, "html.parser").select("div.HOME-mainbox1") and "搜尋：" not in page_text:
            raise _PublicPageUnavailable("Public search page has no verifiable result markup")
        return html

    @classmethod
    def _is_verified_creation_url(cls, value: str) -> bool:
        parsed = urlparse(value)
        return parsed.scheme == "https" and parsed.netloc == "home.gamer.com.tw" and parsed.path.endswith("creationDetail.php") and bool(parsed.query)

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        """Map only publicly marked novel cards to the canonical API model."""
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for card in soup.select("div.HOME-mainbox1"):
            title_anchor = card.select_one('a.TS1[href*="creationDetail.php?sn="]')
            type_icon = card.select_one("h1 img[class]")
            if not title_anchor or not type_icon:
                continue
            icon_classes = set(type_icon.get("class", []))
            if not icon_classes.intersection(self.novel_icon_classes):
                continue

            href = str(title_anchor.get("href") or "").strip()
            url = urljoin(f"{self.base_url}/", href)
            if url in seen_urls or not self._is_verified_creation_url(url):
                continue

            title = title_anchor.get_text(" ", strip=True)
            author_node = card.select_one("span.ST1 a[href*='home.gamer.com.tw']")
            author = author_node.get_text(" ", strip=True) if author_node else "未知作者"
            metadata_text = (card.select_one("span.ST1").get_text(" ", strip=True) if card.select_one("span.ST1") else "")
            date_match = re.search(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}", metadata_text)
            summary_nodes = card.select("div.HOME-mainbox1b > p")
            summary = ""
            for node in reversed(summary_nodes):
                candidate = re.sub(r"\s+", " ", node.get_text(" ", strip=True)).replace("繼續閱讀", "").strip(" .()")
                if candidate:
                    summary = candidate[:800]
                    break
            cover_node = card.select_one("div.HOME-mainbox1a img[src]")
            cover_url = urljoin(f"{self.base_url}/", str(cover_node.get("src"))) if cover_node else None
            if cover_url and urlparse(cover_url).netloc not in {"p2.bahamut.com.tw", "avatar2.bahamut.com.tw"}:
                cover_url = None

            if not title:
                continue
            results.append(
                ScrapedFanfic(
                    id=f"bahamut:{url}",
                    title=title[:240],
                    author=author[:160] or "未知作者",
                    platform="巴哈姆特創作大廳",
                    url=url,
                    tags=f"小說, {keyword}",
                    summary=summary,
                    coverUrl=cover_url,
                    updatedAt=date_match.group(0) if date_match else None,
                    language="zh-TW",
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_pages(html: str) -> int | None:
        """Use only rendered pagination numbers; Bahamut exposes no reliable total count."""
        soup = BeautifulSoup(html, "html.parser")
        numbers = []
        for anchor in soup.select("#BH-pagebtn a"):
            text = anchor.get_text(" ", strip=True)
            if text.isdigit():
                numbers.append(int(text))
        return max(numbers) if numbers else None
