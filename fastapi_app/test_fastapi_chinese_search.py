import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_package_style_import():
    # 測試是否能以 package 絕對路徑匯入
    try:
        sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        import fastapi_app
        from fastapi_app import main as fa_main
        assert fastapi_app is not None
        assert fa_main.app is not None
    except ImportError as e:
        assert False, f"Package-style import failed: {e}"


def test_fastapi_status():
    response = client.get("/fastapi-status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_fastapi_search_chinese_keywords_contract():
    for kw in ["義忍", "义忍", "五夏", "胡蝶忍"]:
        response = client.post("/search", json={"keyword": kw, "platforms": ["ao3"], "page": 1})
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "source" in data
        assert "totalWorks" in data
        
        items = data["items"]
        assert len(items) > 0, f"Expected non-empty items for Chinese keyword '{kw}', got 0 items. Warning: {data.get('warning')}"
        
        first = items[0]
        assert first["title"] is not None
        assert first["author"] is not None
        assert first["url"].startswith("https://archiveofourown.org")
        print(f"Verified Chinese search for '{kw}': {len(items)} items, top title: {first['title']}")
