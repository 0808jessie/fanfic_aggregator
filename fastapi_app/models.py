from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ScrapedFanfic(BaseModel):
    """Canonical metadata shape shared by every platform adapter, including source tracking."""

    model_config = ConfigDict(from_attributes=True)

    id: str = ""
    title: str = "Untitled work"
    author: str = "Unknown author"
    platform: Literal["AO3", "CxC 創利市集", "Lofter", "同人誌中心", "在水裡寫字", "Penana", "晉江", "其他"] = "AO3"
    url: str
    tags: str = ""
    relationships: list[str] = Field(default_factory=list)
    characters: list[str] = Field(default_factory=list)
    summary: str = ""
    coverUrl: Optional[str] = None
    wordCount: Optional[str] = None
    updatedAt: Optional[str] = None
    isComplete: Optional[bool] = None
    relevanceScore: int = 0
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    keyword: Optional[str] = None
    source: str = Field(default="live", description="Source of result: live, cache, or fallback")
    warning: Optional[str] = Field(default=None, description="Diagnostic warning if live scraping failed")


class CustomCpMapping(BaseModel):
    """Optional browser-local CP override for one search request only."""

    alias: str = Field(min_length=1, max_length=60)
    ao3Query: str = Field(min_length=1, max_length=240)
    localQuery: str = Field(min_length=1, max_length=240)


class SearchQuery(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)
    platforms: Optional[list[str]] = None
    page: int = Field(default=1, ge=1)
    forceRefresh: bool = False
    customCpMappings: Optional[list[CustomCpMapping]] = Field(default=None, max_length=60)


class PlatformStatus(BaseModel):
    """Verified per-platform outcome for one isolated search attempt."""

    platformId: str
    label: str
    status: Literal["success", "blocked", "cooldown", "empty", "error"]
    itemCount: int = Field(default=0, ge=0)
    warning: Optional[str] = None
    translatedQuery: str


class SearchResponse(BaseModel):
    """Machine-readable search status plus only verified work records."""

    items: list[ScrapedFanfic] = Field(default_factory=list)
    source: Literal["live", "cache", "fallback-cache", "none"] = "none"
    warning: Optional[str] = None
    success: bool = True
    isRateLimited: bool = False
    totalWorks: int = 0
    totalPages: int = 0
    page: int = 1
    loadedThroughPage: int = 0
    nextPage: Optional[int] = None
    hasMore: bool = False
    platformStatuses: list[PlatformStatus] = Field(default_factory=list)
