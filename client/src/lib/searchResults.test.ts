import { describe, expect, it } from "vitest";
import { appendUniqueResults, countLanguageResults, extractIsRateLimited, extractPlatformStatuses, extractSearchPagination, extractSearchWarning, filterAndSortResults, getLoadMoreLabel, isDisplayableResult, isPlatformRetryable, normalizeResults, parseWordCount } from "./searchResults";

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

  it("extracts verified platform statuses and limits retry to failed sources", () => {
    const statuses = extractPlatformStatuses({
      platformStatuses: [
        { platformId: "ao3", label: "AO3", status: "success", itemCount: 40, translatedQuery: '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"' },
        { platformId: "waterwriter", label: "在水裡寫字", status: "cooldown", itemCount: 0, warning: "20 秒冷卻", translatedQuery: "義忍 富岡義勇 胡蝶忍" },
        { platformId: "invalid", label: "Invalid", status: "unknown", itemCount: 0, translatedQuery: "x" },
      ],
    });

    expect(statuses).toHaveLength(2);
    expect(statuses[0].itemCount).toBe(40);
    expect(isPlatformRetryable(statuses[0])).toBe(false);
    expect(isPlatformRetryable(statuses[1])).toBe(true);
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

  it("accepts a verified 同人誌中心 work URL while preserving source validation", () => {
    expect(isDisplayableResult({
      ...verifiedAo3Result,
      platform: "同人誌中心",
      url: "https://www.doujin.com.tw/books/info/70859",
      coverUrl: "https://cdn.doujin.com.tw/books/cover.webp",
    })).toBe(true);
  });

  it("保留 pixiv.net 的合法作品，並將 tags 陣列轉為卡片可渲染字串", () => {
    const items = normalizeResults({
      items: [{
        id: "pixiv:123",
        title: "鬼滅之刃：雪夜短篇",
        author: "測試作者",
        url: "https://www.pixiv.net/novel/show.php?id=123",
        summary: "公開摘要",
        platform: "pixiv",
        source: "pixiv",
        tags: ["鬼滅之刃", "義忍"],
        updated_at: "2026-08-16T00:00:00+00:00",
      }],
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      platform: "pixiv",
      source: "pixiv",
      tags: "鬼滅之刃, 義忍",
      updatedAt: "2026-08-16T00:00:00+00:00",
    });
  });

  it("sorts local results by backend relevance before update date and word count", () => {
    const lowerScore = { ...verifiedAo3Result, title: "義忍標題", url: "https://archiveofourown.org/works/2", relevanceScore: 50, wordCount: "20,000" };
    const higherScore = { ...verifiedAo3Result, title: "關係標籤命中", url: "https://archiveofourown.org/works/3", relevanceScore: 100, wordCount: "1,000" };
    const sorted = filterAndSortResults([lowerScore, higherScore], "義忍", { wordCount: "all", completion: "all", sort: "relevance" });
    expect(sorted.map((item) => item.url)).toEqual([higherScore.url, lowerScore.url]);
  });

  it("filters completed medium-length works without re-querying the API", () => {
    const completeMedium = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/4", wordCount: "5,000", isComplete: true, relevanceScore: 100 };
    const ongoingLong = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/5", wordCount: "15,000", isComplete: false, relevanceScore: 90 };
    const filtered = filterAndSortResults([completeMedium, ongoingLong], "花", { wordCount: "medium", completion: "complete", sort: "relevance" });
    expect(filtered).toEqual([completeMedium]);
    expect(parseWordCount("12,345")).toBe(12345);
  });

  it("filters loaded results locally by Chinese variants and Japanese without an API request", () => {
    const traditional = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/41", title: "這是繁體作品", language: "中文（繁體）" };
    const simplified = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/42", title: "这是简体作品", language: "中文（简体）" };
    const japanese = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/43", title: "日本語の作品", language: "日本語" };
    const baseFilters = { wordCount: "all" as const, completion: "all" as const, sort: "relevance" as const };

    expect(filterAndSortResults([traditional, simplified, japanese], "作品", { ...baseFilters, language: "zh-hant" })).toEqual([traditional]);
    expect(filterAndSortResults([traditional, simplified, japanese], "作品", { ...baseFilters, language: "zh-hans" })).toEqual([simplified]);
    expect(filterAndSortResults([traditional, simplified, japanese], "作品", { ...baseFilters, language: "ja" })).toEqual([japanese]);
  });

  it("keeps explicitly unknown-language works in all results but out of language-specific filters", () => {
    const unknown = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/44", language: "unknown" };
    const traditional = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/45", language: "zh-TW" };
    const baseFilters = { wordCount: "all" as const, completion: "all" as const, sort: "relevance" as const };

    expect(filterAndSortResults([unknown, traditional], "work", { ...baseFilters, language: "all" })).toHaveLength(2);
    expect(filterAndSortResults([unknown, traditional], "work", { ...baseFilters, language: "zh" })).toEqual([traditional]);
    expect(countLanguageResults([unknown, traditional], "all")).toBe(2);
    expect(countLanguageResults([unknown, traditional], "zh-hant")).toBe(1);
  });

  it("sorts filtered results by newest update or highest word count locally", () => {
    const olderLong = {
      ...verifiedAo3Result,
      url: "https://archiveofourown.org/works/6",
      wordCount: "20,000",
      isComplete: false,
      updatedAt: "2024-01-01",
    };
    const newerMedium = {
      ...verifiedAo3Result,
      url: "https://archiveofourown.org/works/7",
      wordCount: "5,000",
      isComplete: true,
      updatedAt: "2024-06-01",
    };
    const newestShort = {
      ...verifiedAo3Result,
      url: "https://archiveofourown.org/works/8",
      wordCount: "500",
      isComplete: true,
      updatedAt: "2024-08-01",
    };

    const newestComplete = filterAndSortResults(
      [olderLong, newerMedium, newestShort],
      "花",
      { wordCount: "all", completion: "complete", sort: "updated" },
    );
    const longestFirst = filterAndSortResults(
      [olderLong, newerMedium, newestShort],
      "花",
      { wordCount: "all", completion: "all", sort: "words" },
    );

    expect(newestComplete.map((item) => item.url)).toEqual([newestShort.url, newerMedium.url]);
    expect(longestFirst.map((item) => item.url)).toEqual([olderLong.url, newerMedium.url, newestShort.url]);
  });
});
