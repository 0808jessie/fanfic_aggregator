import json
import sys
import requests

BASE_URL = "http://localhost:8000/search"
KEYWORD = "月光"


def run(page: int) -> dict:
    response = requests.post(
        BASE_URL,
        json={"keyword": KEYWORD, "platforms": ["ao3"], "page": page},
        timeout=50,
    )
    response.raise_for_status()
    payload = response.json()
    print(json.dumps({
        "page": payload.get("page"),
        "item_count": len(payload.get("items", [])),
        "totalWorks": payload.get("totalWorks"),
        "totalPages": payload.get("totalPages"),
        "loadedThroughPage": payload.get("loadedThroughPage"),
        "nextPage": payload.get("nextPage"),
        "hasMore": payload.get("hasMore"),
        "source": payload.get("source"),
        "warning": payload.get("warning"),
    }, ensure_ascii=False))
    return payload


if __name__ == "__main__":
    first = run(1)
    if first.get("source") == "none":
        sys.exit("page=1 did not return verified results")
    if first.get("page") != 1:
        sys.exit("page=1 response metadata is incorrect")
    if first.get("totalPages", 0) < 1:
        sys.exit("totalPages was not parsed")
    if first.get("hasMore") and first.get("nextPage") != 3:
        sys.exit("initial response should continue at page 3 after loading pages 1 and 2")

    if first.get("hasMore"):
        later = run(first["nextPage"])
        if later.get("page") != first["nextPage"]:
            sys.exit("Load More response page metadata is incorrect")
        if not later.get("items"):
            sys.exit("Load More returned no verified items")

    cached = run(1)
    if cached.get("source") != "cache":
        sys.exit("repeated page=1 request did not hit memory cache")
    if cached.get("totalWorks") != first.get("totalWorks"):
        sys.exit("memory cache lost totalWorks metadata")
