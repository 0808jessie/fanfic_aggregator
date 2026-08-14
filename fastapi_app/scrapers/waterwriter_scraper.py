"""Public-search adapter for Written in Waters (在水裡寫字).

The forum may require human verification or apply Discuz search cooldowns. This
adapter renders only the public result page, detects those responses, and exits
cleanly without trying to solve a challenge or reuse verification credentials.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urlencode, urljoin

from bs4 import BeautifulSoup

from constants.cp_tags import get_keyword_for_platform
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - deployment dependency guard
    sync_playwright = None


class _PublicPageUnavailable(RuntimeError):
    """Raised only for a protected, cooled-down, or unavailable public page."""


class WaterWriterScraper(BaseScraper):
    """Parse publicly rendered Discuz thread search results from slashtw.space."""

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
    def build_search_url(cls, keyword: str) -> str:
        """Build the public Discuz quick-search URL without hidden form state."""
        return f"{cls.search_url}?{urlencode({'srchtxt': keyword, 'searchsubmit': 'yes', 'srchfid': 'all'})}"

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, object]:
        self.last_warning = None
        if not keyword.strip():
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            local_query = get_keyword_for_platform(keyword, "local")
            html = self._render_public_search_html(local_query)
            items = self.parse_results(html, local_query)
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
            self.last_warning = f"[在水裡寫字] Browser render failed safely: {error}"
            print(self.last_warning)
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _render_public_search_html(self, keyword: str) -> str:
        if sync_playwright is None:
            raise _PublicPageUnavailable("Playwright is unavailable; skipping cleanly")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                context = browser.new_context(
                    user_agent=self.desktop_user_agent,
                    locale="zh-TW",
                    viewport={"width": 1280, "height": 900},
                    extra_http_headers={"Accept-Language": self.headers["Accept-Language"], "Referer": self.headers["Referer"]},
                )
                page = context.new_page()
                response = page.goto(self.build_search_url(keyword), timeout=18000, wait_until="domcontentloaded")
                if response and response.status in (403, 429, 503, 520, 521, 522, 525):
                    raise _PublicPageUnavailable(f"Request blocked (HTTP {response.status}), skipping cleanly")

                # This is a bounded rendering wait, not an attempt to complete verification.
                page.wait_for_timeout(1200)
                body_text = page.locator("body").inner_text(timeout=3000)
                if self._is_challenge_page(body_text):
                    raise _PublicPageUnavailable("Triggered Challenge, skipping cleanly")
                if self._is_search_cooldown_page(body_text):
                    raise _PublicPageUnavailable("Blocked by Rate Limit, skipping cleanly")

                for selector in self.result_selectors:
                    try:
                        page.wait_for_selector(selector, timeout=2000)
                        break
                    except Exception:
                        continue

                return page.content()
            finally:
                try:
                    context.close()
                finally:
                    browser.close()

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
    def extract_total_works(html: str) -> int | None:
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
