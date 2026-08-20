"""Public, metadata-only KadoKado search adapter.

The adapter reads the JSON endpoint used by KadoKado's public search page. It
never logs in, opens a browser, accesses chapter content, or attempts to work
around a failed public request.
"""

from __future__ import annotations

import re
from datetime import datetime
from time import perf_counter
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
import httpx

from constants.cp_tags import CP_CACHE_ALIASES
from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper


class _PublicSearchUnavailable(RuntimeError):
    """Raised when the official public search document cannot be used safely."""


class KadoKadoScraper(BaseScraper):
    """Normalize verified, relevant KadoKado work metadata into shared results."""

    base_url = "https://www.kadokado.com.tw"
    public_api_url = "https://api.kadokado.com.tw/v3/search"
    public_api_timeout_seconds = 8.0
    public_page_size = 20
    headers = {
        "Accept": "application/json",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
    }

    def _log_public_outcome(self, outcome: str, error: Exception) -> None:
        """Record public failure classes without logging search input or cookies."""
        print(
            f"[KadoKado PublicSearch] stage=outcome endpoint={self.public_api_url} "
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
            payload = self._fetch_public_search_payload(normalized_keyword, page)
            items = self.parse_api_results(payload, normalized_keyword)
            if not items:
                self.last_warning = f"[KadoKado 角角者] No verified public result matched '{normalized_keyword}'"
            # The API's `total` includes semantic recommendations. Returning the
            # post-filtered count avoids advertising unrelated result pages.
            return {"items": items, "total_works": len(items), "total_pages": 1}
        except _PublicSearchUnavailable as error:
            self._log_public_outcome("unavailable", error)
            self.last_warning = f"[KadoKado 角角者] {error}"
        except Exception as error:
            self._log_public_outcome("parse-error", error)
            self.last_warning = f"[KadoKado 角角者] Public search parse failed safely: {error}"
        return {"items": [], "total_works": 0, "total_pages": 1}

    @staticmethod
    def _safe_int(value: object) -> int:
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    @staticmethod
    def _normalized_match_text(value: object) -> str:
        """Normalize visible metadata for exact, whitespace-tolerant matching."""
        return re.sub(r"\s+", "", str(value or "")).casefold()

    @classmethod
    def _relevance_terms(cls, keyword: str) -> tuple[str, ...]:
        """Use the literal query and only explicit CP spelling aliases."""
        aliases = CP_CACHE_ALIASES.get(keyword.strip(), frozenset((keyword.strip(),)))
        terms = {cls._normalized_match_text(keyword)}
        terms.update(cls._normalized_match_text(alias) for alias in aliases)
        return tuple(term for term in terms if term)

    @classmethod
    def _matches_relevance(cls, keyword: str, *metadata_values: object) -> bool:
        """Require a query match in public title, summary, or official tag metadata."""
        searchable_text = cls._normalized_match_text(" ".join(str(value or "") for value in metadata_values))
        return bool(searchable_text) and any(term in searchable_text for term in cls._relevance_terms(keyword))

    def _fetch_public_search_payload(self, keyword: str, page: int) -> dict[str, object]:
        started_at = perf_counter()
        try:
            response = httpx.get(
                self.public_api_url,
                params={
                    "current": max(1, page),
                    "limit": self.public_page_size,
                    "sentence": keyword,
                },
                headers=self.headers,
                timeout=self.public_api_timeout_seconds,
                follow_redirects=False,
            )
        except Exception as error:
            elapsed_ms = round((perf_counter() - started_at) * 1000)
            print(
                f"[KadoKado PublicSearch] stage=search endpoint={self.public_api_url} "
                f"status=request-error elapsed_ms={elapsed_ms}"
            )
            raise _PublicSearchUnavailable(f"Public HTTP request unavailable: {error}") from error

        status_code = int(getattr(response, "status_code", 0))
        elapsed_ms = round((perf_counter() - started_at) * 1000)
        print(
            f"[KadoKado PublicSearch] stage=search endpoint={self.public_api_url} "
            f"status={status_code} elapsed_ms={elapsed_ms}"
        )
        if status_code in (401, 403, 429, 503, 520, 521, 522, 525):
            raise _PublicSearchUnavailable(f"Public search blocked (HTTP {status_code}), skipping cleanly")
        response.raise_for_status()
        try:
            payload = response.json()
        except Exception as error:
            raise _PublicSearchUnavailable("Public search did not return JSON, skipping cleanly") from error
        if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
            raise _PublicSearchUnavailable("Public search JSON payload was unavailable")
        return payload

    @classmethod
    def _is_verified_book_url(cls, value: str) -> bool:
        parsed = urlparse(value)
        return parsed.scheme == "https" and parsed.netloc == "www.kadokado.com.tw" and bool(re.fullmatch(r"/book/\d+", parsed.path))

    @staticmethod
    def _extract_card_fields(anchor: object) -> tuple[str, str, str, list[str], str | None, bool | None]:
        """Extract visible legacy HTML metadata without relying on hashed CSS classes."""
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
        """Keep legacy HTML parsing strict if the parser is used in isolated tests."""
        soup = BeautifulSoup(html, "html.parser")
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        for anchor in soup.select('a[href^="/book/"]'):
            url = urljoin(f"{self.base_url}/", str(anchor.get("href") or ""))
            if url in seen_urls or not self._is_verified_book_url(url):
                continue
            title, author, summary, visible_tags, rating, is_complete = self._extract_card_fields(anchor)
            if not title or not self._matches_relevance(keyword, title, summary, *visible_tags):
                continue
            cover_node = anchor.select_one("img[src]")
            cover_url = str(cover_node.get("src") or "") if cover_node else ""
            parsed_cover = urlparse(cover_url)
            if parsed_cover.netloc not in {"img.kadokado.com.tw", "www.kadokado.com.tw"}:
                cover_url = ""
            results.append(
                ScrapedFanfic(
                    id=f"kadokado:{url}",
                    title=title[:240],
                    author=author[:160] or "未知作者",
                    platform="KadoKado 角角者",
                    url=url,
                    tags=", ".join(dict.fromkeys(visible_tags)),
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

    def parse_api_results(self, payload: dict[str, object], keyword: str) -> list[ScrapedFanfic]:
        """Map only relevant public API metadata to the shared result model."""
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        raw_results = payload.get("data")
        if not isinstance(raw_results, list):
            return results

        for raw_item in raw_results:
            if not isinstance(raw_item, dict):
                continue
            work_id = self._safe_int(raw_item.get("id"))
            if not work_id:
                continue
            url = f"{self.base_url}/book/{work_id}"
            if url in seen_urls or not self._is_verified_book_url(url):
                continue

            title = str(raw_item.get("displayName") or "").strip()
            if not title:
                continue
            authors = raw_item.get("authorsDisplayNames")
            author_names = [str(name).strip() for name in authors if str(name).strip()] if isinstance(authors, list) else []
            author = ", ".join(author_names) or str(raw_item.get("ownerDisplayName") or "未知作者").strip()
            logline = str(raw_item.get("logline") or "").strip()
            one_line_intro = str(raw_item.get("oneLineIntro") or "").strip()
            summary = logline or one_line_intro

            tags: list[str] = []
            for source_tags in (raw_item.get("tags"), raw_item.get("genreDisplayNames")):
                if isinstance(source_tags, list):
                    tags.extend(str(tag).strip() for tag in source_tags if str(tag).strip())
            tags = list(dict.fromkeys(tags))
            if not self._matches_relevance(keyword, title, logline, one_line_intro, *tags):
                continue

            cover_url = None
            raw_covers = raw_item.get("coverUrls")
            if isinstance(raw_covers, list):
                for value in raw_covers:
                    candidate = str(value or "").strip()
                    parsed_cover = urlparse(candidate)
                    if parsed_cover.scheme == "https" and parsed_cover.netloc == "img.kadokado.com.tw":
                        cover_url = candidate
                        break

            serialized = raw_item.get("isSerialized")
            is_complete = (not serialized) if isinstance(serialized, bool) else None
            rating = "R18" if raw_item.get("isRRated") is True else None
            word_count = self._safe_int(raw_item.get("wordCount"))
            results.append(
                ScrapedFanfic(
                    id=f"kadokado:{url}",
                    title=title[:240],
                    author=author[:160] or "未知作者",
                    platform="KadoKado 角角者",
                    url=url,
                    tags=", ".join(tags),
                    summary=summary[:800],
                    coverUrl=cover_url,
                    isComplete=is_complete,
                    rating=rating,
                    wordCount=str(word_count) if word_count else None,
                    language="zh-TW",
                    scraped_at=datetime.utcnow(),
                    keyword=keyword,
                )
            )
            seen_urls.add(url)
        return results
