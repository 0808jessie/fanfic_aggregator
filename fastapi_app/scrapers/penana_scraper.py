"""Best-effort adapter for publicly visible Penana Finder story results."""

from __future__ import annotations

from datetime import datetime
import re
from urllib.parse import quote, urljoin

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class PenanaScraper(BaseScraper):
    """Parse server-rendered public Penana Finder cards with bounded HTTP only."""

    base_url = "https://www.penana.com"
    detail_enrichment_limit = 3
    search_headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://www.penana.com/",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        # Compatibility hints sent by an ordinary Chromium navigation. They do
        # not attempt to solve or bypass a verification challenge; 403 pages
        # remain a source-level blocked state.
        "Sec-CH-UA": '"Chromium";v="124", "Not.A/Brand";v="24"',
        "Sec-CH-UA-Mobile": "?0",
        "Sec-CH-UA-Platform": '"Windows"',
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "same-origin",
        "Sec-Fetch-User": "?1",
    }

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False, mode: str = "keyword") -> dict[str, object]:
        self.last_warning = None
        trimmed_keyword = keyword.strip()
        if not trimmed_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}
        items: list[ScrapedFanfic] = []
        official_total: int | None = None
        try:
            lightweight_html = self._fetch_public_search_html(trimmed_keyword)
            if lightweight_html:
                items = self.parse_results(lightweight_html, trimmed_keyword)
                official_total = self.extract_total_works(lightweight_html)

            if not items:
                self.last_warning = self.last_warning or f"[Penana] No verified public story result matched '{trimmed_keyword}'"
            # Do not use the visible page-card length as an all-site count. If
            # Penana does not render a verified result heading, callers receive
            # zero rather than an inflated official total.
            return {"items": items, "total_works": official_total or 0, "total_pages": 1}
        except Exception as error:
            self.last_warning = f"[Penana] Request unavailable or parse failed safely: {error}"
            print(self.last_warning)
            return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_public_search_html(self, keyword: str) -> str | None:
        """Fetch the ordinary public Finder document with curl_cffi chrome124 impersonation and safety isolation."""
        try:
            response = curl_requests.get(
                f"{self.base_url}/search",
                params={"t": "story", "search": keyword},
                headers=self.search_headers,
                impersonate="chrome124",
                timeout=12,
            )
            if response.status_code in (403, 520, 521, 522, 525):
                retry_after = response.headers.get("Retry-After") if getattr(response, "headers", None) else None
                retry_hint = f"；建議 {retry_after} 秒後單獨重試" if retry_after and retry_after.isdigit() else ""
                self.last_warning = f"[Penana] 觸發人機保護（HTTP {response.status_code}）{retry_hint}"
                return None
            if response.status_code in (429, 503):
                self.last_warning = f"[Penana] Public Finder 暫時不可用（HTTP {response.status_code}）"
                return None
            response.raise_for_status()
            if self._is_verification_page(response.text):
                self.last_warning = "[Penana] 觸發人機保護（驗證頁）"
                return None
            return response.text
        except Exception as error:
            self.last_warning = "[Penana] Public Finder HTTP request unavailable"
            print(f"[Penana] Public Finder fetch unavailable: {error}")
            return None

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        for card in soup.select(".newXbox.p0.storydata"):
            title_anchor = card.select_one('.hiddenInfo a.newBookTitle[href^="/story/"]')
            if not title_anchor:
                continue
            href = title_anchor.get("href")
            if not href:
                continue
            url = urljoin(self.base_url, href)
            title = title_anchor.get_text(" ", strip=True)
            if not title or url in seen_urls or not url.startswith(f"{self.base_url}/story/"):
                continue

            author_node = card.select_one(".newAuthorname")
            summary_node = card.select_one(".hiddenInfo .storyInfo p")
            tag_nodes = card.select('.hiddenInfo .storyTag a[href^="/tag/"]')
            update_node = card.select_one(".newBookData .time")
            card_text = card.get_text(" ", strip=True).casefold()
            is_complete = True if any(marker in card_text for marker in ("completed", "complete", "已完結", "完結")) else None

            results.append(
                ScrapedFanfic(
                    id=f"penana:{url}",
                    title=title[:240],
                    author=author_node.get_text(" ", strip=True)[:160] if author_node else "Penana 作者",
                    platform="Penana",
                    url=url,
                    tags=", ".join(tag.get_text(" ", strip=True) for tag in tag_nodes if tag.get_text(" ", strip=True)),
                    summary=summary_node.get_text(" ", strip=True)[:800] if summary_node else "",
                    wordCount=None,
                    updatedAt=update_node.get_text(" ", strip=True)[:160] if update_node else None,
                    isComplete=is_complete,
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> int | None:
        """Read Penana Finder's declared result count from its search title bar.

        The Finder has used both Traditional Chinese and English title variants
        across its rendered and non-rendered pages. Only explicit result labels
        are considered; ordinary card metadata and pagination are excluded.
        """
        soup = BeautifulSoup(html, "html.parser")
        title_nodes = soup.select(
            "h1, h2, h3, .search-title, .searchTitle, .search-result-title, "
            ".searchResultTitle, .finder-title, [class*='search'][class*='title'], "
            "[class*='result'][class*='title']"
        )
        candidate_text = " ".join(node.get_text(" ", strip=True) for node in title_nodes)
        patterns = (
            r"(?:search\s*results?|results?)\s*[:：(]?\s*\(?\s*([\d,]+)\s*\)?",
            r"(?:found|找到|搜尋結果(?:共)?|共)\s*([\d,]+)\s*(?:stories?|works?|作品|項目|筆|本|部|結果)",
            r"([\d,]+)\s*(?:stories?|works?|作品|項目|筆|本|部|結果)\s*(?:found|搜尋結果)?",
        )
        for pattern in patterns:
            match = re.search(pattern, candidate_text, re.IGNORECASE)
            if match:
                return int(match.group(1).replace(",", ""))
        return None

    @staticmethod
    def _is_verification_page(html: str) -> bool:
        page_text = html.casefold()
        return any(marker in page_text for marker in ("cf-chl", "cdn-cgi", "just a moment", "cloudflare"))

    @staticmethod
    def parse_detail_metadata(html: str) -> dict[str, str | bool | None]:
        """Read word count and status only from explicitly labelled detail-page nodes."""
        soup = BeautifulSoup(html, "html.parser")
        word_node = soup.select_one('span[title="Word Count"] .bkwords')
        word_count = PenanaScraper._normalize_word_count(word_node.get_text(" ", strip=True) if word_node else "")

        status_text = " ".join(
            node.get_text(" ", strip=True)
            for node in soup.select(".storyStatus, .story_status, .status, [data-status], .storyProperty")
        ).casefold()
        is_complete: bool | None = None
        if re.search(r"\bcompleted\b|\bcomplete\b|已完結|完結", status_text):
            is_complete = True
        elif re.search(r"\bin progress\b|\bon break\b|\bplanning\b|連載|未完", status_text):
            is_complete = False
        return {"wordCount": word_count, "isComplete": is_complete}

    @staticmethod
    def _normalize_word_count(value: str) -> str | None:
        """Convert a labelled Penana count such as ``3.2K`` into a filterable count."""
        compact = value.strip().replace(",", "")
        match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([kKmM]?)", compact)
        if not match:
            return None
        amount = float(match.group(1))
        unit = match.group(2).casefold()
        multiplier = 1_000_000 if unit == "m" else 1_000 if unit == "k" else 1
        return f"{int(amount * multiplier):,} words"
