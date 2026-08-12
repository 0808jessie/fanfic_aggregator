from datetime import datetime
import random
import time
import urllib.parse
from typing import Any
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from constants.cp_tags import CP_TAG_MAP
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper

CP_TAG_MAPPING = CP_TAG_MAP


def matches_expected_relationship(relationship_tags: list[str], expected_mapping: str) -> bool:
    if not relationship_tags or not expected_mapping:
        return False
    normalized_mapping = expected_mapping.casefold().replace("／", "/")
    expected_parts = [part.strip() for part in normalized_mapping.split("/") if part.strip()]
    for relationship in relationship_tags:
        normalized_relationship = relationship.casefold().replace("／", "/")
        if normalized_relationship == normalized_mapping:
            return True
        if all(part in normalized_relationship for part in expected_parts):
            return True
    return False


def extract_ao3_tag_metadata(work) -> tuple[list[str], list[str], list[str]]:
    tag_elements = work.select("ul.tags.commas li")
    relationships: list[str] = []
    characters: list[str] = []
    other_tags: list[str] = []

    for li in tag_elements:
        text = li.get_text(strip=True)
        classes = li.get("class", [])
        if "relationships" in classes:
            relationships.append(text)
        elif "characters" in classes:
            characters.append(text)
        else:
            other_tags.append(text)

    return relationships, characters, other_tags


