"""Best-effort adapter for publicly searchable Written in Waters forum posts.

The public Discuz forum may show a Cloudflare challenge to automated requests.
This adapter deliberately does not bypass any verification screen: it returns an
isolated empty payload and warning so other platform adapters keep working.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class WaterWriterScraper(BaseScraper):
    """Parse verified public forum search results from slashtw.space."""

    base_url = "https://slashtw.space"
    search_url = f"{base_url}/search.php"
    blocked_statuses = frozenset((403, 429, 503, 520, 521, 522, 525))
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
        "Referer": "https://slashtw.space/",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    }

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, object]:
        self.last_warning = None
        normalized_keyword = keyword.strip().casefold()
        if not normalized_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            with requests.Session() as session:
                session.headers.update(self.headers)
                form_response = session.get(self.search_url, timeout=12)
                if form_response.status_code in self.blocked_statuses:
                    return self._blocked(form_response.status_code)
                form_response.raise_for_status()

                form_soup = BeautifulSoup(form_response.text, "html.parser")
                formhash_input = form_soup.select_one('input[name="formhash"]')
                formhash = formhash_input.get("value") if formhash_input else None
                if not formhash:
                    self.last_warning = "[在水裡寫字] Search form did not expose a public formhash"
                    return {"items": [], "total_works": 0, "total_pages": 1}

                result_response = session.post(
                    f"{self.search_url}?mod=forum",
                    data={"formhash": formhash, "srchtxt": keyword, "searchsubmit": "yes"},
                    timeout=16,
                )
                if result_response.status_code in self.blocked_statuses:
                    return self._blocked(result_response.status_code)
                result_response.raise_for_status()
                if self._is_challenge_page(result_response.text):
                    self.last_warning = "[水裡寫字] Triggered Challenge, skipping cleanly"
                    print(self.last_warning)
                    return {"items": [], "total_works": 0, "total_pages": 1}

                items = self.parse_results(result_response.text, keyword)
                if not items:
                    self.last_warning = f"[在水裡寫字] No verified public result matched '{keyword}'"
                return {"items": items, "total_works": len(items), "total_pages": 1}
        except requests.RequestException as error:
            self.last_warning = f"[在水裡寫字] Request unavailable: {error}"
            print(self.last_warning)
            return {"items": [], "total_works": 0, "total_pages": 1}
        except Exception as error:
            self.last_warning = f"[在水裡寫字] Parse failed safely: {error}"
            print(self.last_warning)
            return {"items": [], "total_works": 0, "total_pages": 1}

    def _blocked(self, status_code: int) -> dict[str, object]:
        self.last_warning = f"[水裡寫字] Request blocked (HTTP {status_code}), skipping cleanly"
        print(self.last_warning)
        return {"items": [], "total_works": 0, "total_pages": 1}

    @staticmethod
    def _is_challenge_page(html: str) -> bool:
        page_text = html.casefold()
        return any(marker in page_text for marker in ("cdn-cgi", "cf-chl", "cloudflare", "error.jpg"))

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        """Parse only forum thread cards that expose a verified public thread URL."""
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for anchor in soup.select('a[href*="mod=viewthread"], a[href*="thread-"]'):
            href = anchor.get("href")
            if not href:
                continue
            url = urljoin(self.base_url, href)
            if url in seen_urls or not url.startswith(self.base_url):
                continue

            card = anchor.find_parent(["li", "dl", "article", "div"]) or anchor
            title_node = card.select_one("h3 a, h4 a, .xs2 a, a")
            title = (title_node or anchor).get_text(" ", strip=True)
            card_text = card.get_text(" ", strip=True)
            if not title or keyword.casefold() not in f"{title} {card_text}".casefold():
                continue

            author_node = card.select_one(".xg1 a, .author a, a[href*='mod=space']")
            author = author_node.get_text(" ", strip=True) if author_node else "在水裡寫字作者"
            time_node = card.select_one("time, .xg1, .xg2")
            updated_at = time_node.get_text(" ", strip=True) if time_node else None
            tags = [
                tag.get_text(" ", strip=True)
                for tag in card.select(".tag a, .p_pop a, a[href*='mod=forum']")
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
