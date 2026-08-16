from __future__ import annotations
from datetime import datetime
from urllib.parse import quote_plus
import requests

from scrapers.base_scraper import BaseScraper
from models import ScrapedFanfic


class LofterScraper(BaseScraper):
    """Lofter best-effort adapter with silent error isolation (returns [] on 403/429/525 or offline)."""

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> list[ScrapedFanfic]:
        self.last_warning = None
        results: list[ScrapedFanfic] = []

        try:
            tag_url = f"https://www.lofter.com/tag/{quote_plus(keyword)}"
            headers = {
                "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
                "Referer": "https://www.lofter.com/",
            }
            response = requests.get(tag_url, headers=headers, timeout=10)
            if response.status_code in (403, 429, 525, 404):
                self.last_warning = f"[Lofter] Request blocked (HTTP {response.status_code})"
                print(self.last_warning)
                return []
            
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, "html.parser")
            posts = soup.select(".m-post, article, .imgc")
            for post in posts[:15]:
                title_el = post.select_one(".title, h2, a")
                title = title_el.get_text(strip=True)[:30] if title_el else f"Lofter 貼文 ({keyword})"
                link_el = post.select_one("a")
                href = link_el.get("href", "") if link_el else tag_url
                if href.startswith("/"):
                    href = f"https://www.lofter.com{href}"
                
                author_el = post.select_one(".author, .name")
                author = author_el.get_text(strip=True) if author_el else "Lofter 創作者"

                summary_el = post.select_one(".ct, .text, p")
                summary = summary_el.get_text(strip=True) if summary_el else ""

                item = ScrapedFanfic(
                    id=f"lofter:{href}",
                    title=title or f"Lofter: {keyword}",
                    author=author,
                    platform="Lofter",
                    url=href,
                    tags=keyword,
                    summary=summary,
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
                results.append(item)
        except Exception as e:
            self.last_warning = f"[Lofter] Request blocked or offline: {e}"
            print(self.last_warning)

        return results
