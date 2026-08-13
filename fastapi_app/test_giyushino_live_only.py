from datetime import datetime
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from models import ScrapedFanfic, SearchQuery


def test_giyushino_bypasses_old_memory_and_database_cache():
    stale_item = ScrapedFanfic(
        title="STALE CACHE ITEM",
        author="Old cache",
        platform="AO3",
        url="https://archiveofourown.org/works/1",
        keyword="義忍",
    )
    live_item = ScrapedFanfic(
        title="【義忍】LIVE RESULT",
        author="AO3 live",
        platform="AO3",
        url="https://archiveofourown.org/works/27025444",
        keyword="義忍",
    )
    stale_key = "義忍:ao3:page=1"
    simplified_stale_key = "义忍:ao3:page=1"
    unrelated_key = "五夏:ao3:page=1"
    memory_cache = {
        stale_key: (datetime.utcnow(), [stale_item], 1, 1, 1),
        simplified_stale_key: (datetime.utcnow(), [stale_item], 1, 1, 1),
        unrelated_key: (datetime.utcnow(), [stale_item], 1, 1, 1),
    }

    live_payload = {
        "items": [live_item],
        "any_success": True,
        "total_works": 40,
        "total_pages": 2,
        "warnings": [],
    }

    with patch.object(main, "_MEMORY_CACHE", memory_cache), patch.object(
        main, "parallel_search_platforms", return_value=live_payload
    ) as parallel_search, patch.object(main, "save_fanfic_to_db") as save_to_db, patch.object(
        main, "get_cached_results"
    ) as get_cached:
        response = main.search_fanfics(
            SearchQuery(keyword="義忍", platforms=["ao3"], page=1), object()
        )

    assert response.source == "live"
    assert response.totalWorks == 40
    assert response.items[0].title == "【義忍】LIVE RESULT"
    parallel_search.assert_called_once_with(["ao3"], "義忍", 1)
    save_to_db.assert_not_called()
    get_cached.assert_not_called()
    assert stale_key not in memory_cache
    assert simplified_stale_key not in memory_cache
    assert unrelated_key in memory_cache
