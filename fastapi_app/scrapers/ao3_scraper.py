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
    SEARCH_PATH = "/works/search"

    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        search_url = f"{self.BASE_URL}{self.SEARCH_PATH}?work_search%5Bquery%5D={quote_plus(keyword)}"
        
        # 模擬真實現代瀏覽器標頭，防止被 AO3 防火牆阻擋 (403 / 429)
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-TW;q=0.8,zh;q=0.7",
            "Cache-Control": "max-age=0",
            "Referer": "https://archiveofourown.org/",
            "Connection": "keep-alive",
        }

        try:
            print(f"[AO3Scraper] Requesting URL: {search_url}")
            response = requests.get(search_url, headers=headers, timeout=15)
            
            # 若發生 HTTP 錯誤（如 403, 429, 500 等），記錄具體 Status Code
            if response.status_code != 200:
                print(f"[AO3Scraper] ERROR: AO3 returned HTTP Status Code {response.status_code} for keyword '{keyword}'")
                return []
                
            response.raise_for_status()
        except requests.exceptions.HTTPError as http_err:
            status_code = http_err.response.status_code if http_err.response else "Unknown"
            print(f"[AO3Scraper] HTTP error occurred: Status Code {status_code} - {http_err}")
            return []
        except requests.exceptions.Timeout:
            print(f"[AO3Scraper] ERROR: Request timed out while connecting to AO3 for keyword '{keyword}'")
            return []
        except requests.RequestException as error:
            print(f"[AO3Scraper] ERROR: Network or request failed for keyword '{keyword}': {error}")
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
