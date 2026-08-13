"""One-off, read-only diagnostic for Penana public detail-page metadata.

Run from fastapi_app with:
    python3 -m scripts.inspect_penana_detail
"""

from playwright.sync_api import sync_playwright


def main() -> None:
    url = "https://www.penana.com/story/95912"
    selector = 'span[title="Word Count"] .bkwords'
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/123 Safari/537.36",
            locale="zh-TW",
            viewport={"width": 1280, "height": 900},
        )
        page = context.new_page()
        response = page.goto(url, timeout=20000, wait_until="domcontentloaded")
        try:
            page.wait_for_selector(selector, timeout=10000)
        except Exception:
            pass
        locator = page.locator(selector).first
        print({
            "status": response.status if response else None,
            "url": page.url,
            "title": page.title(),
            "wordCountMatches": locator.count(),
            "wordCount": locator.inner_text() if locator.count() else None,
            "containsWordCount": "Word Count" in page.content(),
        })
        context.close()
        browser.close()


if __name__ == "__main__":
    main()
