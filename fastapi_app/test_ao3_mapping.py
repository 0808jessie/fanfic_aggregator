from bs4 import BeautifulSoup
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from constants.cp_tags import CP_TAG_MAP
from scrapers.ao3_scraper import AO3Scraper, matches_expected_relationship, extract_ao3_tag_metadata


def test_cp_tag_map_constants():
    assert CP_TAG_MAP.get("義忍") == "Tomioka Giyuu/Kochou Shinobu"
    assert CP_TAG_MAP.get("五夏") == "Gojo Satoru/Geto Suguru"
    assert CP_TAG_MAP.get("勝出") == "Bakugou Katsuki/Midoriya Izuku"


def test_matches_expected_relationship():
    rels = ["富岡義勇/胡蝶忍", "Tomioka Giyuu/Kochou Shinobu"]
    assert matches_expected_relationship(rels, "Tomioka Giyuu/Kochou Shinobu") is True
    assert matches_expected_relationship(["Gojo Satoru/Geto Suguru"], "Tomioka Giyuu/Kochou Shinobu") is False
    assert matches_expected_relationship([], "Tomioka Giyuu/Kochou Shinobu") is False


def test_ao3_scraper_methods_exist():
    scraper = AO3Scraper()
    assert hasattr(scraper, "_fallback_query_search")
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


def test_relationship_names_url_construction_logic():
    keyword = "義忍"
    mapped_cp = CP_TAG_MAP.get(keyword.strip())
    assert mapped_cp == "Tomioka Giyuu/Kochou Shinobu"
    
    import urllib.parse
    encoded_rel = urllib.parse.quote(mapped_cp, safe="")
    search_url = f"https://archiveofourown.org/works/search?work_search%5Brelationship_names%5D={encoded_rel}&page=1"
    
    assert "work_search%5Brelationship_names%5D=" in search_url
    assert "Tomioka" in search_url
    assert "relationship_names" in search_url
    assert "tag_names" not in search_url
