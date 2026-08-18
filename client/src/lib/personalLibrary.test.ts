// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  CP_MAP_STORAGE_KEY,
  DEFAULT_CP_MAPPINGS,
  LEGACY_CP_MAP_STORAGE_KEY,
  activeBlacklistKeywords,
  bookmarksToCsv,
  bookmarksToMarkdown,
  clearSearchHistory,
  defaultBlacklistGroups,
  filterBookmarks,
  hydratePersonalLibrary,
  loadBlacklistGroups,
  loadCpMappings,
  loadCustomCpMappings,
  loadFilterPreset,
  loadExcludedKeywords,
  loadContentSafetySettings,
  loadPinnedQueries,
  loadSearchHistory,
  mergeImportedBookmarks,
  mergeCpMappings,
  parseBookmarkImport,
  parseFullPersonalBackup,
  persistCpMappings,
  persistExcludedKeywords,
  persistContentSafetySettings,
  persistFilterPreset,
  persistBookmarks,
  persistBlacklistGroups,
  persistPinnedQueries,
  recordSearch,
  serializeFullPersonalBackup,
  serializeBookmarksJson,
  sortBookmarks,
  togglePinnedQuery,
  upsertBookmark,
  upsertBlacklistGroup,
  upsertCpMapping,
  updateBookmarksBatch,
} from "./personalLibrary";
import type { SearchResult } from "./searchResults";

const result: SearchResult = {
  title: "義忍短篇",
  author: "測試作者",
  platform: "AO3",
  url: "https://archiveofourown.org/works/1",
  tags: "義忍",
  summary: "摘要",
  scraped_at: "2026-08-01T00:00:00Z",
};

