from datetime import datetime
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class AO3Scraper(BaseScraper):
    """AO3 HTML search adapter."""

    BASE_URL = "https://archiveofourown.org"
    SEARCH_PATH = "/works/search"

    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        search_url = f"{self.BASE_URL}{self.SEARCH_PATH}?work_search%5Bquery%5D={quote_plus(keyword)}"
        headers = {"User-Agent": "FanficAtlas/0.1 (+local research tool)"}

        try:
            response = requests.get(search_url, headers=headers, timeout=12)
            response.raise_for_status()
        except requests.RequestException as error:
            print(f"[AO3] request failed: {error}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results: list[ScrapedFanfic] = []
        for work in soup.select("li.work")[:20]:
            title_link = work.select_one("h4.heading a")
            if title_link is None or not title_link.get("href"):
                continue

            tags = [tag.get_text(" ", strip=True) for tag in work.select("ul.tags li")]
            results.append(
                ScrapedFanfic(
                    title=title_link.get_text(" ", strip=True),
                    author=(work.select_one('a[rel="author"]') or {}).get_text(" ", strip=True) or "Anonymous",
                    platform="AO3",
                    url=f"{self.BASE_URL}{title_link['href']}",
                    tags=", ".join(tags),
                    summary=(work.select_one("blockquote.summary") or {}).get_text(" ", strip=True),
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )

        return results
