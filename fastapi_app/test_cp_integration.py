from __future__ import annotations
from unittest.mock import patch

from fastapi_app import main
from fastapi_app.models import ScrapedFanfic, SearchQuery


def test_mapped_cp_api_preserves_relationship_and_character_contract():
    item = ScrapedFanfic(
        id="ao3:https://archiveofourown.org/works/9901",
        title="義忍 mock story",
        author="AO3 author",
        platform="AO3",
        url="https://archiveofourown.org/works/9901",
        tags="Tomioka Giyuu/Kochou Shinobu, Tomioka Giyuu, Kochou Shinobu",
        relationships=["Tomioka Giyuu/Kochou Shinobu"],
        characters=["Tomioka Giyuu", "Kochou Shinobu"],
        summary="Verified pairing metadata.",
        keyword="義忍",
    )
    aggregate = {
        "items": [item],
        "any_success": True,
        "total_works": 1,
        "total_pages": 1,
        "warnings": [],
    }

    main._MEMORY_CACHE.clear()
    with patch.object(main, "parallel_search_platforms", return_value=aggregate), patch.object(main, "save_fanfic_to_db"):
        response = main.search_fanfics(
            SearchQuery(keyword="義忍", platforms=["ao3"], page=1),
            db=object(),
        )
    main._MEMORY_CACHE.clear()

    assert response.success is True
    assert response.items[0].relationships == ["Tomioka Giyuu/Kochou Shinobu"]
    assert response.items[0].characters == ["Tomioka Giyuu", "Kochou Shinobu"]
    assert response.items[0].platform == "AO3"
