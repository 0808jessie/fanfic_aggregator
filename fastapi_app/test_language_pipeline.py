import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import ScrapedFanfic
from scrapers import index
from database import engine
from sqlalchemy import inspect


def test_language_and_rating_columns_are_available_for_persistent_cache():
    columns = {column["name"] for column in inspect(engine).get_columns("fanfics")}
    assert "language" in columns
    assert "rating" in columns


def test_language_selection_never_restricts_adapter_results(monkeypatch):
    received_kwargs = {}

    class FullCaptureAdapter:
        def scrape(self, keyword, **kwargs):
            received_kwargs.update(kwargs)
            return [
                ScrapedFanfic(
                    id="ao3:language-ja",
                    title="日本語の作品",
                    author="作者",
                    platform="AO3",
                    url="https://archiveofourown.org/works/language-ja",
                    language="ja",
                    keyword=keyword,
                ),
                ScrapedFanfic(
                    id="ao3:language-unknown",
                    title="Unclassified work",
                    author="Author",
                    platform="AO3",
                    url="https://archiveofourown.org/works/language-unknown",
                    language="unknown",
                    keyword=keyword,
                ),
            ]

    index._SOURCE_CACHE.clear()
    monkeypatch.setitem(index.SCRAPERS, "ao3", FullCaptureAdapter)
    _, items, _, _, _ = index.search_single_platform("ao3", "language", language="ja")

    assert "language" not in received_kwargs
    assert [item.url for item in items] == [
        "https://archiveofourown.org/works/language-ja",
        "https://archiveofourown.org/works/language-unknown",
    ]
    assert [item.language for item in items] == ["ja", "unknown"]
