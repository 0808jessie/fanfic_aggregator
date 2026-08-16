"""Public-search adapter for Written in Waters (在水裡寫字).

The forum may require human verification or apply Discuz search cooldowns. This
adapter reads only the public result page, detects those responses, and exits
cleanly without trying to solve a challenge or reuse verification credentials.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlencode, urljoin

from bs4 import BeautifulSoup
import requests

from constants.cp_tags import CPTagConfig, get_keyword_for_platform
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicPageUnavailable(RuntimeError):
    """Raised only for a protected, cooled-down, or unavailable public page."""


class WaterWriterScraper(BaseScraper):
    """Parse server-rendered Discuz thread search results from slashtw.space."""

    base_url = "https://slashtw.space"
    search_url = f"{base_url}/search.php"
    desktop_user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    )
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/",
        "User-Agent": desktop_user_agent,
    }
    result_selectors = ("#threadlist", ".threadlist", ".pbw", "dt.xs0")

    @classmethod
    def build_search_url(cls, keyword: str, mode: str = "keyword") -> str:
        """Build the public Discuz quick-search URL without hidden form state."""
        parameters = {"searchsubmit": "yes"}
        if mode == "author":
            parameters["srchuname"] = keyword
        else:
            parameters.update({"srchtxt": keyword, "srchfid": "all"})
        return f"{cls.search_url}?{urlencode(parameters)}"

    def scrape(
        self,
        keyword: str,
        page: int = 1,
        force_refresh: bool = False,
        custom_cp_map: Optional[dict[str, CPTagConfig]] = None,
        mode: str = "keyword",
    ) -> dict[str, object]:
        self.last_warning = None
        if not keyword.strip():
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            # Discuz treats whitespace-separated terms as a restrictive AND
            # search. Send the user's primary literal term instead of a mapped
            # multi-name CP expansion, while retaining the original query on
            # returned records for relevance and history.
            search_keyword = keyword.strip() if mode == "author" else keyword.strip().split()[0]
            html = (
                self._fetch_static_search_html(search_keyword, "author")
                if mode == "author"
                else self._fetch_static_search_html(search_keyword)
            )
            if html is None:
                return {"items": [], "total_works": 0, "total_pages": 1}
            items = self.parse_results(html, search_keyword)
            total_works = self.extract_total_works(html) or len(items)
            for item in items:
                item.keyword = keyword
            print(f"[在水裡寫字] 成功抓取 {len(items)} 筆")
            if not items:
                self.last_warning = f"[在水裡寫字] No verified public result matched '{keyword}'"
            return {"items": items, "total_works": total_works, "total_pages": 1}
        except _PublicPageUnavailable as error:
            self.last_warning = f"[在水裡寫字] {error}"
            print(self.last_warning)
        except Exception as error:
            self.last_warning = f"[在水裡寫字] Public HTTP parse failed safely: {error}"
            print(self.last_warning)
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_static_search_html(self, keyword: str, mode: str = "keyword") -> Optional[str]:
        """Use Discuz's server-rendered public search HTML with a generous GET."""
        try:
            response = requests.get(
                self.build_search_url(keyword, mode),
                headers=self.headers,
                timeout=(5, 12),
            )
            if response.status_code in (403, 429, 503, 520, 521, 522, 525):
                raise _PublicPageUnavailable(f"Request blocked (HTTP {response.status_code}), skipping cleanly")
            response.raise_for_status()
            html = response.text
            text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True)
            if self._is_challenge_page(text) or self._is_search_cooldown_page(text):
                raise _PublicPageUnavailable("Triggered verification or cooldown page, skipping cleanly")
            soup = BeautifulSoup(html, "html.parser")
            if not soup.select("a[href*='viewthread'], a[href*='forum.php?mod=viewthread']") and not re.search(r"(?:共檢索到|找到相關內容)", text):
                raise _PublicPageUnavailable("Public search page has no verifiable result markup")
            print("[在水裡寫字 Static] Parsed public search HTML")
            return html
        except requests.RequestException as error:
            raise _PublicPageUnavailable(f"Public HTTP request unavailable: {error}") from error

    @staticmethod
    def _is_challenge_page(text: str) -> bool:
        page_text = text.casefold()
        return any(marker in page_text for marker in ("cdn-cgi", "cf-chl", "cloudflare", "just a moment", "captcha", "error.jpg"))

    @staticmethod
    def _is_search_cooldown_page(text: str) -> bool:
        page_text = text.casefold()
        return any(
            marker in page_text
            for marker in ("20 秒", "20秒", "search is too frequent", "flood control", "請等待", "只能進行一次搜尋")
        )

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        """Parse only verified public viewthread links from rendered Discuz markup."""
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for anchor in soup.select('a[href*="mod=viewthread"], a[href*="thread-"]'):
            href = anchor.get("href")
            if not href:
                continue
            url = urljoin(self.base_url, href)
            if url in seen_urls or not url.startswith(f"{self.base_url}/forum.php"):
                continue

            # Discuz places each result in an individual ``li`` below #threadlist.
            # Select that closest row instead of its shared list wrapper, otherwise
            # every parsed item would inherit the first row's title and summary.
            card = anchor.find_parent("li") or anchor.find_parent(["dl", "article", "div"]) or anchor
            title = anchor.get_text(" ", strip=True)
            card_text = card.get_text(" ", strip=True)
            searchable_text = f"{title} {card_text}".casefold()
            query_terms = [term.casefold() for term in keyword.split() if term]
            if not title or (query_terms and not any(term in searchable_text for term in query_terms)):
                continue

            author_node = card.select_one(".xg1 a[href*='mod=space'], .author a, a[href*='mod=space']")
            author = author_node.get_text(" ", strip=True) if author_node else "未知作者"
            time_node = card.select_one("time, .xg1, .xg2")
            updated_at = time_node.get_text(" ", strip=True) if time_node else None
            tags = [
                tag.get_text(" ", strip=True)
                for tag in card.select(".tag a, .p_pop a, a[href*='mod=forumdisplay']")
                if tag.get_text(" ", strip=True)
            ]
            summary = re.sub(r"\s+", " ", card_text).strip()[:800]

            results.append(
                ScrapedFanfic(
                    id=f"waterwriter:{url}",
                    title=title[:240],
                    author=author[:160],
                    platform="在水裡寫字",
                    url=url,
                    tags=", ".join(dict.fromkeys(tags)),
                    summary=summary,
                    updatedAt=updated_at[:160] if updated_at else None,
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> Optional[int]:
        """Read Discuz's explicit all-site topic count without guessing from cards."""
        soup = BeautifulSoup(html, "html.parser")
        result_nodes = soup.select("#ct, .ct2, .search_result, .search-results, .pg, .pgb")
        candidate_text = " ".join(node.get_text(" ", strip=True) for node in result_nodes) or soup.get_text(" ", strip=True)
        patterns = (
            r"共\s*檢索到\s*([\d,]+)\s*篇\s*主題",
            r"(?:結果\s*:\s*)?找到\s*.+?\s*相關內容\s*([\d,]+)\s*(?:個|篇|項)",
        )
        for pattern in patterns:
            match = re.search(pattern, candidate_text)
            if match:
                return int(match.group(1).replace(",", ""))
        return None