describe("personal library local storage helpers", () => {
  beforeEach(() => window.localStorage.clear());

  it("creates and updates a bookmark using its canonical work URL", () => {
    const first = upsertBookmark([], { url: result.url, result, rating: 5, notes: "神作", tags: ["重讀"], shelf: "favorite" });
    const updated = upsertBookmark(first, { url: result.url, result, rating: 4, notes: "更新筆記", tags: ["收藏"], shelf: "to-read" });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ rating: 4, notes: "更新筆記", tags: ["收藏"], shelf: "to-read", url: result.url });
    expect(updated[0]?.savedAt).toBe(first[0]?.savedAt);
    expect(updated[0]?.progress).toEqual({ status: "unread", percent: 0, chapter: "" });
  });

  it("keeps reading progress, supports sorting, and updates selected cards in one batch", () => {
    const first = upsertBookmark([], { url: result.url, result: { ...result, author: "Beta Author", wordCount: "2,000" }, rating: 0, notes: "", tags: ["舊標籤"], shelf: "to-read", progress: { status: "reading", percent: 42, chapter: "第 8 章" } });
    const secondResult = { ...result, url: "https://archiveofourown.org/works/2", author: "Alpha Author", wordCount: "10,000" };
    const both = upsertBookmark(first, { url: secondResult.url, result: secondResult, rating: 0, notes: "", tags: [], shelf: "favorite", progress: { status: "finished", percent: 100 } });
    expect(both.find((bookmark) => bookmark.url === result.url)?.progress).toEqual({ status: "reading", percent: 42, chapter: "第 8 章" });
    expect(sortBookmarks(both, "author").map((bookmark) => bookmark.result.author)).toEqual(["Alpha Author", "Beta Author"]);
    expect(sortBookmarks(both, "words")[0]?.result.wordCount).toBe("10,000");
    const updated = updateBookmarksBatch(both, both.map((bookmark) => bookmark.url), { shelf: "favorite", tags: ["批次"], tagMode: "append" });
    expect(updated.every((bookmark) => bookmark.shelf === "favorite" && bookmark.tags.includes("批次"))).toBe(true);
  });

  it("merges custom CP overrides with defaults and migrates the legacy mapping key", () => {
    expect(loadCpMappings()).toEqual(DEFAULT_CP_MAPPINGS);
    window.localStorage.setItem(LEGACY_CP_MAP_STORAGE_KEY, JSON.stringify([{ alias: "黑邪", tag: "Heiyan/Wu Xie" }]));
    expect(loadCustomCpMappings()).toContainEqual({ alias: "黑邪", ao3Query: "Heiyan/Wu Xie", localQuery: "黑邪" });
    expect(window.localStorage.getItem(CP_MAP_STORAGE_KEY)).toContain("黑邪");

    const updated = upsertCpMapping(loadCustomCpMappings(), {
      alias: "義忍",
      ao3Query: "Tomioka Giyuu/Kochou Shinobu",
      localQuery: "義忍",
    });
    persistCpMappings(updated);
    expect(loadCpMappings()).toContainEqual({ alias: "義忍", ao3Query: "Tomioka Giyuu/Kochou Shinobu", localQuery: "義忍" });
    expect(mergeCpMappings([])).toEqual(DEFAULT_CP_MAPPINGS);
  });

  it("deduplicates search history and keeps the ten newest queries", () => {
    const history = ["花", "月", "雨", "風", "雪"];
    expect(recordSearch(history, "花")).toEqual(["花", "月", "雨", "風", "雪"]);
    expect(recordSearch(history, "星")).toEqual(["星", "花", "月", "雨", "風", "雪"]);
    expect(loadSearchHistory()).toEqual([]);
    window.localStorage.setItem("sui-read-search-history", JSON.stringify(history));
    clearSearchHistory();
    expect(loadSearchHistory()).toEqual([]);
  });

  it("validates and restores saved filter preferences", () => {
    persistFilterPreset({ wordCount: "long", completion: "complete", sort: "updated" });
    expect(loadFilterPreset()).toEqual({ wordCount: "long", completion: "complete", sort: "updated" });
  });

  it("filters bookshelf records and round-trips JSON import/export safely", () => {
    const saved = upsertBookmark([], { url: result.url, result, rating: 5, notes: "必收", tags: ["義忍", "神作"], shelf: "favorite" });
    expect(filterBookmarks(saved, "短篇", "all", "favorite", "")).toHaveLength(1);
    expect(filterBookmarks(saved, "", "Pixiv", "all", "")).toHaveLength(0);

    const json = serializeBookmarksJson(saved);
    const restored = parseBookmarkImport(json);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ url: result.url, shelf: "favorite" });
    expect(mergeImportedBookmarks(saved, restored)).toHaveLength(1);
    expect(bookmarksToMarkdown(saved)).toContain("義忍短篇");
    expect(bookmarksToCsv(saved)).toContain("title,author,platform");
  });

  it("persists CP pins and toggles a repeated query off", () => {
    const pinned = togglePinnedQuery([], "義忍");
    persistPinnedQueries(pinned);
    expect(loadPinnedQueries()).toEqual(["義忍"]);
    expect(togglePinnedQuery(pinned, "義忍")).toEqual([]);
  });

  it("normalizes and persists global exclusion keywords", () => {
    persistExcludedKeywords(["避雷角色, 甲/乙", "避雷角色", "  劇情雷點  "]);
    expect(loadExcludedKeywords()).toEqual(["避雷角色", "甲/乙", "劇情雷點"]);
  });

  it("groups blacklist keywords independently and only exposes active group terms", () => {
    const groups = upsertBlacklistGroup(defaultBlacklistGroups(), { name: "咒術專區", keywords: ["角色甲", "CP 乙"], enabled: true });
    const disabled = upsertBlacklistGroup(groups, { id: "sport", name: "排球專區", keywords: ["角色丙"], enabled: false });
    persistBlacklistGroups(disabled);
    expect(loadBlacklistGroups()).toHaveLength(2);
    expect(activeBlacklistKeywords(disabled)).toEqual(["角色甲", "CP 乙"]);
  });

  it("hydrates personal data from localStorage when the web preview has no Tauri runtime", async () => {
    const bookmarks = upsertBookmark([], { url: result.url, result, rating: 3, notes: "跨更新保留", tags: ["備份"], shelf: "to-read" });
    persistBookmarks(bookmarks);
    persistPinnedQueries(["義忍"]);
    persistExcludedKeywords(["避雷角色"]);
    persistContentSafetySettings({ ageConfirmation: "adult", blurRestrictedSummaries: false });

    const snapshot = await hydratePersonalLibrary();
    expect(snapshot.bookmarks).toHaveLength(1);
    expect(snapshot.pinnedQueries).toEqual(["義忍"]);
    expect(snapshot.excludedKeywords).toEqual(["避雷角色"]);
    expect(snapshot.contentSafetySettings).toEqual({ ageConfirmation: "adult", blurRestrictedSummaries: false });
  });

  it("serializes and restores the complete personal backup payload", () => {
    const bookmarks = upsertBookmark([], { url: result.url, result, rating: 3, notes: "完整備份", tags: ["備份"], shelf: "to-read", progress: { status: "reading", percent: 50, chapter: "第 5 章" } });
    const backup = serializeFullPersonalBackup({ bookmarks, customCpMappings: [], searchHistory: ["義忍"], pinnedQueries: ["義忍"], blacklistGroups: [{ id: "general", name: "通用避雷", keywords: ["雷點"], enabled: true }], filterPreset: { wordCount: "all", completion: "all", sort: "relevance" }, contentSafetySettings: { ageConfirmation: "adult", blurRestrictedSummaries: true } });
    const restored = parseFullPersonalBackup(backup);
    expect(restored?.bookmarks[0]?.progress).toMatchObject({ status: "reading", percent: 50 });
    expect(restored?.blacklistGroups[0]?.name).toBe("通用避雷");
    expect(restored?.pinnedQueries).toEqual(["義忍"]);
  });

  it("defaults to a protected age state and persists adult content preferences", () => {
    expect(loadContentSafetySettings()).toEqual({ ageConfirmation: "unknown", blurRestrictedSummaries: true });
    persistContentSafetySettings({ ageConfirmation: "adult", blurRestrictedSummaries: false });
    expect(loadContentSafetySettings()).toEqual({ ageConfirmation: "adult", blurRestrictedSummaries: false });
  });
});
