import { describe, expect, it } from "vitest";
import { appendUniqueResults, countLanguageResults, extractIsRateLimited, extractPlatformStatuses, extractSearchPagination, extractSearchWarning, filterAndSortResults, formatSourceLoadProgress, getLoadMoreLabel, isDisplayableResult, isPlatformRetryable, isRestrictedResult, matchesExcludedKeyword, normalizeResults, parseWordCount } from "./searchResults";

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

  it("distinguishes an AO3 official total from the first page of loaded cards", () => {
    expect(formatSourceLoadProgress(20, 29806, 1, 1491)).toBe("已載入第 1 頁 20 篇／共 29,806 筆");
    expect(formatSourceLoadProgress(20, 0, 1, 1)).toBe("已載入 20 篇");
    expect(formatSourceLoadProgress(22, 4, 1, 1)).toBe("已載入第 1 頁 22 篇／共 22 筆");
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

  it("infers traditional, simplified, Japanese, and English from loaded work text when source metadata is absent", () => {
    const traditional = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/46", title: "這個故事與你有關", language: null };
    const simplified = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/47", title: "这个故事与你有关", language: null };
    const japanese = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/48", title: "ふたりの物語", language: null };
    const english = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/49", title: "A quiet winter story", language: null };
    const base = { wordCount: "all" as const, completion: "all" as const, sort: "relevance" as const };

    expect(filterAndSortResults([traditional, simplified, japanese, english], "story", { ...base, language: "zh-hant" })).toEqual([traditional]);
    expect(filterAndSortResults([traditional, simplified, japanese, english], "story", { ...base, language: "zh-hans" })).toEqual([simplified]);
    expect(filterAndSortResults([traditional, simplified, japanese, english], "story", { ...base, language: "ja" })).toEqual([japanese]);
    expect(filterAndSortResults([traditional, simplified, japanese, english], "story", { ...base, language: "en" })).toEqual([english]);
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

  it("excludes a work locally when a blacklist keyword matches any visible work metadata", () => {
    const safe = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/81", title: "純愛短篇", tags: "治癒, 原作向" };
    const blockedByCharacter = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/82", characters: ["避雷角色"], title: "角色劇情" };
    const blockedByRelationship = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/83", relationships: ["甲/乙"], title: "配對劇情" };
    const filters = { wordCount: "all" as const, completion: "all" as const, sort: "relevance" as const, excludedKeywords: ["避雷角色", "甲/乙"] };

    expect(matchesExcludedKeyword(blockedByCharacter, ["避雷角色"])).toBe(true);
    expect(matchesExcludedKeyword(blockedByRelationship, ["甲/乙"])).toBe(true);
    expect(filterAndSortResults([safe, blockedByCharacter, blockedByRelationship], "劇情", filters)).toEqual([safe]);
  });

  it("recognizes source rating and tag markers, then filters R18 results locally", () => {
    const general = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/91", rating: "General Audiences" };
    const explicit = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/92", rating: "Explicit" };
    const pixivR18 = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/93", tags: "Original, R-18" };
    const base = { wordCount: "all" as const, completion: "all" as const, sort: "relevance" as const };

    expect(isRestrictedResult(explicit)).toBe(true);
    expect(isRestrictedResult(pixivR18)).toBe(true);
    expect(filterAndSortResults([general, explicit, pixivR18], "work", { ...base, rating: "safe" })).toEqual([general]);
    expect(filterAndSortResults([general, explicit, pixivR18], "work", { ...base, rating: "r18" })).toEqual([explicit, pixivR18]);
  });

  it("treats NSFW, NC-17, and adult text markers as R18 in the local filter pipeline", () => {
    const nsfw = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/94", tags: "NSFW, romance" };
    const nc17 = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/95", rating: "NC-17" };
    const adultSummary = { ...verifiedAo3Result, url: "https://archiveofourown.org/works/96", summary: "僅限成人閱讀的內容" };

    expect(isRestrictedResult(nsfw)).toBe(true);
    expect(isRestrictedResult(nc17)).toBe(true);
    expect(isRestrictedResult(adultSummary)).toBe(true);
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
