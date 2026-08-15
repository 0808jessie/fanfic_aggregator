"""Inspect Pixiv public HTML against the scraper's parsed item contract."""

import sys
from pathlib import Path
from urllib.parse import quote

from bs4 import BeautifulSoup
from curl_cffi import requests

APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from scrapers.pixiv_scraper import PixivScraper


def main() -> None:
    keyword = "鬼滅"
    scraper = PixivScraper()
    url = f"{scraper.search_url}/{keyword}/novels"
    response = requests.get(url, headers=scraper.search_headers, impersonate="chrome124", timeout=30)
    soup = BeautifulSoup(response.text, "html.parser")
    novel_hrefs = [
        anchor.get("href", "")
        for anchor in soup.select("a[href]")
        if "novel" in anchor.get("href", "")
    ]
    parsed = scraper.parse_results(response.text, keyword)

    ajax_url = f"https://www.pixiv.net/ajax/search/novels/{quote(keyword)}"
    ajax_response = requests.get(
        ajax_url,
        params={"word": keyword, "order": "date_d", "mode": "all", "p": 1, "s_mode": "s_tag", "type": "all", "lang": "ja"},
        headers={**scraper.search_headers, "Accept": "application/json, text/plain, */*", "X-Requested-With": "XMLHttpRequest"},
        impersonate="chrome124",
        timeout=30,
    )

    print(f"HTTP={response.status_code} html_length={len(response.text)}")
    print(f"novel_hrefs={len(novel_hrefs)} sample={novel_hrefs[:8]}")
    print(f"parsed_items={len(parsed)}")
    if parsed:
        print(f"first={parsed[0].model_dump()}")
    print(f"ajax_http={ajax_response.status_code} ajax_length={len(ajax_response.text)} ajax_preview={' '.join(ajax_response.text[:200].split())}")
    if ajax_response.ok:
        ajax_data = ajax_response.json()
        novels = ajax_data.get("body", {}).get("novel", {}).get("data", [])
        if novels:
            first = novels[0]
            print(f"ajax_first_keys={sorted(first)}")
            print(f"ajax_first_id={first.get('id')} title={first.get('title')} author={first.get('userName')} updated={first.get('updateDate')}")


if __name__ == "__main__":
    main()
