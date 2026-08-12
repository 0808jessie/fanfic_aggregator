from datetime import datetime
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class LofterScraper(BaseScraper):
    """Best-effort Lofter search adapter.

    Lofter may require dynamic rendering or authentication. The adapter therefore
    treats unavailable HTML as an empty result and never fabricates records.
    """

    SEARCH_URL = "https://www.lofter.com/search"

    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        try:
            response = requests.get(
                self.SEARCH_URL,
                params={"q": keyword, "query": keyword},
                headers={"User-Agent": "FanficAtlas/0.1 (+local research tool)"},
                timeout=12,
            )
            response.raise_for_status()
        except requests.RequestException as error:
            print(f"[Lofter] request failed: {error}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results: list[ScrapedFanfic] = []
        for item in soup.select("article, .m-post, .post, [data-post-id]")[:20]:
            title_link = item.select_one("a[title], h2 a, h3 a, .title a")
            if title_link is None or not title_link.get("href"):
                continue

            href = title_link["href"]
            if href.startswith("/"):
                href = f"https://www.lofter.com{href}"
            results.append(
                ScrapedFanfic(
                    title=title_link.get("title") or title_link.get_text(" ", strip=True),
                    author=(item.select_one(".author, .user-name, [data-author]") or {}).get_text(" ", strip=True) or "Unknown author",
                    platform="Lofter",
                    url=href,
                    tags=", ".join(tag.get_text(" ", strip=True) for tag in item.select(".tag, .tags a")),
                    summary=(item.select_one(".summary, .excerpt, .content") or {}).get_text(" ", strip=True),
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )

        return results
