from __future__ import annotations
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ScrapedFanfic(BaseModel):
    """Canonical metadata shape shared by every platform adapter, including source tracking."""

    model_config = ConfigDict(from_attributes=True)

    id: str = ""
    title: str = "Untitled work"
    author: str = "Unknown author"
    platform: Literal["AO3", "CxC 創利市集", "Lofter", "同人誌中心", "在水裡寫字", "Penana", "pixiv", "晉江", "其他"] = "AO3"
    url: str
    tags: str | list[str] = ""
    relationships: list[str] = Field(default_factory=list)
    characters: list[str] = Field(default_factory=list)
    summary: str = ""
    coverUrl: Optional[str] = None
    wordCount: Optional[str] = None
    updatedAt: Optional[str] = None
    updated_at: Optional[str] = None
    isComplete: Optional[bool] = None
    relevanceScore: int = 0
    scraped_at: datetime = Field(default_factory=datetime.utcnow)
    keyword: Optional[str] = None
    source: str = Field(default="live", description="Source of result: live, cache, or fallback")
    warning: Optional[str] = Field(default=None, description="Diagnostic warning if live scraping failed")


class SearchQuery(BaseModel):
    keyword: str = Field(min_length=1, max_length=120)
    mode: Literal["keyword", "author"] = "keyword"
    language: Optional[Literal["all", "zh", "en", "ja"]] = "all"
    platforms: Optional[list[str]] = None
    platform: Optional[str] = Field(default=None, min_length=1, max_length=40)
    page: int = Field(default=1, ge=1)
    forceRefresh: bool = False
    # Browser-local mapping payloads are intentionally permissive at the HTTP
    # boundary. The controller validates entries individually so one malformed
    # localStorage value can never reject an otherwise valid search.
    customCpMappings: Any = Field(default_factory=list)
    customCpMap: Any = None


class CustomCpMapping(BaseModel):
    """A request-scoped browser-local CP override supplied by the UI."""

    alias: str = Field(min_length=1, max_length=80)
    ao3Query: str = Field(min_length=1, max_length=320)
    localQuery: str = Field(min_length=1, max_length=320)


class PlatformStatus(BaseModel):
    """Verified per-platform outcome for one isolated search attempt."""

    platformId: str
    label: str
    status: Literal["success", "blocked", "cooldown", "empty", "error"]
    itemCount: int = Field(default=0, ge=0)
    warning: Optional[str] = None
    translatedQuery: str
    fromCache: bool = False


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
    fromCache: bool = False
