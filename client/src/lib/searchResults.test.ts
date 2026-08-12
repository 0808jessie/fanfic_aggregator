import { describe, expect, it } from "vitest";
import { extractSearchWarning, isDisplayableResult, normalizeResults } from "./searchResults";

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

  it("preserves an explicit empty-result diagnostic envelope", () => {
    const payload = {
      items: [],
      source: "none",
      warning: "未從 AO3, LOFTER 取得可驗證作品",
    };

    expect(normalizeResults(payload)).toEqual([]);
    expect(extractSearchWarning(payload)).toContain("未從 AO3");
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
