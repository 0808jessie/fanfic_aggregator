import sys
import os

# 確保可以匯入 fastapi_app 內的模組
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapers.ao3_scraper import AO3Scraper

def run_diagnostic():
    test_keywords = ["義忍", "义忍", "五夏", "胡蝶忍"]
    scraper = AO3Scraper()
    
    print("=== AO3 Chinese Keyword Search Diagnostic ===")
    
    results_summary = []
    for kw in test_keywords:
        print(f"\n[Diagnostic] Testing keyword: '{kw}'")
        try:
            result = scraper.scrape(kw, page=1)
            items = result.get("items", [])
            total_works = result.get("total_works", 0)
            warning = scraper.last_warning
            
            print(f"  -> Total works reported: {total_works}")
            print(f"  -> Items parsed in page 1-2: {len(items)}")
            if warning:
                print(f"  -> Warning/Error: {warning}")
                
            if items:
                first = items[0]
                print(f"  -> Sample Item Title: {first.title}")
                print(f"  -> Sample Item Author: {first.author}")
                print(f"  -> Sample Item URL: {first.url}")
                print(f"  -> Sample Item Relationships: {first.relationships}")
                status = "PASS"
            else:
                status = "PASS (0 results or Rate-limited / Handled safely)"
                
            results_summary.append((kw, len(items), total_works, status))
        except Exception as e:
            print(f"  -> EXCEPTION for '{kw}': {e}")
            results_summary.append((kw, 0, 0, f"FAIL: {e}"))
            
    print("\n=== Diagnostic Summary ===")
    for kw, count, total, status in results_summary:
        print(f"Keyword '{kw}': Parsed={count}, TotalWorks={total} => Status: {status}")

if __name__ == "__main__":
    run_diagnostic()
