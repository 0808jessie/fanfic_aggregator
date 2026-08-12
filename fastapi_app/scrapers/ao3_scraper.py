from datetime import datetime
import re
from urllib.parse import quote_plus

import requests
from bs4 import BeautifulSoup

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class AO3Scraper(BaseScraper):
    """Archive of Our Own (AO3) search adapter with robust headers and error logging."""

    BASE_URL = "https://archiveofourown.org"
    SEARCH_PATHS = ["/works/search", "/works/search?work_search[query]="]

    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        encoded_query = quote_plus(keyword)
        search_urls = [
            f"{self.BASE_URL}/works/search?work_search%5Bquery%5D={encoded_query}",
            f"{self.BASE_URL}/works/search?utf8=%E2%9C%93&work_search%5Bquery%5D={encoded_query}",
        ]
        
        headers_list = [
            {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7,en-GB;q=0.6",
                "Referer": "https://archiveofourown.org/",
                "Connection": "keep-alive",
            },
            {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
                "Referer": "https://archiveofourown.org/works/search",
                "Connection": "keep-alive",
            }
        ]

        response = None
        for search_url in search_urls:
            for headers in headers_list:
                try:
                    print(f"[AO3Scraper] Requesting URL: {search_url}")
                    res = requests.get(search_url, headers=headers, timeout=15)
                    if res.status_code == 200 and "li.work" in res.text or len(res.text) > 5000:
                        response = res
                        break
                    elif res.status_code == 200:
                        response = res
                except Exception as ex:
                    print(f"[AO3Scraper] Attempt failed: {ex}")
            if response and response.status_code == 200:
                break

        if not response or response.status_code != 200:
            status_code = response.status_code if response else "Unknown"
            print(f"[AO3Scraper] ERROR: AO3 returned HTTP Status Code {status_code} for keyword '{keyword}'")
            return []

        soup = BeautifulSoup(response.text, "html.parser")
        results: list[ScrapedFanfic] = []
        
        # 解析 AO3 搜尋結果清單 (li.work)
        work_items = soup.select("li.work")
        print(f"[AO3Scraper] Successfully fetched page. Found {len(work_items)} work elements.")

        for work in work_items[:25]:
            try:
                title_link = work.select_one("h4.heading a")
                if title_link is None or not title_link.get("href"):
                    continue

                title = title_link.get_text(" ", strip=True)
                relative_url = title_link["href"]
                url = f"{self.BASE_URL}{relative_url}" if relative_url.startswith("/") else relative_url

                # 作者解析
                author_elem = work.select_one('a[rel="author"]')
                author = author_elem.get_text(" ", strip=True) if author_elem else "Anonymous"

                # 摘要解析
                summary_elem = work.select_one("blockquote.summary")
                summary = summary_elem.get_text(" ", strip=True) if summary_elem else ""

                # 標籤解析 (Fandoms, Relationships, Characters, Freeform tags)
                tag_elements = work.select("ul.tags li")
                tags_list = [tag.get_text(" ", strip=True) for tag in tag_elements]
                tags = ", ".join([t for t in tags_list if t])

                # 字數解析 (Word count stat)
                word_count = "N/A"
                stats_elem = work.select_one("dl.stats dd.words")
                if stats_elem:
                    word_count = stats_elem.get_text(" ", strip=True)
                else:
                    # 尋找包含 words 的統計字串
                    for dd in work.select("dl.stats dd"):
                        text = dd.get_text(" ", strip=True)
                        if "words" in text.lower() or re.search(r'\d+', text):
                            word_count = text
                            break

                # 若有取得字數，可將其附加在 tags 或 summary 中以符合前端顯示
                if word_count != "N/A" and f"字數: {word_count}" not in tags:
                    tags = f"字數: {word_count}, {tags}" if tags else f"字數: {word_count}"

                results.append(
                    ScrapedFanfic(
                        title=title,
                        author=author,
                        platform="AO3",
                        url=url,
                        tags=tags,
                        summary=summary,
                        scraped_at=datetime.utcnow(),
                        keyword=keyword,
                    )
                )
            except Exception as parse_err:
                print(f"[AO3Scraper] Warning: Failed to parse a work item: {parse_err}")
                continue

        return results
