from abc import ABC, abstractmethod

from ..models import ScrapedFanfic


class BaseScraper(ABC):
    """Contract implemented by every external fanfic platform adapter."""

    def __init__(self) -> None:
        self.last_warning: str | None = None

    @abstractmethod
    def scrape(self, keyword: str, page: int = 1) -> list[ScrapedFanfic] | dict:
        """Search one platform and return normalized metadata records."""
        raise NotImplementedError
