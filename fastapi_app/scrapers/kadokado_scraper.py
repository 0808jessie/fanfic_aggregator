"""Public, metadata-only KadoKado search adapter.

The adapter reads only the anonymous server-rendered search document exposed at
``/search?keyword=...``. It never logs in, opens a browser, accesses chapter
content, or attempts to work around a failed public request.
"""

from __future__ import annotations

import re
from datetime import datetime
from time import perf_counter
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from curl_cffi import requests as curl_requests

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicSearchUnavailable(RuntimeError):
    """Raised when the official public search document cannot be used safely."""


class KadoKadoScraper(BaseScraper):
    """Normalize public KadoKado work cards into the shared metadata model."""

    base_url = "https://www.kadokado.com.tw"
    search_url = f"{base_url}/search"
    public_search_timeout_seconds = 12.0
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/",
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"
        ),
    }

    def _log_public_outcome(self, outcome: str, error: Exception) -> None:
        """Record public failure classes without logging search input or cookies."""
        print(
            f"[KadoKado PublicSearch] stage=outcome endpoint={self.search_url} "
            f"outcome={outcome} error_type={type(error).__name__}"
        )

    def scrape(
        self,
        keyword: str,
        page: int = 1,
        force_refresh: bool = False,
        custom_cp_map: object | None = None,
        mode: str = "keyword",
    ) -> dict[str, object]:
        self.last_warning = None
        normalized_keyword = keyword.strip()
        if not normalized_keyword:
            return {"items": [], "total_works": 0, "total_pages": 1}

        try:
            html = self._fetch_public_search_html(normalized_keyword)
            items = self.parse_results(html, normalized_keyword)
            if not items:
                self.last_warning = f"[KadoKado 角角者] No verified public result matched '{normalized_keyword}'"
            return {"items": items, "total_works": len(items), "total_pages": 1}
        except _PublicSearchUnavailable as error:
            self._log_public_outcome("unavailable", error)
            self.last_warning = f"[KadoKado 角角者] {error}"
        except Exception as error:
            self._log_public_outcome("parse-error", error)
            self.last_warning = f"[KadoKado 角角者] Public search parse failed safely: {error}"
        return {"items": [], "total_works": 0, "total_pages": 1}

    def _fetch_public_search_html(self, keyword: str) -> str:
        started_at = perf_counter()
        try:
            response = curl_requests.get(
                self.search_url,
                params={"keyword": keyword},
                headers=self.headers,
                impersonate="chrome120",
                timeout=self.public_search_timeout_seconds,
            )
        except Exception as error:
            elapsed_ms = round((perf_counter() - started_at) * 1000)
            print(
                f"[KadoKado PublicSearch] stage=search endpoint={self.search_url} "
                f"status=request-error elapsed_ms={elapsed_ms}"
            )
            raise _PublicSearchUnavailable(f"Public HTTP request unavailable: {error}") from error

        status_code = int(getattr(response, "status_code", 0))
        elapsed_ms = round((perf_counter() - started_at) * 1000)
        print(
            f"[KadoKado PublicSearch] stage=search endpoint={self.search_url} "
            f"status={status_code} elapsed_ms={elapsed_ms}"
        )
        if status_code in (401, 403, 429, 503, 520, 521, 522, 525):
            raise _PublicSearchUnavailable(f"Public search blocked (HTTP {status_code}), skipping cleanly")
        response.raise_for_status()
        html = response.text
        lowered = html.casefold()
        if any(marker in lowered for marker in ("cloudflare", "just a moment", "cdn-cgi", "captcha", "安全驗證")):
            raise _PublicSearchUnavailable("Public search returned a verification page, skipping cleanly")
        if not BeautifulSoup(html, "html.parser").select('a[href^="/book/"]'):
            if "還沒找到相關的作品" in html:
                return html
            raise _PublicSearchUnavailable("Public search result markup was unavailable")
        return html

    @classmethod
    def _is_verified_book_url(cls, value: str) -> bool:
        parsed = urlparse(value)
        return parsed.scheme == "https" and parsed.netloc == "www.kadokado.com.tw" and bool(re.fullmatch(r"/book/\d+", parsed.path))

    @staticmethod
    def _extract_card_fields(anchor: object) -> tuple[str, str, str, list[str], str | None, bool | None]:
        """Extract visible card metadata without relying on hashed CSS class names."""
        card = anchor
        title_node = card.select_one("img[alt]")
        title = str(title_node.get("alt") or "").strip() if title_node else ""
        text_nodes = [node.get_text(" ", strip=True) for node in card.select("span")]
        text_nodes = [value for value in text_nodes if value]
        if not title and text_nodes:
            title = text_nodes[0]
        author = text_nodes[1] if len(text_nodes) > 1 else "未知作者"
        detail = " ".join(text_nodes[2:]) if len(text_nodes) > 2 else ""
        raw_tags = re.findall(r"#[^#\s]+", detail)
        summary = re.sub(r"(?:#[^#\s]+)+", "", detail).strip()
        compact_text = card.get_text(" ", strip=True)
        is_complete = True if "完結" in compact_text[:120] else None
        rating = "R18" if any(marker in compact_text.casefold() for marker in ("🔞", "成人向", "18禁", "r18", "高h")) else None
        return title, author, summary, raw_tags, rating, is_complete

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        for anchor in soup.select('a[href^="/book/"]'):
            url = urljoin(f"{self.base_url}/", str(anchor.get("href") or ""))
            if url in seen_urls or not self._is_verified_book_url(url):
                continue
            title, author, summary, visible_tags, rating, is_complete = self._extract_card_fields(anchor)
            if not title:
                continue
            cover_node = anchor.select_one("img[src]")
            cover_url = str(cover_node.get("src") or "") if cover_node else ""
            parsed_cover = urlparse(cover_url)
            if parsed_cover.netloc not in {"img.kadokado.com.tw", "www.kadokado.com.tw"}:
                cover_url = ""
            tags = ["KadoKado 公開索引", *visible_tags, keyword]
            results.append(
                ScrapedFanfic(
                    id=f"kadokado:{url}",
                    title=title[:240],
                    author=author[:160] or "未知作者",
                    platform="KadoKado 角角者",
                    url=url,
                    tags=", ".join(dict.fromkeys(tags)),
                    summary=summary[:800],
                    coverUrl=cover_url or None,
                    isComplete=is_complete,
                    rating=rating,
                    language="zh-TW",
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results
