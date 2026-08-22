from datetime import datetime
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from models import ScrapedFanfic, SearchQuery
from relevance import rank_results, relevance_score
from scrapers import index as scraper_index


def story(**overrides):
    payload = {
        "title": "Untitled",
        "author": "Author",
        "platform": "AO3",
        "url": "https://archiveofourown.org/works/1",
        "scraped_at": datetime(2024, 1, 1),
    }
    payload.update(overrides)
    return ScrapedFanfic(**payload)


def test_giyushino_relationship_match_ranks_before_title_and_summary_matches():
    cp_match = story(
        url="https://archiveofourown.org/works/1",
        relationships=["Tomioka Giyuu/Kochou Shinobu"],
        title="A quiet day",
        summary="No alias in summary.",
        wordCount="1,000",
    )
    title_match = story(
        url="https://archiveofourown.org/works/2",
        title="【義忍】標題命中",
        summary="No alias in summary.",
        wordCount="9,000",
    )
    summary_match = story(
        url="https://archiveofourown.org/works/3",
        title="A different pairing",
        summary="本文提到義忍。",
        wordCount="20,000",
    )

    ranked = rank_results([summary_match, title_match, cp_match], "義忍")

    assert relevance_score(cp_match, "義忍") == 100
    assert relevance_score(title_match, "義忍") == 50
    assert relevance_score(summary_match, "義忍") == 20
    assert [item.url for item in ranked] == [cp_match.url, title_match.url, summary_match.url]


def test_single_character_tag_does_not_receive_exact_cp_priority():
    single_character = story(
        relationships=["Tomioka Giyuu"],
        tags="Kochou Shinobu",
        title="A quiet day",
        summary="No pairing alias here.",
    )
    full_pairing = story(
        url="https://archiveofourown.org/works/6",
        relationships=["Tomioka Giyuu/Kochou Shinobu"],
    )

    assert relevance_score(single_character, "義忍") == 0
    assert relevance_score(full_pairing, "義忍") == 100


def test_rank_results_breaks_equal_scores_by_update_time_then_word_count():
    older_long = story(
        url="https://archiveofourown.org/works/7",
        updatedAt="2024-01-01",
        wordCount="100,000",
    )
    newer_short = story(
        url="https://archiveofourown.org/works/8",
        updatedAt="2024-06-01",
        wordCount="1,000",
    )
    newer_long = story(
        url="https://archiveofourown.org/works/9",
        updatedAt="2024-06-01",
        wordCount="9,000",
    )

    ranked = rank_results([older_long, newer_short, newer_long], "未命中")

    assert [item.url for item in ranked] == [newer_long.url, newer_short.url, older_long.url]


def test_verified_search_cache_ttls_are_twelve_hours_across_api_and_source_layers():
    assert main.cache_ttl_for("義忍", 40) == main.SEARCH_MEMORY_CACHE_TTL
    assert main.cache_ttl_for("一般關鍵字", 10) == main.SEARCH_MEMORY_CACHE_TTL
    assert main.cache_ttl_for("罕見關鍵字", 2) == main.SEARCH_MEMORY_CACHE_TTL
    assert main.SEARCH_MEMORY_CACHE_TTL.total_seconds() == 43_200
    assert scraper_index.SOURCE_CACHE_TTL_SECONDS == 43_200


def test_search_query_accepts_camel_and_snake_case_force_refresh_flags():
    assert SearchQuery(keyword="花", forceRefresh=True).forceRefresh is True
    assert SearchQuery(keyword="花", force_refresh=True).forceRefresh is True


def test_force_refresh_skips_memory_cache_and_forwards_to_adapter_registry():
    cached_item = story(title="Cached", url="https://archiveofourown.org/works/4")
    live_item = story(title="Live", url="https://archiveofourown.org/works/5")
    cache_key = "花:ao3:page=1"
    cache = {cache_key: (datetime.utcnow(), [cached_item], 1, 1, 1, main.NORMAL_CONFIDENCE_CACHE_TTL)}
    payload = {"items": [live_item], "any_success": True, "total_works": 1, "total_pages": 1, "warnings": []}

    with patch.object(main, "_MEMORY_CACHE", cache), patch.object(
        main, "parallel_search_platforms", return_value=payload
    ) as parallel_search, patch.object(main, "save_fanfic_to_db"):
        response = main.search_fanfics(
            SearchQuery(keyword="花", platforms=["ao3"], page=1, forceRefresh=True), object()
        )

    assert response.source == "live"
    assert response.items[0].title == "Live"
    parallel_search.assert_called_once_with(["ao3"], "花", 1, force_refresh=True)
