import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.ao3_scraper import AO3Scraper
from constants.cp_tags import CP_TAG_MAP

def diagnose_trad_simp():
    print("=== 繁體「義忍」與簡體「义忍」搜尋診斷 ===")
    print("CP_TAG_MAP entry for 義忍:", CP_TAG_MAP.get("義忍"))
    print("CP_TAG_MAP entry for 义忍:", CP_TAG_MAP.get("义忍"))
    
    scraper = AO3Scraper()
    
    for kw in ["義忍", "义忍"]:
        print(f"\n--- Testing keyword: '{kw}' (repr: {repr(kw)}) ---")
        res = scraper.scrape(kw, page=1)
        items = res.get("items", [])
        print(f"Result count: {len(items)}, total_works: {res.get('total_works')}")
        if items:
            print("First item title:", items[0].title)
            print("First item URL:", items[0].url)
        else:
            print("No items found! Last warning:", scraper.last_warning)

if __name__ == "__main__":
    diagnose_trad_simp()
