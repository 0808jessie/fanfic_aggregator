from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import ScrapedFanfic


class BaseScraper(ABC, object):
    def __init__(self):
        self.last_warning: Optional[str] = None

    @abstractmethod
    def scrape(self, keyword: str, page: int = 1, force_refresh: bool = False) -> dict[str, Any]:
        """
        Scrape fanfics from the platform.
        Returns a dict containing:
        - items: list[ScrapedFanfic]
        - total_works: int
        - total_pages: int
        """
        pass
