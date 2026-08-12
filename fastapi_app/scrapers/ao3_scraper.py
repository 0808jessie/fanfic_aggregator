from datetime import datetime
import re
from urllib.parse import quote_plus
from playwright.sync_api import sync_playwright

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class AO3Scraper(BaseScraper):
    """Archive of Our Own (AO3) search adapter using Playwright headless browser automation."""

    BASE_URL = "https://archiveofourown.org"

    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        encoded_query = quote_plus(keyword)
        search_url = f"{self.BASE_URL}/works/search?work_search%5Bquery%5D={encoded_query}"
        
        print(f"[AO3Scraper Playwright] Launching headless browser for URL: {search_url}")
        results: list[ScrapedFanfic] = []

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
                page = context.new_page()

                try:
                    # 前往 AO3 搜尋頁面並等待 DOM 渲染完成（timeout 設定 15 秒）
                    response = page.goto(search_url, timeout=15000, wait_until="domcontentloaded")
                    status_code = response.status if response else 0
                    print(f"[AO3Scraper Playwright] Response status code: {status_code}")

                    if status_code in (403, 429, 525, 503):
                        print(f"[AO3Scraper Playwright] ERROR: Triggered rate limit or Cloudflare challenge with status {status_code}")
                        browser.close()
                        return []

                    # 等待作品清單出現（li.work）
                    try:
                        page.wait_for_selector("li.work", timeout=15000)
                    except Exception as wait_err:
                        print(f"[AO3Scraper Playwright] Warning: 'li.work' selector not found within 15s timeout: {wait_err}")

                    # 提取網頁 HTML 內容交由 BeautifulSoup 解析
                    html_content = page.content()
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(html_content, "html.parser")
                    work_items = soup.select("li.work")
                    print(f"[AO3Scraper Playwright] Found {len(work_items)} work items in DOM.")

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

                            # 標籤解析
                            tag_elements = work.select("ul.tags li")
                            tags_list = [tag.get_text(" ", strip=True) for tag in tag_elements]
                            tags = ", ".join([t for t in tags_list if t])

                            # 字數解析
                            word_count = "N/A"
                            for dd in work.select("dl.stats dd"):
                                text = dd.get_text(" ", strip=True)
                                if "words" in text.lower() or re.search(r'\d+', text):
                                    word_count = text
                                    break

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
                            print(f"[AO3Scraper Playwright] Parse item warning: {parse_err}")
                            continue

                except Exception as page_err:
                    print(f"[AO3Scraper Playwright] Page navigation or loading error: {page_err}")
                finally:
                    browser.close()

        except Exception as browser_err:
            print(f"[AO3Scraper Playwright] Browser launch or execution error: {browser_err}")

        return results
