"""CxC 創利市集的公開搜尋 Adapter。

CxC 搜尋頁以前端渲染為主，因此本 Adapter 僅解析瀏覽器實際取得的
公開作品卡片。頁面持續停在載入畫面、逾時或未產生可信作品連結時，
會安全回傳空結果並保留來源警示，不會產生猜測或 placeholder 資料。
"""

from __future__ import annotations

from datetime import datetime
import re
from urllib.parse import urlencode, urljoin

from bs4 import BeautifulSoup

from constants.cp_tags import get_keyword_for_platform
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - deployment dependency guard
    sync_playwright = None


class _PublicSearchUnavailable(RuntimeError):
    """Raised when CxC does not expose a verified public search listing."""


class CxCScraper(BaseScraper):
    """Parse verified public CxC work cards from the rendered search page."""

    base_url = "https://cxc.today"
    search_url = f"{base_url}/zh/search"
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
    )
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/",
        "User-Agent": user_agent,
    }
    work_link_selector = 'a[href*="/@"][href*="/work"], a[href*="/works/"]'
    rendered_work_selector = ".cxc-work-item, .cxc-store-card, .store-card, .book-card, a[href*='/works/'], a[href*='/@'][href*='/work']"

    @classmethod
    def build_search_url(cls, keyword: str) -> str:
        """Build CxC's public keyword search URL without private state."""
        return f"{cls.search_url}?{urlencode({'keyword': keyword})}"

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, object]:
        self.last_warning = None
        if not keyword.strip():
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            local_query = get_keyword_for_platform(keyword, "local")
            html = self._render_public_search_html(local_query)
            items = self.parse_results(html, local_query)
            for item in items:
                item.keyword = keyword
            total_works = self.extract_total_works(html) or len(items)
            if not items:
                self.last_warning = f"[CxC] No verified public result matched '{keyword}'"
            print(f"[CxC] 成功抓取 {len(items)} 筆，公開總數 {total_works}")
            return {"items": items, "total_works": total_works, "total_pages": 1}
        except _PublicSearchUnavailable as error:
            self.last_warning = f"[CxC] {error}"
            print(self.last_warning)
        except Exception as error:
            self.last_warning = f"[CxC] Browser render failed safely: {error}"
            print(self.last_warning)
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _render_public_search_html(self, keyword: str) -> str:
        if sync_playwright is None:
            raise _PublicSearchUnavailable("Playwright is unavailable; skipping cleanly")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            try:
                context = browser.new_context(
                    user_agent=self.user_agent,
                    locale="zh-TW",
                    viewport={"width": 1280, "height": 900},
                    extra_http_headers={"Accept-Language": self.headers["Accept-Language"], "Referer": self.headers["Referer"]},
                )
                page_obj = context.new_page()
                response = page_obj.goto(self.build_search_url(keyword), timeout=18000, wait_until="domcontentloaded")
                if response and response.status in (403, 429, 503, 520, 521, 522, 525):
                    raise _PublicSearchUnavailable(f"Request blocked (HTTP {response.status}), skipping cleanly")

                try:
                    # CxC's listing is client-rendered. Wait only for public work
                    # cards, never for private state or verification completion.
                    page_obj.wait_for_selector(self.rendered_work_selector, timeout=7000)
                except Exception:
                    # Some public CxC deployments render cards only after a
                    # search response. Wait briefly for that public response,
                    # then give the known card selectors one final bounded pass.
                    try:
                        page_obj.wait_for_response(
                            lambda candidate: "/search" in candidate.url and candidate.status == 200,
                            timeout=3000,
                        )
                        page_obj.wait_for_selector(self.rendered_work_selector, timeout=4000)
                    except Exception:
                        # A genuine no-result page is permitted; the loading
                        # check below distinguishes it from an unresolved spinner.
                        page_obj.wait_for_timeout(500)
                html = page_obj.content()
                soup = BeautifulSoup(html, "html.parser")
                if not soup.select(self.work_link_selector) and soup.select_one(".hourglass_loading.show, .q-spinner, [class*='loading']"):
                    raise _PublicSearchUnavailable("Public search did not finish rendering; skipping cleanly")
                return html
            finally:
                try:
                    context.close()
                finally:
                    browser.close()

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        """Normalize only public CxC work links with visible card metadata."""
        soup = BeautifulSoup(html, "html.parser")
        query_terms = [term.casefold() for term in keyword.split() if term]
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for anchor in soup.select(self.work_link_selector):
            href = (anchor.get("href") or "").strip()
            url = urljoin(self.base_url, href)
            if not self.is_real_work_url(url) or url in seen_urls:
                continue

            card = anchor.find_parent(["article", "li", "section"]) or anchor.find_parent("div") or anchor
            title_node = card.select_one(".title, .work-title, h2, h3, h4, [class*='title']")
            title = (title_node or anchor).get_text(" ", strip=True)
            card_text = card.get_text(" ", strip=True)
            if not title or (query_terms and not any(term in f"{title} {card_text}".casefold() for term in query_terms)):
                continue

            author_node = card.select_one(".creator, .author, [class*='creator'], [class*='author']")
            author = author_node.get_text(" ", strip=True) if author_node else "未知創作者"
            image = card.select_one("img[src]") or anchor.select_one("img[src]")
            cover_url = urljoin(self.base_url, image.get("src")) if image and image.get("src") else None
            tags = [
                node.get_text(" ", strip=True)
                for node in card.select(".tag, .tags a, [class*='tag']")
                if node.get_text(" ", strip=True)
            ]

            results.append(
                ScrapedFanfic(
                    id=f"cxc:{url}",
                    title=title[:240],
                    author=author[:160],
                    platform="CxC 創利市集",
                    url=url,
                    tags=", ".join(dict.fromkeys(tags)),
                    summary=card_text[:800],
                    coverUrl=cover_url,
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> int | None:
        """Read an explicit public CxC result total without inferring from cards."""
        soup = BeautifulSoup(html, "html.parser")
        total_nodes = soup.select(
            ".search-result-count, .search-results-count, .result-count, "
            "[data-total], [data-result-count], [class*='search'][class*='count']"
        )
        candidate_text = " ".join(node.get_text(" ", strip=True) for node in total_nodes)
        patterns = (
            r"(?:共|找到|總計)\s*([\d,]+)\s*(?:部|本|篇|項)?\s*(?:作品|結果|創作)",
            r"([\d,]+)\s*(?:results?|works?)\b",
        )
        for node in total_nodes:
            for attribute in ("data-total", "data-result-count"):
                raw_total = (node.get(attribute) or "").strip()
                if raw_total.replace(",", "").isdigit():
                    return int(raw_total.replace(",", ""))
        for pattern in patterns:
            match = re.search(pattern, candidate_text, re.IGNORECASE)
            if match:
                return int(match.group(1).replace(",", ""))
        return None

    @classmethod
    def is_real_work_url(cls, url: str) -> bool:
        """Constrain card links to CxC public creator-work routes."""
        return url.startswith(f"{cls.base_url}/@") and "/work/" in url or url.startswith(f"{cls.base_url}/works/")
