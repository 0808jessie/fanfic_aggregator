import sys
import os
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from main import app
from models import ScrapedFanfic

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


def test_cloudflare_pages_or_tauri_can_preflight_public_api():
    response = client.options(
        "/search",
        headers={
            "Origin": "tauri://localhost",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"


def test_fastapi_search_chinese_keywords_contract():
    """Keep the route contract deterministic; live AO3 availability is verified separately."""
    for index, kw in enumerate(["義忍", "义忍", "五夏", "胡蝶忍"], start=1):
        fixture = ScrapedFanfic(
            id=f"ao3:contract-{index}",
            title=f"{kw} 搜尋契約作品",
            author="AO3 測試作者",
            platform="AO3",
            url=f"https://archiveofourown.org/works/contract-{index}",
            tags=kw,
            summary=f"驗證 {kw} 的 UTF-8 API 回傳契約。",
            rating="Explicit" if index == 1 else "General Audiences",
            keyword=kw,
        )
        aggregate = {"items": [fixture], "any_success": True, "total_works": 1, "total_pages": 1, "warnings": []}
        with patch("main.parallel_search_platforms", return_value=aggregate) as search, patch("main.save_fanfic_to_db"):
            response = client.post("/search", json={"keyword": kw, "platforms": ["ao3"], "page": 1, "forceRefresh": True})

        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "source" in data
        assert "totalWorks" in data
        assert data["source"] == "live"
        assert search.call_args.args[:3] == (["ao3"], kw, 1)

        items = data["items"]
        assert len(items) == 1
        first = items[0]
        assert first["title"] == f"{kw} 搜尋契約作品"
        assert first["author"] == "AO3 測試作者"
        assert first["url"].startswith("https://archiveofourown.org")
        assert first["rating"] == ("Explicit" if index == 1 else "General Audiences")


def test_invalid_language_filter_degrades_to_all_languages():
    fixture = ScrapedFanfic(
        id="ao3:language-contract",
        title="語言容錯作品",
        author="AO3 測試作者",
        platform="AO3",
        url="https://archiveofourown.org/works/language-contract",
        tags="測試",
        summary="不支援的語言值不應讓搜尋端點回傳 500。",
        keyword="測試",
    )
    aggregate = {"items": [fixture], "any_success": True, "total_works": 1, "total_pages": 1, "warnings": []}
    with patch("main.parallel_search_platforms", return_value=aggregate) as search, patch("main.save_fanfic_to_db"):
        response = client.post("/search", json={"keyword": "測試", "platforms": ["ao3"], "language": "unexpected-value"})

    assert response.status_code == 200
    assert response.json()["items"][0]["title"] == "語言容錯作品"
    assert "language" not in search.call_args.kwargs


def test_language_is_not_forwarded_to_backend_platform_search():
    aggregate = {"items": [], "any_success": True, "total_works": 0, "total_pages": 1, "warnings": []}
    with patch("main.parallel_search_platforms", return_value=aggregate) as search:
        response = client.post("/search", json={"keyword": "全量", "platforms": ["ao3"], "language": "ja"})

    assert response.status_code == 200
    assert "language" not in search.call_args.kwargs
