import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from scrapers.index import PLATFORM_TIMEOUT_SECONDS, SCRAPERS, parallel_search_platforms


def test_popo_is_retired_from_adapter_registry_and_timeout_policy():
    assert "popo" not in SCRAPERS
    assert "popo" not in PLATFORM_TIMEOUT_SECONDS


def test_popo_is_ignored_when_an_old_client_sends_its_platform_id():
    aggregate = parallel_search_platforms(["popo"], "義忍", page=1)

    assert aggregate["items"] == []
    assert aggregate["platform_statuses"][0].platformId == "popo"
    assert aggregate["platform_statuses"][0].status == "error"
    assert "not supported" in (aggregate["platform_statuses"][0].warning or "")
    assert aggregate["total_works"] == 0
