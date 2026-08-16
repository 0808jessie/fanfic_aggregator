from __future__ import annotations
"""Print Cloud-runtime HTTP status, response length, and a safe 200-character preview.

This script intentionally performs only public GET requests. It is separate from
the application adapters so its output can distinguish upstream protection from
application parsing or UI issues.
"""

from curl_cffi import requests


TARGETS = (
    ("https://archiveofourown.org/works/search?work_search%5Bquery%5D=test", "AO3"),
    ("https://www.penana.com/search?q=test", "Penana"),
)


def main() -> None:
    for url, name in TARGETS:
        try:
            response = requests.get(url, impersonate="chrome124", timeout=20)
            preview = " ".join(response.text[:200].split())
            print(f"[{name}] Status: {response.status_code} Length: {len(response.text)}")
            print(f"[{name}] Preview: {preview}")
        except Exception as error:
            print(f"[{name}] Error: {error}")


if __name__ == "__main__":
    main()
