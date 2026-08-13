import sys
import os

# 將專案根目錄加入 path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_fastapi_status():
    response = client.get("/fastapi-status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_fastapi_search_chinese_keywords():
    for kw in ["義忍", "义忍", "五夏", "胡蝶忍"]:
        response = client.post("/search", json={"keyword": kw, "platforms": ["ao3"], "page": 1})
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "source" in data
        assert "totalWorks" in data
        print(f"FastAPI search for '{kw}' returned {len(data['items'])} items, source: {data['source']}")
