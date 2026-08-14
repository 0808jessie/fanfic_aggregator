"""CxC 創利市集的公開搜尋 Adapter。

CxC 搜尋頁由前端渲染。本模組只讀取實際呈現的公開卡片與公開 API
回應訊號；逾時、保護頁或未完成渲染時，一律回傳空結果及可重試的
來源警示，絕不推測作品資料。
"""

from __future__ import annotations

from datetime import datetime
import re
import time
from urllib.parse import quote_plus, urljoin

from bs4 import BeautifulSoup
import requests

from models import ScrapedFanfic
from scrapers.base_scraper import BaseScraper

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover - environment safeguard
    sync_playwright = None


class _PublicSearchUnavailable(RuntimeError):
    """Raised when CxC's public listing cannot finish rendering safely."""


class CxCScraper(BaseScraper):
    """Read verified public CxC work cards from the rendered keyword page."""

    base_url = "https://cxc.today"
    search_url = f"{base_url}/zh/explore"
    public_api_url = "https://api.cxc.today/book"
    # CxC's public frontend uses this non-user, server-side device identifier
    # for anonymous catalogue requests. It is disclosed in its shipped client
    # code and is not a user credential.
    public_api_uuid = "56833f18-52ae-4f1f-a3fd-ee5699e03f79"
    user_agent = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
    )
    headers = {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": f"{base_url}/",
        "User-Agent": user_agent,
    }
    public_api_headers = {
        "Accept": "application/json",
        "device": "server",
        "uuid": public_api_uuid,
        "lang": "zh",
        "timezone": "Asia/Taipei",
        "User-Agent": user_agent,
    }
    work_link_selector = '.cxc-card-grid a.work-card[href*="/@"][href*="/work/"]'
    rendered_work_selector = ".cxc-card-grid a.work-card, .cxc-work-card, a[href*='/@'][href*='/work/']"

    @classmethod
    def build_search_url(cls, keyword: str) -> str:
        # This is the public route CxC's own header search navigates to. The
        # older /zh/search URL only loads the search shell in anonymous pages.
        # CxC's own router preserves blank filters as bare keys rather than
        # ``key=``. Keeping that exact shape prevents its query normalizer from
        # interpreting blank flags as incompatible filter values.
        query = "&".join((
            "page=1",
            "per_page=24",
            "is_new",
            "sort_by=updated_at",
            f"keyword={quote_plus(keyword)}",
            "work_category",
            "is_adult=0",
            "has_free",
            "has_subscriber_price",
            "is_file",
            "lang=",
            "work_length",
            "work_duration",
            "target_audience",
            "comic_type",
            "is_original",
            "is_completed",
            "is_vip_only",
            "word_count=0",
            "is_by_work",
            "is_by_section",
            "is_by_volume",
            "is_ai",
            "tutorial_type",
        ))
        return f"{cls.search_url}?{query}"

    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, object]:
        self.last_warning = None
        if not keyword.strip():
            return {"items": [], "total_works": 0, "total_pages": 1}

        # CxC's keyword endpoint accepts the user's literal search term. Unlike
        # AO3 it does not document multi-term CP expansion semantics, so sending
        # the translated local query can over-constrain an otherwise valid tag.
        public_query = keyword.strip()
        try:
            api_payload = self._fetch_public_api_results(public_query)
            if api_payload is not None:
                items = api_payload["items"]
                for item in items:
                    item.keyword = keyword
                total_works = api_payload["total_works"] or len(items)
                if not items:
                    self.last_warning = f"[CxC] No verified public result matched '{keyword}'"
                print(f"[CxC] 官方公開 API 成功抓取 {len(items)} 筆，公開總數 {total_works}")
                return {"items": items, "total_works": total_works, "total_pages": 1}

            html = self._render_public_search_html(public_query)
            items = self.parse_results(html, public_query)
            for item in items:
                item.keyword = keyword
            total_works = self.extract_total_works(html) or len(items)
            if not items:
                self.last_warning = f"[CxC] No verified public result matched '{keyword}'"
            print(f"[CxC] 成功抓取 {len(items)} 筆，公開總數 {total_works}")
            return {"items": items, "total_works": total_works, "total_pages": 1}
        except _PublicSearchUnavailable as error:
            self.last_warning = f"[CxC] {error}"
            print(self.last_warning)
        except Exception as error:
            self.last_warning = f"[CxC] 連線逾時或等待渲染逾時：{error}"
            print(self.last_warning)
        return {
            "items": [],
            "total_works": 0,
            "total_pages": 1,
            "status": "error",
            "count": 0,
            "message": self.last_warning or "連線逾時或等待渲染逾時",
        }

    def _fetch_public_api_results(self, keyword: str) -> dict[str, object] | None:
        """Read CxC's public work list API when its anonymous catalogue is available.

        The endpoint is used by CxC's own explore page. Returning ``None``
        leaves browser rendering as a bounded fallback; malformed or nonzero
        responses never become fabricated works.
        """
        params: list[tuple[str, str | int]] = [
            ("page", 1),
            ("per_page", 24),
            ("is_new", ""),
            ("sort_by", "updated_at"),
            ("keyword", keyword),
            ("work_category", ""),
            ("is_adult", 0),
            ("has_free", ""),
            ("has_subscriber_price", ""),
            ("is_file", ""),
            ("lang", ""),
            ("work_length", ""),
            ("work_duration", ""),
            ("target_audience", ""),
            ("comic_type", ""),
            ("is_original", ""),
            ("is_completed", ""),
            ("is_vip_only", ""),
            ("word_count", 0),
            ("is_by_work", ""),
            ("is_by_section", ""),
            ("is_by_volume", ""),
            ("is_ai", ""),
            ("tutorial_type", ""),
        ]
        try:
            response = requests.get(
                self.public_api_url,
                params=params,
                headers=self.public_api_headers,
                timeout=(5, 12),
            )
            response.raise_for_status()
            payload = response.json()
        except (requests.RequestException, ValueError) as error:
            print(f"[CxC] 公開 API 無法使用，改以公開頁渲染：{error}")
            return None

        data = payload.get("data") if isinstance(payload, dict) else None
        raw_items = data.get("data") if isinstance(data, dict) else None
        if payload.get("code") != 0 or not isinstance(raw_items, list):
            print("[CxC] 公開 API 回應不含可驗證作品資料，改以公開頁渲染")
            return None

        return {
            "items": self._parse_public_api_items(raw_items, keyword),
            "total_works": self._safe_positive_int(data.get("total")),
        }

    def _parse_public_api_items(self, raw_items: list[object], keyword: str) -> list[ScrapedFanfic]:
        """Normalize only API records that expose a CxC creator/work URL."""
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()
        for raw_item in raw_items:
            if not isinstance(raw_item, dict):
                continue
            work_id = raw_item.get("id")
            store = raw_item.get("store")
            url_name = store.get("url_name") if isinstance(store, dict) else None
            if not isinstance(work_id, int) or not isinstance(url_name, str) or not url_name.strip():
                continue
            url = f"{self.base_url}/@{url_name.strip()}/work/{work_id}"
            if not self.is_real_work_url(url) or url in seen_urls:
                continue
            title = str(raw_item.get("name") or "").strip()
            if not title:
                continue
            partners = raw_item.get("partner")
            author = "、".join(str(partner).strip() for partner in partners if str(partner).strip()) if isinstance(partners, list) else ""
            if not author and isinstance(store, dict):
                author = str(store.get("name") or "").strip()
            tags = raw_item.get("hash_tag")
            tag_names = [str(tag).strip() for tag in tags if str(tag).strip()] if isinstance(tags, list) else []
            cover_url = str(raw_item.get("cover_photo") or "").strip()
            results.append(ScrapedFanfic(
                id=f"cxc:{work_id}",
                title=title[:240],
                author=(author or "未知創作者")[:160],
                platform="CxC 創利市集",
                url=url,
                tags=", ".join(dict.fromkeys(tag_names)),
                summary=str(raw_item.get("intro") or "").strip()[:800],
                coverUrl=cover_url if cover_url.startswith("https://cxc.today/") else None,
                scraped_at=datetime.utcnow(),
                keyword=keyword,
            ))
            seen_urls.add(url)
        return results

    @staticmethod
    def _safe_positive_int(value: object) -> int:
        try:
            return max(0, int(value))
        except (TypeError, ValueError):
            return 0

    def _render_public_search_html(self, keyword: str) -> str:
        if sync_playwright is None:
            raise _PublicSearchUnavailable("連線逾時或等待渲染逾時（Playwright 不可用）")

        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
            )
            context = None
            try:
                context = browser.new_context(
                    user_agent=self.user_agent,
                    locale="zh-TW",
                    viewport={"width": 1280, "height": 900},
                    extra_http_headers={
                        "Accept-Language": self.headers["Accept-Language"],
                        "Referer": self.headers["Referer"],
                    },
                )
                page_obj = context.new_page()
                api_response_seen = False

                def record_public_api_response(response) -> None:
                    nonlocal api_response_seen
                    if "/api/" in response.url and response.status == 200:
                        api_response_seen = True

                # Register before navigation so API and DOM readiness are observed
                # in the same six-second bounded window.
                page_obj.on("response", record_public_api_response)
                try:
                    # The document can commit while analytics or client chunks
                    # keep DOMContentLoaded pending. Commit is enough to begin
                    # the bounded public API/card observation below.
                    response = page_obj.goto(self.build_search_url(keyword), timeout=8_000, wait_until="commit")
                except Exception as error:
                    raise _PublicSearchUnavailable("連線逾時或等待渲染逾時") from error
                if response and response.status in (403, 429, 503, 520, 521, 522, 525):
                    raise _PublicSearchUnavailable(f"Request blocked (HTTP {response.status})")

                deadline = time.monotonic() + 6
                card_found = False
                while time.monotonic() < deadline:
                    if page_obj.locator(self.rendered_work_selector).count() > 0:
                        card_found = True
                        break
                    if api_response_seen:
                        # A successful public API response can be followed by a
                        # short DOM commit; keep the remaining bounded window.
                        page_obj.wait_for_timeout(250)
                    else:
                        page_obj.wait_for_timeout(150)

                if api_response_seen and not card_found:
                    remaining = max(250, int((deadline - time.monotonic()) * 1000))
                    try:
                        page_obj.wait_for_selector(self.rendered_work_selector, timeout=remaining)
                        card_found = True
                    except Exception:
                        pass

                html = page_obj.content()
                soup = BeautifulSoup(html, "html.parser")
                if self.has_public_render_error(html):
                    raise _PublicSearchUnavailable("連線逾時或等待渲染逾時（CxC 公開頁回報錯誤）")
                has_work_link = bool(soup.select(self.work_link_selector))
                has_loading = bool(soup.select_one(".hourglass_loading.show, .q-spinner, [class*='loading'], [class*='Loading']"))
                if not has_work_link and self.has_explicit_empty_result(html):
                    return html
                if not has_work_link and (has_loading or not api_response_seen):
                    raise _PublicSearchUnavailable("連線逾時或等待渲染逾時（未完成渲染）")
                if not has_work_link:
                    raise _PublicSearchUnavailable("連線逾時或等待渲染逾時（未產生可信作品卡）")
                return html
            finally:
                if context is not None:
                    context.close()
                browser.close()

    def parse_results(self, html: str, keyword: str) -> list[ScrapedFanfic]:
        soup = BeautifulSoup(html, "html.parser")
        query_terms = [term.casefold() for term in keyword.split() if term]
        results: list[ScrapedFanfic] = []
        seen_urls: set[str] = set()

        for anchor in soup.select(self.work_link_selector):
            url = urljoin(self.base_url, (anchor.get("href") or "").strip())
            if not self.is_real_work_url(url) or url in seen_urls:
                continue
            card = anchor.select_one(".cxc-work-card") or anchor
            title_node = card.select_one(".info__title, .info__name, .work-title, .title, h2, h3, h4, [class*='title'], [class*='Title']")
            title = (title_node or anchor).get_text(" ", strip=True)
            card_text = card.get_text(" ", strip=True)
            if not title or (query_terms and not any(term in f"{title} {card_text}".casefold() for term in query_terms)):
                continue
            author_node = card.select_one(".info__author, .creator, .author, [class*='creator'], [class*='Creator'], [class*='author']")
            image = card.select_one("img[src]") or anchor.select_one("img[src]")
            tags = [node.get_text(" ", strip=True) for node in card.select(".tag, .tags a, [class*='tag']") if node.get_text(" ", strip=True)]
            results.append(ScrapedFanfic(
                id=f"cxc:{url}",
                title=title[:240],
                author=author_node.get_text(" ", strip=True)[:160] if author_node else "未知創作者",
                platform="CxC 創利市集",
                url=url,
                tags=", ".join(dict.fromkeys(tags)),
                summary=card_text[:800],
                coverUrl=urljoin(self.base_url, image.get("src")) if image and image.get("src") else None,
                scraped_at=datetime.utcnow(),
                keyword=keyword,
            ))
            seen_urls.add(url)
        return results

    @staticmethod
    def extract_total_works(html: str) -> int | None:
        soup = BeautifulSoup(html, "html.parser")
        nodes = soup.select(".search-result-count, .search-results-count, .result-count, [data-total], [data-result-count], [class*='search'][class*='count']")
        for node in nodes:
            for attribute in ("data-total", "data-result-count"):
                raw_total = (node.get(attribute) or "").replace(",", "")
                if raw_total.isdigit():
                    return int(raw_total)
        text = " ".join(node.get_text(" ", strip=True) for node in nodes)
        match = re.search(r"(?:共|找到|總計)\s*([\d,]+)\s*(?:部|本|篇|項)?\s*(?:作品|結果|創作)", text)
        return int(match.group(1).replace(",", "")) if match else None

    @staticmethod
    def has_public_render_error(html: str) -> bool:
        """Recognize CxC's own public error page without guessing works."""
        text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True).casefold()
        return any(marker in text for marker in (
            "an error happened",
            "please try again later",
            "發生錯誤",
            "請稍後再試",
        ))

    @staticmethod
    def has_explicit_empty_result(html: str) -> bool:
        """Allow empty only when the public page says no search result exists."""
        text = BeautifulSoup(html, "html.parser").get_text(" ", strip=True).casefold()
        return any(marker in text for marker in (
            "no results",
            "no result found",
            "找不到結果",
            "沒有搜尋結果",
            "沒有符合的結果",
        ))

    @classmethod
    def is_real_work_url(cls, url: str) -> bool:
        return (url.startswith(f"{cls.base_url}/@") and "/work/" in url) or url.startswith(f"{cls.base_url}/works/")
