from datetime import datetime
import time
from urllib.parse import quote_plus
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class LofterScraper(BaseScraper):
    """Lofter tag-based search adapter using Playwright with mobile user-agent and auto-scroll."""

    BASE_URL = "https://www.lofter.com"

    def scrape(self, keyword: str, page: int = 1) -> list[ScrapedFanfic]:
        self.last_warning = None
        encoded_tag = quote_plus(keyword)
        tag_url = f"{self.BASE_URL}/tag/{encoded_tag}"

        print(f"[LofterScraper Playwright] Searching tag URL: {tag_url}")
        results: list[ScrapedFanfic] = []

        try:
            with sync_playwright() as p:
                browser = p.chromium.launch(
                    headless=True,
                    args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
                )
                context = browser.new_context(
                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
                    viewport={"width": 390, "height": 844},
                    device_scale_factor=3,
                    is_mobile=True,
                    locale="zh-TW"
                )
                page_obj = context.new_page()

                try:
                    response = page_obj.goto(tag_url, timeout=12000, wait_until="domcontentloaded")
                    status_code = response.status if response else 0

                    if status_code in (403, 404, 429, 525, 503):
                        self.last_warning = f"Lofter HTTP {status_code} on tag page; no verified results were returned."
                        print(f"[LofterScraper Playwright] Notice: Lofter returned HTTP {status_code} for tag '{keyword}'")
                        browser.close()
                        return []

                    try:
                        page_obj.wait_for_selector("article, .m-post, .post, .imgc, li", timeout=10000)
                    except Exception:
                        print(f"[LofterScraper Playwright] Warning: Target post selectors not immediately found for tag '{keyword}'. Attempting scroll...")

                    # 自動向下滾動 (Auto-scroll) 觸發無限滾動動態加載
                    page_obj.evaluate("window.scrollBy(0, 1000)")
                    time.sleep(1.0)

                    html_content = page_obj.content()
                    soup = BeautifulSoup(html_content, "html.parser")

                    post_items = soup.select("article, .m-post, .post, .imgc, li[data-postid]")
                    print(f"[LofterScraper Playwright] Found {len(post_items)} post elements for tag '{keyword}'.")

                    for item in post_items[:25]:
                        try:
                            title_link = item.select_one("a[title], h2 a, h3 a, .title a, a.w-text")
                            if title_link is None or not title_link.get("href"):
                                # 嘗試尋找卡片內的任意文章超連結
                                title_link = item.select_one("a[href*='/post/']")
                            if title_link is None or not title_link.get("href"):
                                continue

                            href = title_link["href"]
                            if href.startswith("/"):
                                href = f"{self.BASE_URL}{href}"

                            raw_title = title_link.get("title") or title_link.get_text(" ", strip=True)
                            title = raw_title[:30] if raw_title else f"Lofter Post - {keyword}"

                            author_elem = item.select_one(".author, .user-name, [data-author], .user a, .name")
                            author = author_elem.get_text(" ", strip=True) if author_elem else "Lofter Creator"

                            summary_elem = item.select_one(".summary, .excerpt, .content, .text, .des")
                            summary = summary_elem.get_text(" ", strip=True) if summary_elem else "No summary available."

                            tag_elems = item.select(".tag, .tags a, .m-tag a, span.tag")
                            tags_list = [t.get_text(" ", strip=True) for t in tag_elems if t.get_text().strip()]
                            if keyword not in tags_list:
                                tags_list.insert(0, keyword)
                            tags = ", ".join(tags_list)

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
                            print(f"[LofterScraper Playwright] Parse item error: {parse_err}")
                            continue

                except Exception as nav_err:
                    self.last_warning = f"[Lofter Adapter] No tag results found or navigation failed: {nav_err}"
                    print(f"[LofterScraper Playwright] No tag results found for '{keyword}': {nav_err}")
                finally:
                    browser.close()

        except Exception as launch_err:
            self.last_warning = f"[Lofter Adapter] Browser launch failed: {launch_err}"
            print(f"[LofterScraper Playwright] Browser launch failed: {launch_err}")

        return results
