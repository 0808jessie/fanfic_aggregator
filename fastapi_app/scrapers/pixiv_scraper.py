import re
from datetime import datetime, timezone
import re
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
    ajax_search_url = "https://www.pixiv.net/ajax/search/novels"

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
            ajax_payload = self._fetch_ajax_search(cleaned_keyword, page)
            if ajax_payload is not None:
                items, total_works = self.parse_ajax_results(ajax_payload, cleaned_keyword, language=language)
                if items or total_works:
                    return {"items": items, "total_works": total_works or len(items), "total_pages": 1}

            url = f"{self.search_url}/{quote(cleaned_keyword)}/novels"
            response = curl_requests.get(
                url,
                headers=self.search_headers,
                impersonate="chrome124",
                timeout=30.0,
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

    def _fetch_ajax_search(self, keyword: str, page: int) -> dict[str, Any] | None:
        """Retrieve Pixiv's first-party public novel-search JSON before HTML fallback.

        The HTML document can contain only sign-in prompts in cloud environments,
        while this page's own JSON route provides the public card metadata used by
        the website. It is requested with the same Chrome TLS impersonation and
        never bypasses authentication or an access-control boundary.
        """
        try:
            response = curl_requests.get(
                f"{self.ajax_search_url}/{quote(keyword)}",
                params={
                    "word": keyword,
                    "order": "date_d",
                    "mode": "all",
                    "p": max(1, page),
                    "s_mode": "s_tag",
                    "type": "all",
                    "lang": "ja",
                },
                headers={
                    **self.search_headers,
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                },
                impersonate="chrome124",
                timeout=30.0,
            )
            if response.status_code in (403, 429, 502, 503, 525):
                self.last_warning = f"[Pixiv] Public search protected or unavailable (HTTP {response.status_code})"
                return None
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict) or payload.get("error"):
                self.last_warning = "[Pixiv] Public JSON search returned an unavailable payload"
                return None
            return payload
        except Exception as error:
            print(f"[Pixiv] Ajax search unavailable; using HTML fallback: {error}")
            return None

    @staticmethod
    def _tag_names(raw_tags: Any) -> list[str]:
        """Normalize Pixiv's tag payload without changing the list contract."""
        if not isinstance(raw_tags, list):
            return []
        names: list[str] = []
        for tag in raw_tags:
            if isinstance(tag, str) and tag.strip():
                names.append(tag.strip())
            elif isinstance(tag, dict):
                name = tag.get("tag") or tag.get("name")
                if isinstance(name, str) and name.strip():
                    names.append(name.strip())
        return list(dict.fromkeys(names))

    def parse_ajax_results(
        self,
        payload: dict[str, Any],
        keyword: str,
        language: Optional[str] = None,
    ) -> tuple[list[ScrapedFanfic], int]:
        """Map official Pixiv search JSON to the cross-platform result contract."""
        novel_payload = payload.get("body", {}).get("novel", {})
        records = novel_payload.get("data", []) if isinstance(novel_payload, dict) else []
        total_raw = novel_payload.get("total", 0) if isinstance(novel_payload, dict) else 0
        try:
            total_works = int(total_raw or 0)
        except (TypeError, ValueError):
            total_works = 0

        results: list[ScrapedFanfic] = []
        for record in records if isinstance(records, list) else []:
            if not isinstance(record, dict):
                continue
            novel_id = str(record.get("id") or "").strip()
            title = str(record.get("title") or "").strip()
            if not novel_id or not title:
                continue
            record_language = str(record.get("language") or "unknown")
            restrict_flag = str(record.get("xRestrict") or record.get("restrict") or "").strip().lower()
            rating = "R-18" if restrict_flag in {"1", "2", "r18", "r-18", "r18g"} else None

            results.append(ScrapedFanfic(
                id=f"pixiv:https://www.pixiv.net/novel/show.php?id={novel_id}",
                title=title[:240],
                author=str(record.get("userName") or "Pixiv 創作者")[:160],
                url=f"https://www.pixiv.net/novel/show.php?id={novel_id}",
                summary=str(record.get("description") or "")[:800],
                platform="pixiv",
                source="pixiv",
                tags=self._tag_names(record.get("tags")),
                coverUrl=str(record.get("url") or "") or None,
                wordCount=str(record.get("wordCount") or record.get("textCount") or "") or None,
                updated_at=str(record.get("updateDate") or record.get("createDate") or datetime.now(timezone.utc).isoformat()),
                language=record_language,
                rating=rating,
                scraped_at=datetime.now(timezone.utc),
                keyword=keyword,
            ))
        return results, total_works

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

            # Pixiv can expose a bare title ``<a>`` with author, tags, and
            # summary as sibling nodes. In that shape, parse metadata from the
            # parent card instead of from the title anchor alone.
            metadata_scope = card if card.name != "a" else card.parent
            author_node = metadata_scope.select_one(".user-name, [data-user-name]") if metadata_scope else None
            if author_node is None:
                author_node = next(
                    (
                        node
                        for node in (metadata_scope.select("a[href]") if metadata_scope else [])
                        if "/users/" in node.get("href", "")
                    ),
                    None,
                )
            author = author_node.get_text(" ", strip=True) if author_node else "Pixiv 創作者"
            summary_node = metadata_scope.select_one(".caption, .summary, p") if metadata_scope else None
            summary = summary_node.get_text(" ", strip=True) if summary_node else ""
            tag_nodes = metadata_scope.select(".tag, [data-tag], a[href*='/tags/']") if metadata_scope else []
            tags = list(dict.fromkeys(
                node.get_text(" ", strip=True)[:80]
                for node in tag_nodes
                if node.get_text(" ", strip=True)
            ))
            updated_node = metadata_scope.select_one("time[datetime], time, [data-date]") if metadata_scope else None
            updated_at = datetime.now(timezone.utc).isoformat()
            if updated_node:
                updated_at = (
                    updated_node.get("datetime")
                    or updated_node.get("data-date")
                    or updated_node.get_text(" ", strip=True)
                    or updated_at
                )

            lang_detected = "ja" if any(ord(char) > 127 for char in title + summary) else "en"
            seen_urls.add(url)
            results.append(
                ScrapedFanfic(
                    id=f"pixiv:{url}",
                    title=title[:240],
                    author=author[:160],
                    platform="pixiv",
                    url=url,
                    summary=summary[:800],
                    tags=tags,
                    source="pixiv",
                    updated_at=updated_at,
                    language=lang_detected,
                    scraped_at=datetime.now(timezone.utc),
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
