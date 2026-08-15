import re
from datetime import datetime
from typing import Any, Optional
from urllib.parse import quote
from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class PixivScraper(BaseScraper):
    """Isolated Pixiv novel public search scraper using curl_cffi chrome124 impersonation."""

    platform_name = "Pixiv"
    search_url = "https://www.pixiv.net/tags"

    def __init__(self) -> None:
        super().__init__()
        self.search_headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8,zh-TW;q=0.7",
            "Referer": "https://www.pixiv.net/",
            "Sec-CH-UA": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
            "Sec-CH-UA-Mobile": "?0",
            "Sec-CH-UA-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        }

    def scrape(
        self,
        keyword: str,
        page: int = 1,
        force_refresh: bool = False,
        custom_cp_map: Any = None,
        mode: str = "keyword",
        language: Optional[str] = None,
    ) -> dict[str, object]:
        self.last_warning = None
        cleaned_keyword = keyword.strip()
        if not cleaned_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            url = f"{self.search_url}/{quote(cleaned_keyword)}/novels"
            response = curl_requests.get(
                url,
                headers=self.search_headers,
                impersonate="chrome124",
                timeout=15.0,
            )
            if response.status_code in (403, 429, 502, 503, 525):
                self.last_warning = f"[Pixiv] Public search protected or unavailable (HTTP {response.status_code})"
                return {"items": [], "total_works": 0, "total_pages": 1}
            response.raise_for_status()
            html = response.text
            items = self.parse_results(html, cleaned_keyword, language=language)
            total_works = self.extract_total_works(html) or len(items)
            return {"items": items, "total_works": total_works, "total_pages": 1}
        except Exception as error:
            self.last_warning = f"[Pixiv] Public search unavailable safely: {error}"
            print(f"[Pixiv] {self.last_warning}")
            return {"items": [], "total_works": 0, "total_pages": 1}

    def parse_results(self, html: str, keyword: str, language: Optional[str] = None) -> list[ScrapedFanfic]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for card in soup.select('a[href*="/novel/show.php"], div[data-type="novel"]'):
            anchor = card if card.name == "a" else card.select_one('a[href*="/novel/show.php"]')
            if not anchor:
                continue
            href = anchor.get("href", "")
            if not href or "/novel/show.php" not in href:
                continue
            url = href if href.startswith("http") else f"https://www.pixiv.net{href}"
            if url in seen_urls:
                continue

            title = anchor.get_text(" ", strip=True) or card.get_text(" ", strip=True)
            if not title or len(title) < 2:
                continue

            author_node = card.select_one(".user-name, [data-user-name], a[href*='/users/']")
            author = author_node.get_text(" ", strip=True) if author_node else "Pixiv 創作者"
            summary_node = card.select_one(".caption, .summary, p")
            summary = summary_node.get_text(" ", strip=True) if summary_node else ""

            lang_detected = "ja" if any(ord(char) > 127 for char in title + summary) else "en"
            if language and language != "all":
                if language == "zh" and not re.search(r"[\u4e00-\u9fa5]", title + summary):
                    continue
                if language == "ja" and not re.search(r"[\u3040-\u30ff\u4e00-\u9fa5]", title + summary):
                    continue
                if language == "en" and re.search(r"[\u3040-\u30ff\u4e00-\u9fa5]", title + summary):
                    continue

            seen_urls.add(url)
            results.append(
                ScrapedFanfic(
                    id=f"pixiv:{url}",
                    title=title[:240],
                    author=author[:160],
                    platform="Pixiv",
                    url=url,
                    summary=summary[:800],
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
        return results

    @staticmethod
    def extract_total_works(html: str) -> int | None:
        soup = BeautifulSoup(html, "html.parser")
        text = soup.get_text(" ", strip=True)
        match = re.search(r"([\d,]+)\s*(?:件|works|novels|小説)", text, re.IGNORECASE)
        if match:
            return int(match.group(1).replace(",", ""))
        return None
