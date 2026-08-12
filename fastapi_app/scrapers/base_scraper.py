from abc import ABC, abstractmethod

from ..models import ScrapedFanfic


class BaseScraper(ABC):
    """Contract implemented by every external fanfic platform adapter."""

    @abstractmethod
    def scrape(self, keyword: str) -> list[ScrapedFanfic]:
        """Search one platform and return normalized metadata records."""
        raise NotImplementedError
