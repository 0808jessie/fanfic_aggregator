from __future__ import annotations
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.ao3_scraper import AO3Scraper
from fastapi.testclient import TestClient
from main import app

def diagnose():
    print("=== 深度診斷：「義忍」與其他 CP 搜尋對比 ===")
    scraper = AO3Scraper()
    
    for kw in ["義忍", "义忍", "五夏"]:
        print(f"\n--- Testing Scraper for '{kw}' ---")
        res = scraper.scrape(kw, page=1)
        items = res.get("items", [])
        print(f"Scraper returned {len(items)} items, total_works={res.get('total_works')}")
        if items:
            print(f"Top 3 titles for '{kw}':")
            for item in items[:3]:
                print(f"  - {item.title} by {item.author} ({item.url})")
        else:
            print(f"WARNING: Scraper returned 0 items for '{kw}'! Warning: {scraper.last_warning}")

    client = TestClient(app)
    for kw in ["義忍", "义忍"]:
        print(f"\n--- Testing FastAPI /search for '{kw}' ---")
        response = client.post("/search", json={"keyword": kw, "platforms": ["ao3"], "page": 1})
        print(f"HTTP Status: {response.status_code}")
        data = response.json()
        print(f"API Source: {data.get('source')}, TotalWorks: {data.get('totalWorks')}, Items count: {len(data.get('items', []))}")
        if data.get("warning"):
            print(f"API Warning: {data.get('warning')}")

if __name__ == "__main__":
    diagnose()
