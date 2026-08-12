import { describe, expect, it } from "vitest";
import { appendUniqueResults, extractIsRateLimited, extractSearchPagination, extractSearchWarning, getLoadMoreLabel, isDisplayableResult, normalizeResults } from "./searchResults";

const verifiedAo3Result = {
  title: "Verified work",
  author: "Author",
  platform: "AO3",
  url: "https://archiveofourown.org/works/123",
  tags: "tag",
  summary: "summary",
  scraped_at: "2026-08-12T00:00:00Z",
};

describe("search result safety contract", () => {
  it("normalizes the FastAPI envelope and preserves the warning", () => {
    const payload = {
      items: [verifiedAo3Result],
      source: "none",
      warning: "未取得可驗證作品",
    };

    expect(normalizeResults(payload)).toEqual([verifiedAo3Result]);
    expect(extractSearchWarning(payload)).toBe("未取得可驗證作品");
  });

  it("preserves an explicit empty-result diagnostic envelope and rate limit flags", () => {
    const payload = {
      items: [],
      source: "none",
      warning: "AO3 伺服器目前流量較高或觸發防護（HTTP 403/429/525），伺服器稍微休息中，請於 10 秒後再搜尋。",
      success: false,
      isRateLimited: true,
    };

    expect(normalizeResults(payload)).toEqual([]);
    expect(extractSearchWarning(payload)).toContain("伺服器稍微休息中");
    expect(extractIsRateLimited(payload)).toBe(true);
  });

  it("extracts pagination metadata for the initial two-page response", () => {
    expect(extractSearchPagination({
      totalWorks: 3500,
      totalPages: 175,
      page: 1,
      loadedThroughPage: 2,
      nextPage: 3,
      hasMore: true,
    })).toEqual({
      totalWorks: 3500,
      totalPages: 175,
      page: 1,
      loadedThroughPage: 2,
      nextPage: 3,
      hasMore: true,
    });
  });

  it("disables Load More at the final page", () => {
    expect(extractSearchPagination({
      totalWorks: 20,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
    }).hasMore).toBe(false);
  });

  it("appends Load More results without duplicating URLs", () => {
    const secondPage = { ...verifiedAo3Result, title: "Second page", url: "https://archiveofourown.org/works/2" };
    expect(appendUniqueResults([verifiedAo3Result], [verifiedAo3Result, secondPage])).toEqual([verifiedAo3Result, secondPage]);
  });

  it("returns the translated loading label while Load More is pending", () => {
    expect(getLoadMoreLabel(true, 3)).toBe("正在翻頁載入中...");
    expect(getLoadMoreLabel(false, 3)).toBe("LOAD MORE / PAGE 3");
    expect(getLoadMoreLabel(false, null)).toBe("NO MORE WORKS");
  });

  it("rejects Example Domain placeholder records", () => {
    expect(
      isDisplayableResult({
        ...verifiedAo3Result,
        url: "https://example.com/fallback/ao3/123",
      }),
    ).toBe(false);
    expect(normalizeResults({ items: [{ ...verifiedAo3Result, url: "https://example.com/fallback" }] })).toEqual([]);
  });

  it("rejects a URL from the wrong platform", () => {
    expect(
      isDisplayableResult({
        ...verifiedAo3Result,
        url: "https://www.lofter.com/post/123",
      }),
    ).toBe(false);
  });
});
