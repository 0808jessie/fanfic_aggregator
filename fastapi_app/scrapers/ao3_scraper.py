from datetime import datetime
import random
import re
import time
from urllib.parse import quote_plus
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class AO3Scraper(BaseScraper):
    """Archive of Our Own (AO3) search adapter supporting multi-page crawling and pagination metadata."""

    BASE_URL = "https://archiveofourown.org"

    def scrape(self, keyword: str, page: int = 1) -> dict:
        """
        Scrapes AO3 search results. If page=1, automatically crawls page 1 and page 2
        (total ~40 items) with random delays, and extracts total work statistics.
        Returns a dictionary containing items, total_works, and total_pages.
        """
        self.last_warning = None
        encoded_query = quote_plus(keyword)
        pages_to_fetch = [page]
        if page == 1:
            pages_to_fetch = [1, 2]  # 預設自動連抓第 1 頁與第 2 頁

        all_results: list[ScrapedFanfic] = []
        total_works = 0
        total_pages = 1

        print(f"[AO3Scraper Playwright] Starting scrape for keyword '{keyword}', pages: {pages_to_fetch}")

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                )
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 800},
                    locale="zh-TW"
                )
                page_obj = context.new_page()

                try:
                    for idx, target_page in enumerate(pages_to_fetch):
                        search_url = f"{self.BASE_URL}/works/search?work_search%5Bquery%5D={encoded_query}&page={target_page}"
                        print(f"[AO3Scraper Playwright] Navigating to: {search_url}")

                        if idx > 0:
                            delay = random.uniform(0.8, 1.5)
                            print(f"[AO3Scraper Playwright] Waiting {delay:.2f}s before fetching page {target_page}...")
                            time.sleep(delay)

                        response = page_obj.goto(search_url, timeout=15000, wait_until="domcontentloaded")
                        status_code = response.status if response else 0

                        if status_code in (403, 429, 525, 503):
                            self.last_warning = f"AO3 HTTP {status_code} on page {target_page}; results may be partial."
                            print(f"[AO3Scraper Playwright] ERROR: HTTP {status_code} on page {target_page}")
                            if idx == 0:
                                browser.close()
                                return {"items": [], "total_works": 0, "total_pages": 0}
                            break

                        try:
                            page_obj.wait_for_selector("li.work", timeout=12000)
                        except Exception:
                            self.last_warning = f"AO3 page {target_page} did not expose work cards; the platform may be rate-limiting or showing a challenge."
                            print(f"[AO3Scraper Playwright] Warning: 'li.work' not found on page {target_page}")

                        html_content = page_obj.content()
                        soup = BeautifulSoup(html_content, "html.parser")

                        # 解析總筆數與總頁數 (例如: "1-20 of 3500 Works" 或類似標頭)
                        if target_page == 1 or total_works == 0:
                            heading_text = ""
                            h3_elem = soup.select_one("h3.heading")
                            if h3_elem:
                                heading_text = h3_elem.get_text(" ", strip=True)
                            else:
                                found_h3 = soup.find(lambda tag: tag.name == "h3" and "works" in tag.get_text().lower())
                                if found_h3:
                                    heading_text = found_h3.get_text(" ", strip=True)

                            match = re.search(r'of\s+([0-9,]+)\s+works', heading_text, re.IGNORECASE)
                            if match:
                                total_works_str = match.group(1).replace(",", "")
                                total_works = int(total_works_str)
                                total_pages = max(1, (total_works + 19) // 20)
                            else:
                                # 從 pagination 尋找最大頁碼
                                pagination_links = soup.select("ol.pagination a")
                                max_p = 1
                                for link in pagination_links:
                                    text = link.get_text(strip=True)
                                    if text.isdigit():
                                        max_p = max(max_p, int(text))
                                total_pages = max(max_p, 1)
                                total_works = total_pages * 20

                        work_items = soup.select("li.work")
                        print(f"[AO3Scraper Playwright] Page {target_page}: found {len(work_items)} work items.")

                        for work in work_items:
                            try:
                                title_link = work.select_one("h4.heading a")
                                if title_link is None or not title_link.get("href"):
                                    continue

                                title = title_link.get_text(" ", strip=True)
                                relative_url = title_link["href"]
                                url = f"{self.BASE_URL}{relative_url}" if relative_url.startswith("/") else relative_url

                                author_elem = work.select_one('a[rel="author"]')
                                author = author_elem.get_text(" ", strip=True) if author_elem else "Anonymous"

                                summary_elem = work.select_one("blockquote.summary")
                                summary = summary_elem.get_text(" ", strip=True) if summary_elem else ""

                                tag_elements = work.select("ul.tags li")
                                tags_list = [tag.get_text(" ", strip=True) for tag in tag_elements]
                                tags = ", ".join([t for t in tags_list if t])

                                word_count = "N/A"
                                for dd in work.select("dl.stats dd"):
                                    text = dd.get_text(" ", strip=True)
                                    if "words" in text.lower() or re.search(r'\d+', text):
                                        word_count = text
                                        break

                                if word_count != "N/A" and f"字數: {word_count}" not in tags:
                                    tags = f"字數: {word_count}, {tags}" if tags else f"字數: {word_count}"

                                all_results.append(
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
                            except Exception as item_err:
                                print(f"[AO3Scraper Playwright] Parse item error: {item_err}")
                                continue

                except Exception as nav_err:
                    self.last_warning = f"AO3 navigation failed: {nav_err}"
                    print(f"[AO3Scraper Playwright] Navigation error: {nav_err}")
                finally:
                    browser.close()

        except Exception as launch_err:
            self.last_warning = f"AO3 browser launch failed: {launch_err}"
            print(f"[AO3Scraper Playwright] Launch error: {launch_err}")

        if total_works == 0 and all_results:
            total_works = len(all_results)
            total_pages = max(1, (total_works + 19) // 20)

        return {
            "items": all_results,
            "total_works": total_works,
            "total_pages": total_pages,
        }