class AO3Scraper(BaseScraper):
    def __init__(self):
        super().__init__()

    def scrape(self, keyword: str, page: int = 1) -> dict[str, Any]:
        """
        Scrape AO3 works using Playwright.
        Supports:
          1. CP Relationship mapping using work_search[relationship_names].
          2. Automatic fallback to work_search[query] if relationship search returns 0 results or fails.
          3. Multi-page pagination (pages=[1, 2] on page=1).
        """
        target_pages = [page] if page > 1 else [1, 2]
        print(f"[AO3Scraper Playwright] Starting scrape for keyword '{keyword}', pages: {target_pages}")

        mapped_cp = CP_TAG_MAPPING.get(keyword.strip())
        used_relationship_mode = bool(mapped_cp)

        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/123.0.0.0 Safari/537.36"
                ),
                locale="zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                viewport={"width": 1280, "height": 800},
            )
            page_obj = context.new_page()

            all_items: list[ScrapedFanfic] = []
            total_works = 0
            total_pages = 1
            last_error_warning = None

            try:
                for idx, target_page in enumerate(target_pages):
                    if idx > 0:
                        sleep_secs = 0.8 + random.random() * 0.4
                        print(f"[AO3Scraper Playwright] Waiting {sleep_secs:.2f}s before fetching page {target_page}...")
                        time.sleep(sleep_secs)

                    search_url = ""
                    if used_relationship_mode and mapped_cp:
                        encoded_rel = urllib.parse.quote(mapped_cp, safe="")
                        search_url = f"https://archiveofourown.org/works/search?work_search%5Brelationship_names%5D={encoded_rel}&page={target_page}"
                        print(f"[AO3Scraper Playwright] Navigating with mapped relationship: {search_url}")
                    else:
                        encoded_kw = urllib.parse.quote(keyword)
                        search_url = f"https://archiveofourown.org/works/search?work_search%5Bquery%5D={encoded_kw}&page={target_page}"
                        print(f"[AO3Scraper Playwright] Navigating with query: {search_url}")

                    try:
                        response = page_obj.goto(search_url, timeout=15000, wait_domcontent_loaded=True)
                        status_code = response.status if response else 200
                        if status_code in (403, 429, 525):
                            err_msg = f"AO3 HTTP {status_code} on page {target_page}; results may be partial."
                            print(f"[AO3Scraper Playwright] ERROR: {err_msg}")
                            last_error_warning = err_msg
                            if status_code in (403, 429) and target_page == 1:
                                break
                    except Exception as nav_err:
                        err_msg = f"Navigation error on page {target_page}: {nav_err}"
                        print(f"[AO3Scraper Playwright] {err_msg}")
                        last_error_warning = err_msg
                        if target_page == 1:
                            break
                        continue

                    try:
                        page_obj.wait_for_selector("li.work.blurb", timeout=12000)
                    except Exception:
                        print(f"[AO3Scraper Playwright] Timeout waiting for works on page {target_page}.")

                    html_content = page_obj.content()
                    soup = BeautifulSoup(html_content, "html.parser")

                    if target_page == 1:
                        heading = soup.select_one("h3.heading")
                        if heading:
                            heading_text = heading.get_text()
                            if "of" in heading_text:
                                try:
                                    parts = heading_text.split("of")
                                    num_str = "".join(filter(str.isdigit, parts[1]))
                                    total_works = int(num_str)
                                    total_pages = max(1, (total_works + 19) // 20)
                                except Exception:
                                    pass

                    works = soup.select("li.work.blurb")
                    print(f"[AO3Scraper Playwright] Page {target_page}: found {len(works)} work items.")

                    page_items = []
                    for work in works:
                        try:
                            title_el = work.select_one("h4.heading a:not([rel='author'])")
                            if not title_el:
                                continue
                            title = title_el.get_text(strip=True)
                            href = title_el.get("href", "")
                            url = f"https://archiveofourown.org{href}" if href.startswith("/") else href

                            author_els = work.select("h4.heading a[rel='author']")
                            author = ", ".join([a.get_text(strip=True) for a in author_els]) or "Anonymous"

                            summary_el = work.select_one("blockquote.userstuff")
                            summary = summary_el.get_text(strip=True) if summary_el else ""

                            relationships, characters, other_tags = extract_ao3_tag_metadata(work)

                            if used_relationship_mode and mapped_cp:
                                if not matches_expected_relationship(relationships, mapped_cp):
                                    continue

                            tags_list = relationships + characters + other_tags
                            tags_str = ", ".join(tags_list)

                            words_el = work.select_one("dd.words")
                            word_count = words_el.get_text(strip=True) if words_el else None

                            item = ScrapedFanfic(
                                id=f"ao3:{url}",
                                title=title,
                                author=author,
                                platform="AO3",
                                url=url,
                                tags=tags_str,
                                relationships=relationships,
                                characters=characters,
                                summary=summary,
                                wordCount=word_count,
                                scraped_at=datetime.utcnow(),
                                keyword=keyword,
                            )
                            page_items.append(item)
                        except Exception as parse_err:
                            print(f"[AO3Scraper Playwright] Error parsing work item: {parse_err}")

                    all_items.extend(page_items)

                browser.close()

            except Exception as e:
                print(f"[AO3Scraper Playwright] Fatal execution error: {e}")
                last_error_warning = f"AO3 scrape failed: {e}"
                try:
                    browser.close()
                except Exception:
                    pass

        # 第二階段：自動降級 (Fallback Search)
        if used_relationship_mode and not all_items:
            print(f"[AO3Scraper Playwright] Mapped relationship '{mapped_cp}' returned 0 results. Triggering automatic fallback to query search for '{keyword}'...")
            fallback_payload = self._fallback_query_search(keyword, target_pages)
            if fallback_payload.get("items"):
                return fallback_payload

        if not all_items and last_error_warning:
            self.last_warning = last_error_warning
        else:
            self.last_warning = None

        if total_works == 0:
            total_works = len(all_items)
            total_pages = max(1, (total_works + 19) // 20)

        return {
            "items": all_items,
            "total_works": total_works,
            "total_pages": total_pages,
        }

    def _fallback_query_search(self, keyword: str, target_pages: list[int]) -> dict[str, Any]:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/123.0.0.0 Safari/537.36"
                ),
                locale="zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
                viewport={"width": 1280, "height": 800},
            )
            page_obj = context.new_page()

            fallback_items: list[ScrapedFanfic] = []
            total_works = 0
            total_pages = 1

            try:
                for idx, target_page in enumerate(target_pages):
                    if idx > 0:
                        time.sleep(0.8)
                    encoded_kw = urllib.parse.quote(keyword)
                    search_url = f"https://archiveofourown.org/works/search?work_search%5Bquery%5D={encoded_kw}&page={target_page}"
                    print(f"[AO3Scraper Fallback] Navigating with query fallback: {search_url}")

                    try:
                        page_obj.goto(search_url, timeout=15000, wait_domcontent_loaded=True)
                    except Exception:
                        continue

                    try:
                        page_obj.wait_for_selector("li.work.blurb", timeout=10000)
                    except Exception:
                        pass

                    soup = BeautifulSoup(page_obj.content(), "html.parser")
                    if target_page == 1:
                        heading = soup.select_one("h3.heading")
                        if heading and "of" in heading.get_text():
                            try:
                                parts = heading.get_text().split("of")
                                num_str = "".join(filter(str.isdigit, parts[1]))
                                total_works = int(num_str)
                                total_pages = max(1, (total_works + 19) // 20)
                            except Exception:
                                pass

                    works = soup.select("li.work.blurb")
                    for work in works:
                        try:
                            title_el = work.select_one("h4.heading a:not([rel='author'])")
                            if not title_el:
                                continue
                            title = title_el.get_text(strip=True)
                            href = title_el.get("href", "")
                            url = f"https://archiveofourown.org{href}" if href.startswith("/") else href

                            author_els = work.select("h4.heading a[rel='author']")
                            author = ", ".join([a.get_text(strip=True) for a in author_els]) or "Anonymous"

                            summary_el = work.select_one("blockquote.userstuff")
                            summary = summary_el.get_text(strip=True) if summary_el else ""

                            relationships, characters, other_tags = extract_ao3_tag_metadata(work)
                            tags_str = ", ".join(relationships + characters + other_tags)

                            words_el = work.select_one("dd.words")
                            word_count = words_el.get_text(strip=True) if words_el else None

                            item = ScrapedFanfic(
                                id=f"ao3:{url}",
                                title=title,
                                author=author,
                                platform="AO3",
                                url=url,
                                tags=tags_str,
                                relationships=relationships,
                                characters=characters,
                                summary=summary,
                                wordCount=word_count,
                                scraped_at=datetime.utcnow(),
                                keyword=keyword,
                            )
                            fallback_items.append(item)
                        except Exception:
                            pass

                browser.close()
            except Exception:
                try:
                    browser.close()
                except Exception:
                    pass

        if total_works == 0:
            total_works = len(fallback_items)
            total_pages = max(1, (total_works + 19) // 20)

        return {
            "items": fallback_items,
            "total_works": total_works,
            "total_pages": total_pages,
        }
