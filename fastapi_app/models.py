from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ScrapedFanfic(BaseModel):
    """Canonical metadata shape shared by every platform adapter, including source tracking."""

    model_config = ConfigDict(from_attributes=True)

    title: str = "Untitled work"
    author: str = "Unknown author"
    platform: str
    url: str
    tags: str = ""
    summary: str = ""
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    keyword: Optional[str] = None
    source: str = Field(default="live", description="Source of result: live, cache, or fallback")
    warning: Optional[str] = Field(default=None, description="Diagnostic warning if live scraping failed")


class SearchQuery(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)
    platforms: Optional[list[str]] = None


class SearchResponse(BaseModel):
    """Machine-readable search status plus only verified work records."""

    items: list[ScrapedFanfic] = Field(default_factory=list)
    source: Literal["live", "cache", "fallback-cache", "none"] = "none"
    warning: Optional[str] = None
    success: bool = True
    isRateLimited: bool = False
