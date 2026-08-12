from bs4 import BeautifulSoup
import sys
import os
from unittest.mock import MagicMock, patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from constants.cp_tags import CP_TAG_MAP
from scrapers.ao3_scraper import AO3Scraper, extract_ao3_tag_metadata


def test_cp_tag_map_compound_query():
    assert "Tomioka Giyuu/Kochou Shinobu" in CP_TAG_MAP.get("義忍")
    assert "OR" in CP_TAG_MAP.get("義忍")
    assert "Gojo Satoru/Geto Suguru" in CP_TAG_MAP.get("五夏")


def test_ao3_scraper_methods_exist():
    scraper = AO3Scraper()
    assert hasattr(scraper, "scrape")


def test_ao3_tag_parser_separates_relationships_and_characters():
    work = BeautifulSoup(
        """
        <li class="work">
          <ul class="tags commas">
            <li class="relationships"><a>富岡義勇/胡蝶忍</a></li>
            <li class="characters"><a>富岡義勇</a></li>
            <li class="characters"><a>胡蝶忍</a></li>
            <li class="freeforms"><a>Post-Canon</a></li>
          </ul>
        </li>
        """,
        "html.parser",
    )

    relationships, characters, other = extract_ao3_tag_metadata(work)

    assert relationships == ["富岡義勇/胡蝶忍"]
    assert characters == ["富岡義勇", "胡蝶忍"]
    assert other == ["Post-Canon"]


def test_compound_query_url_construction_logic():
    keyword = "義忍"
    query_to_use = CP_TAG_MAP.get(keyword.strip())
    assert query_to_use is not None
    
    import urllib.parse
    encoded_q = urllib.parse.quote(query_to_use, safe="")
    search_url = f"https://archiveofourown.org/works/search?work_search%5Bquery%5D={encoded_q}&page=1"
    
    assert "work_search%5Bquery%5D=" in search_url
    assert "Tomioka" in search_url
    assert "OR" in search_url
