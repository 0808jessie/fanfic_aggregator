from playwright.sync_api import sync_playwright

PREVIEW_URL = "https://3000-i2xu849oqaj1l1lqbvkk0-124dc49c.sg1.manus.computer"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(PREVIEW_URL, wait_until="domcontentloaded", timeout=30000)
    page.get_by_label("搜尋同人作品").fill("月光")
    page.get_by_role("button", name="RUN SEARCH").click()
    page.get_by_text("10,480 STORIES FOUND", exact=True).wait_for(timeout=45000)

    loaded_pattern = r"text=/\d+ LOADED \/ 10,480 TOTAL WORKS/"
    initial_loaded = page.locator(loaded_pattern).first.inner_text()
    if "LOADED" not in initial_loaded:
        raise AssertionError(f"Initial loaded counter missing: {initial_loaded}")

    page.get_by_role("button", name="LOAD MORE / PAGE 3").click()
    page.get_by_text("LOADED THROUGH PAGE 3 / 524", exact=True).wait_for(timeout=45000)
    updated_loaded = page.locator(loaded_pattern).first.inner_text()
    if updated_loaded == initial_loaded:
        raise AssertionError("Load More did not append new results")

    print({
        "total_text": page.get_by_text("10,480 STORIES FOUND", exact=True).inner_text(),
        "initial_loaded": initial_loaded,
        "updated_loaded": updated_loaded,
        "page_marker": page.get_by_text("LOADED THROUGH PAGE 3 / 524", exact=True).inner_text(),
    })
    browser.close()
