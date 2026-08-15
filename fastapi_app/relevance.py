"""Deterministic relevance scoring for verified fanfiction search results."""

from __future__ import annotations

from datetime import datetime
import re

from constants.cp_tags import CP_TAG_MAP
from models import ScrapedFanfic


def _normalize(value: str | None) -> str:
    return (value or "").strip().casefold()


def _cp_match_terms(keyword: str) -> set[str]:
    """Return complete user aliases and canonical AO3 relationship tags for a CP."""
    terms = {_normalize(keyword)}
    mapping = CP_TAG_MAP.get(keyword)
    if mapping:
        quoted_terms = re.findall(r'"([^"()]+)"', mapping)
        terms.update(_normalize(term) for term in quoted_terms if "/" in term)
    return {term for term in terms if term}


def _tag_values(item: ScrapedFanfic) -> list[str]:
    raw_tags = item.tags if isinstance(item.tags, list) else (item.tags or "").split(",")
    values = [*item.relationships, *raw_tags]
    return [_normalize(value) for value in values if _normalize(value)]


def relevance_score(item: ScrapedFanfic, keyword: str) -> int:
    """Score exact CP/tag, title, and summary matches using the public search policy."""
    query = _normalize(keyword)
    if not query:
        return 0

    score = 0
    # CP priority requires a complete relationship tag or a complete alias tag.
    # Substring matching would incorrectly promote a single character tag, such
    # as "Tomioka Giyuu", to the same tier as "Tomioka Giyuu/Kochou Shinobu".
    if any(tag == term for term in _cp_match_terms(keyword) for tag in _tag_values(item)):
        score += 100
    if query in _normalize(item.title):
        score += 50
    if query in _normalize(item.summary):
        score += 20
    return score


def parse_word_count(value: str | None) -> int:
    digits = re.sub(r"[^0-9]", "", value or "")
    return int(digits) if digits else 0


def _updated_timestamp(item: ScrapedFanfic) -> float:
    value = (item.updatedAt or "").strip()
    for pattern in ("%d %b %Y", "%Y-%m-%d", "%Y/%m/%d"):
        try:
            return datetime.strptime(value, pattern).timestamp()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return item.scraped_at.timestamp()


def rank_results(items: list[ScrapedFanfic], keyword: str) -> list[ScrapedFanfic]:
    """Assign relevance scores and return a stable high-to-low relevance ordering."""
    for item in items:
        item.relevanceScore = relevance_score(item, keyword)
    return sorted(
        items,
        key=lambda item: (
            -item.relevanceScore,
            -_updated_timestamp(item),
            -parse_word_count(item.wordCount),
            item.url,
        ),
    )
