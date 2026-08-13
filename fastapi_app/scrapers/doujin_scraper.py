"""Best-effort adapter for publicly visible Doujinshi Center book listings.

The source may place a Cloudflare challenge in front of automated requests. This
adapter never attempts to bypass that challenge: it returns an isolated empty
result with a diagnostic warning, so the other platform adapters continue.
"""

from __future__ import annotations

from datetime import datetime
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class DoujinScraper(BaseScraper):
    """Parse verified public /books/info/ listing cards from doujin.com.tw."""

    base_url = "https://www.doujin.com.tw"
    search_url = f"{base_url}/books/search"
    blocked_statuses = frozenset((403, 429, 503, 520, 521, 522, 525))

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, object]:
        self.last_warning = None
        normalized_keyword = keyword.strip().casefold()
        if not normalized_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            response = requests.get(
                self.search_url,
                params={"q": keyword},
                headers={
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
                    "Referer": "https://www.doujin.com.tw/",
                    "Origin": "https://www.doujin.com.tw",
                    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
                },
                timeout=12,
            )
            if response.status_code in self.blocked_statuses:
                self.last_warning = f"[同人誌中心] Request blocked (HTTP {response.status_code}), skipping cleanly"
                print(self.last_warning)
                return {"items": [], "total_works": 0, "total_pages": 1}

            response.raise_for_status()
            page_text = response.text.casefold()
            if "just a moment" in page_text or "cf-chl" in page_text or "cloudflare" in page_text and "/books/info/" not in page_text:
                self.last_warning = "[同人誌中心] Triggered Challenge, skipping cleanly"
                print(self.last_warning)
                return {"items": [], "total_works": 0, "total_pages": 1}

            soup = BeautifulSoup(response.text, "html.parser")
            results: list[ScrapedFanfic] = []
            seen_urls: set[str] = set()

            for anchor in soup.select('a[href*="/books/info/"]'):
                href = anchor.get("href")
                if not href:
                    continue
                url = urljoin(self.base_url, href)
                if url in seen_urls or not url.startswith(f"{self.base_url}/books/info/"):
                    continue

                card = anchor.find_parent(["article", "li", "section", "div"]) or anchor
                title = anchor.get_text(" ", strip=True)
                if not title:
                    image = anchor.select_one("img[alt]")
                    title = image.get("alt", "") if image else ""
                card_text = card.get_text(" ", strip=True)
                # A challenge page or generic listing may show unrelated books. Keep only
                # cards whose visible public metadata contains the requested keyword.
                if normalized_keyword not in f"{title} {card_text}".casefold():
                    continue

                image = anchor.select_one("img[src]") or card.select_one("img[src]")
                cover_url = urljoin(self.base_url, image.get("src")) if image and image.get("src") else None
                author_node = card.select_one(".author, .artist, [data-author]")
                author = author_node.get_text(" ", strip=True) if author_node else "同人誌中心創作者"
                summary_node = card.select_one(".summary, .description, .intro, p")
                summary = summary_node.get_text(" ", strip=True) if summary_node else card_text
                summary = summary[:800]

                results.append(
                    ScrapedFanfic(
                        id=f"doujin:{url}",
                        title=title[:240] or f"同人誌中心作品：{keyword}",
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

            if not results:
                self.last_warning = f"[同人誌中心] No verified public result matched '{keyword}'"
            return {"items": results, "total_works": len(results), "total_pages": 1}
        except requests.RequestException as error:
            self.last_warning = f"[同人誌中心] Request unavailable: {error}"
            print(self.last_warning)
            return {"items": [], "total_works": 0, "total_pages": 1}
        except Exception as error:
            self.last_warning = f"[同人誌中心] Parse failed safely: {error}"
            print(self.last_warning)
            return {"items": [], "total_works": 0, "total_pages": 1}
