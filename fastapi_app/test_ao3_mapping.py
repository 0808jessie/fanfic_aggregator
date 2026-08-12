from bs4 import BeautifulSoup

from fastapi_app.scrapers.ao3_scraper import (
    build_ao3_search_url,
    extract_ao3_tag_metadata,
    relationship_matches_mapping,
)


def test_known_cp_uses_ao3_tag_names_query():
    url, mapped = build_ao3_search_url("義忍", page=1)

    assert mapped is True
    assert "work_search%5Btag_names%5D=Tomioka+Giyuu%2FKochou+Shinobu" in url
    assert "work_search%5Bquery%5D" not in url


def test_unknown_keyword_keeps_free_text_query():
    url, mapped = build_ao3_search_url("月光", page=3)

    assert mapped is False
    assert "work_search%5Bquery%5D=%E6%9C%88%E5%85%89&page=3" in url


def test_mapped_cp_requires_matching_relationship_tag():
    assert relationship_matches_mapping(
        ["Tomioka Giyuu/Kochou Shinobu"],
        "Tomioka Giyuu/Kochou Shinobu",
    ) is True
    assert relationship_matches_mapping(
        ["Gojo Satoru/Geto Suguru"],
        "Tomioka Giyuu/Kochou Shinobu",
    ) is False


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
