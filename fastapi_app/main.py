from datetime import datetime, timedelta
from typing import Callable

from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .config import settings
from .database import Fanfic, SessionLocal
from .models import ScrapedFanfic, SearchQuery
from .scrapers.ao3_scraper import AO3Scraper
from .scrapers.lofter_scraper import LofterScraper

app = FastAPI(title="Fanfic Atlas Search API", version="0.1.0")
CACHE_TTL = timedelta(seconds=settings.cache_ttl_seconds)
SCRAPERS: dict[str, Callable[[], object]] = {
    "ao3": AO3Scraper,
    "lofter": LofterScraper,
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def canonical_platforms(platforms: list[str] | None) -> list[str]:
    requested = platforms or list(SCRAPERS)
    normalized = []
    for platform in requested:
        key = platform.strip().lower()
        if key in SCRAPERS and key not in normalized:
            normalized.append(key)
    return normalized


def save_fanfic_to_db(db: Session, fanfic: ScrapedFanfic) -> None:
    """Upsert one canonical record by URL without mixing dict/model access."""
    record = db.query(Fanfic).filter(Fanfic.url == fanfic.url).first()
    values = fanfic.model_dump()
    if record is None:
        db.add(Fanfic(**values))
    else:
        for field, value in values.items():
            setattr(record, field, value)
    db.commit()


def get_cached_results(db: Session, keyword: str, platforms: list[str]) -> list[ScrapedFanfic] | None:
    """Return a complete cache hit; partial platform caches trigger a fresh search."""
    cutoff = datetime.utcnow() - CACHE_TTL
    cached_records: list[Fanfic] = []
    for platform in platforms:
        records = (
            db.query(Fanfic)
            .filter(
                Fanfic.keyword == keyword,
                func.lower(Fanfic.platform) == platform,
                Fanfic.scraped_at >= cutoff,
            )
            .order_by(Fanfic.scraped_at.desc())
            .all()
        )
        if not records:
            return None
        cached_records.extend(records)

    unique_records = {record.url: record for record in cached_records}
    return [ScrapedFanfic.model_validate(record) for record in unique_records.values()]


@app.get("/fastapi-status")
def fastapi_status() -> dict[str, str]:
    return {"status": "ok", "service": "fastapi-search"}


@app.get("/platforms")
def list_platforms() -> list[dict[str, str]]:
    return [
        {"id": "ao3", "label": "AO3", "status": "ready"},
        {"id": "lofter", "label": "Lofter", "status": "best-effort"},
    ]


@app.post("/search", response_model=list[ScrapedFanfic])
def search_fanfics(query: SearchQuery, db: Session = Depends(get_db)) -> list[ScrapedFanfic]:
    keyword = query.keyword.strip()
    if not keyword:
        raise HTTPException(status_code=422, detail="keyword cannot be empty")

    platforms = canonical_platforms(query.platforms)
    if not platforms:
        raise HTTPException(status_code=400, detail="No supported platform was selected")

    try:
        cached = get_cached_results(db, keyword, platforms)
        if cached is not None:
            return sorted(cached, key=lambda item: item.scraped_at, reverse=True)

        fresh_results: list[ScrapedFanfic] = []
        for platform in platforms:
            adapter = SCRAPERS[platform]()
            try:
                fresh_results.extend(adapter.scrape(keyword))
            except Exception as error:
                print(f"[{platform}] adapter error: {error}")

        deduplicated: dict[str, ScrapedFanfic] = {}
        for result in fresh_results:
            result.keyword = keyword
            deduplicated[result.url] = result
            save_fanfic_to_db(db, result)

        return sorted(deduplicated.values(), key=lambda item: item.scraped_at, reverse=True)
    except HTTPException:
        raise
    except Exception as error:
        db.rollback()
        print(f"[search] unexpected error: {error}")
        raise HTTPException(status_code=500, detail="Search service failed") from error
