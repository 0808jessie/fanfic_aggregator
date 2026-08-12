from datetime import datetime
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class LofterScraper(BaseScraper):
    """Lofter search adapter with browser headers and status code logging."""

    SEARCH_URL = "https://www.lofter.com/search"

    def scrape(self, keyword: str, page: int = 1) -> list[ScrapedFanfic]:
        self.last_warning = None
        # Lofter 搜尋 Headers
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Referer": "https://www.lofter.com/",
            "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        }

        try:
            print(f"[LofterScraper] Searching keyword: {keyword}, page={page}")
            response = requests.get(
                self.SEARCH_URL,
                params={"q": keyword, "query": keyword, "page": page},
                headers=headers,
                timeout=12,
            )
            
            if response.status_code != 200:
                self.last_warning = f"Lofter HTTP {response.status_code}; no verified results were returned."
                print(f"[LofterScraper] ERROR: Lofter returned HTTP Status Code {response.status_code} for keyword '{keyword}'")
                return []
                
            response.raise_for_status()
        except requests.RequestException as error:
            status_code = error.response.status_code if error.response else "Network Error"
            self.last_warning = f"Lofter request failed with {status_code}; no verified results were returned."
            print(f"[LofterScraper] Request failed for keyword '{keyword}': Status Code {status_code} - {error}")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results: list[ScrapedFanfic] = []
        
        # 解析 Lofter 搜尋結果文章清單
        post_items = soup.select("article, .m-post, .post, [data-post-id]")
        print(f"[LofterScraper] Found {len(post_items)} post elements.")

        for item in post_items[:20]:
            try:
                title_link = item.select_one("a[title], h2 a, h3 a, .title a")
                if title_link is None or not title_link.get("href"):
                    continue

                href = title_link["href"]
                if href.startswith("/"):
                    href = f"https://www.lofter.com{href}"

                title = title_link.get("title") or title_link.get_text(" ", strip=True)
                
                # 作者解析
                author_elem = item.select_one(".author, .user-name, [data-author], .user a")
                author = author_elem.get_text(" ", strip=True) if author_elem else "Unknown author"

                # 摘要解析
                summary_elem = item.select_one(".summary, .excerpt, .content, .text")
                summary = summary_elem.get_text(" ", strip=True) if summary_elem else ""

                # 標籤解析
                tag_elems = item.select(".tag, .tags a, .m-tag a")
                tags = ", ".join([t.get_text(" ", strip=True) for t in tag_elems if t.get_text().strip()])

                results.append(
                    ScrapedFanfic(
                        title=title,
                        author=author,
                        platform="Lofter",
                        url=href,
                        tags=tags,
                        summary=summary,
                        scraped_at=datetime.utcnow(),
                        keyword=keyword,
                    )
                )
            except Exception as parse_err:
                print(f"[LofterScraper] Warning: Failed to parse Lofter post: {parse_err}")
                continue

        return results
