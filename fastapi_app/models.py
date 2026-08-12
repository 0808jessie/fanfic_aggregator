from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ScrapedFanfic(BaseModel):
    """Canonical metadata shape shared by every platform adapter."""

    model_config = ConfigDict(from_attributes=True)

    title: str = "Untitled work"
    author: str = "Unknown author"
    platform: str
    url: str
    tags: str = ""
    summary: str = ""
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    keyword: Optional[str] = None


class SearchQuery(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)
    platforms: Optional[list[str]] = None
