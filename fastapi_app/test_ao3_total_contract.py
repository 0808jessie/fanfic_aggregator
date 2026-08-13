"""Regression contract for preserving AO3's official result-heading total."""

from pathlib import Path
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent))

import main
from models import ScrapedFanfic


def test_fastapi_preserves_ao3_heading_total_in_total_works_response():
    item = ScrapedFanfic(
        id="ao3:official-total",
        title="Verified AO3 card",
        author="Author",
        platform="AO3",
        url="https://archiveofourown.org/works/15420",
        tags="鬼滅",
        summary="A verified result card.",
        keyword="鬼滅",
    )
    aggregate = {
        "items": [item],
        "any_success": True,
        "total_works": 15420,
        "total_pages": 771,
        "warnings": [],
    }

    with patch("main.parallel_search_platforms", return_value=aggregate), patch("main.save_fanfic_to_db"):
        response = TestClient(main.app).post(
            "/search",
            json={"keyword": "鬼滅", "platforms": ["ao3"], "forceRefresh": True},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["totalWorks"] == 15420
    assert payload["totalPages"] == 771
    assert payload["items"][0]["title"] == "Verified AO3 card"
