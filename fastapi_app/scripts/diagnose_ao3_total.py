"""Compare AO3's live result heading total with this app's FastAPI totalWorks.

Run from ``fastapi_app`` after the local service is started:
``python3 -m scripts.diagnose_ao3_total fanfiction``.
The script performs read-only public searches and exits non-zero if a verified
AO3 heading is available but the API total differs.
"""

from __future__ import annotations

import argparse
import sys

import requests

from scrapers.ao3_scraper import AO3Scraper


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("keyword", help="AO3 free-text keyword to compare")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000/search")
    args = parser.parse_args()

    adapter = AO3Scraper()
    adapter_payload = adapter.scrape(args.keyword, force_refresh=True)
    adapter_total = int(adapter_payload.get("total_works", 0) or 0)
    if not adapter_payload.get("items"):
        print("FAIL: AO3 did not return verifiable public result cards; comparison skipped.")
        return 2
    if adapter.last_total_heading is None:
        print("FAIL: AO3 returned cards but no verifiable official result heading; comparison skipped.")
        return 2

    heading_text, heading_total = adapter.last_total_heading
    if heading_total != adapter_total:
        print("FAIL: Adapter total does not match its extracted official heading.")
        return 1

    response = requests.post(
        args.api_url,
        json={"keyword": args.keyword, "platforms": ["ao3"], "page": 1, "forceRefresh": True},
        timeout=130,
    )
    response.raise_for_status()
    api_payload = response.json()
    api_total = int(api_payload.get("totalWorks", 0) or 0)

    print(f"AO3 official heading: {heading_text}")
    print(f"AO3 adapter heading total: {adapter_total}")
    print(f"FastAPI totalWorks: {api_total}")
    if adapter_total != api_total:
        print("FAIL: FastAPI totalWorks does not match the verified AO3 heading total.")
        return 1

    print("PASS: FastAPI totalWorks matches the verified AO3 heading total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
