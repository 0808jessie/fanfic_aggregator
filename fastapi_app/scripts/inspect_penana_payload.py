"""Inspect Penana response markers and parser yield in the cloud environment."""

import sys
from pathlib import Path

from curl_cffi import requests

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from scrapers.penana_scraper import PenanaScraper


def main() -> None:
    scraper = PenanaScraper()
    response = requests.get(
        f"{scraper.base_url}/search",
        params={"t": "story", "search": "鬼滅"},
        headers=scraper.search_headers,
        impersonate="chrome124",
        timeout=30,
    )
    html = response.text
    markers = [marker for marker in ("cf-chl", "cdn-cgi", "just a moment", "cloudflare") if marker in html.casefold()]
    items = scraper.parse_results(html, "鬼滅")
    print(
        f"HTTP={response.status_code} length={len(html)} "
        f"verification_marker={scraper._is_verification_page(html)} "
        f"blocked_challenge={scraper._is_blocked_challenge_html(html)} markers={markers}"
    )
    print(f"parsed_items={len(items)} official_total={scraper.extract_total_works(html)}")
    if items:
        print(f"first={items[0].model_dump()}")


if __name__ == "__main__":
    main()
