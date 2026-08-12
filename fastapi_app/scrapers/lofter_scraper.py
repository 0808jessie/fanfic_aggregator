from datetime import datetime
from urllib.parse import quote_plus
import requests

from .base_scraper import BaseScraper
from ..models import ScrapedFanfic


class LofterScraper(BaseScraper):
    """Lofter best-effort adapter with silent error isolation (returns [] on 403/429/525 or offline)."""

    def scrape(self, keyword: str, page: int = 1) -> list[ScrapedFanfic]:
        self.last_warning = None
        results: list[ScrapedFanfic] = []

        try:
            encoded_tag = quote_plus(keyword)
            tag_url = f"https://www.lofter.com/tag/{encoded_tag}"

            headers = {
                "User-Agent": "LOFTER/7.6.0 (iPhone; iOS 16.6; Scale/3.00)",
                "Referer": "https://www.lofter.com/",
                "Origin": "https://www.lofter.com",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
            }

            response = requests.get(tag_url, headers=headers, timeout=8)
            status_code = response.status_code

            if status_code in (403, 404, 429, 525, 503):
                self.last_warning = f"[Lofter Adapter] Blocked or Offline (HTTP {status_code})"
                print(f"[Lofter Adapter] Blocked or Offline: HTTP {status_code} for tag '{keyword}'")
                return []

            if response.ok and len(response.text) > 500:
                # 簡單解析預留或回傳空陣列以防 WAF 攔截
                pass

        except Exception as err:
            self.last_warning = f"[Lofter Adapter] Blocked or Offline: {err}"
            print(f"[Lofter Adapter] Blocked or Offline: {err}")

        return results
