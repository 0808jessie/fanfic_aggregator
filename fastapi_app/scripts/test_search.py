"""Print one independent pure-HTTP diagnostic row for each enabled source.

Run from the project root with ``pnpm test:search -- 蛇戀``. The script avoids
the FastAPI database layer and invokes the registered adapters directly, making
it easy to distinguish a public source failure from an API/proxy issue.
"""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import sys
from time import perf_counter


APP_ROOT = Path(__file__).resolve().parents[1]
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from scrapers.index import ADAPTER_TIMEOUT_SECONDS, PLATFORM_LABELS, SCRAPERS, parallel_search_platforms


def diagnose_platform(platform_key: str, keyword: str) -> tuple[str, str, int, int, str]:
    """Execute exactly one source and normalize output for human inspection."""
    started_at = perf_counter()
    payload = parallel_search_platforms(
        [platform_key],
        keyword,
        page=1,
        force_refresh=True,
        timeout_seconds=ADAPTER_TIMEOUT_SECONDS,
    )
    status = payload["platform_statuses"][0]
    elapsed_ms = round((perf_counter() - started_at) * 1000)
    items = payload["items"]
    total_works = payload["total_works"]
    verified_count = total_works if total_works > 0 else len(items)
    message = (status.warning or "").replace("\n", " ").strip()
    return platform_key, status.status, elapsed_ms, verified_count, message


def main() -> int:
    parser = argparse.ArgumentParser(description="Fanfic Atlas five-platform pure HTTP diagnostic")
    parser.add_argument("keyword", nargs="?", default="蛇戀", help="Keyword to send to every enabled platform")
    args = parser.parse_args()
    keyword = args.keyword.strip()
    if not keyword:
        parser.error("keyword cannot be empty")

    print(f"Fanfic Atlas source diagnostic | keyword={keyword}")
    print("platform\tstatus\telapsed_ms\tverified_count\tmessage")
    with ThreadPoolExecutor(max_workers=len(SCRAPERS), thread_name_prefix="fanfic-diagnose") as executor:
        futures = {executor.submit(diagnose_platform, platform, keyword): platform for platform in SCRAPERS}
        rows = {}
        for future in as_completed(futures):
            platform = futures[future]
            try:
                rows[platform] = future.result()
            except Exception as error:  # pragma: no cover - defensive CLI boundary
                rows[platform] = (platform, "error", 0, 0, str(error))

    for platform in SCRAPERS:
        platform_key, state, elapsed_ms, count, message = rows[platform]
        label = PLATFORM_LABELS.get(platform_key, platform_key)
        print(f"{label}\t{state}\t{elapsed_ms}\t{count}\t{message or '-'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
