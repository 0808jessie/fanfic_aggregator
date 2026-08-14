// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  collectBookmarkTags,
  createBookmarkBackup,
  DEFAULT_CP_MAPPINGS,
  filterBookmarks,
  loadCpMappings,
  loadFilterPreset,
  loadSearchHistory,
  mergeImportedBookmarks,
  parseBookmarkBackup,
  persistCpMappings,
  persistFilterPreset,
  recordSearch,
  upsertBookmark,
  upsertCpMapping,
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
    const first = upsertBookmark([], { url: result.url, result, rating: 5, notes: "神作", tags: ["重讀"] });
    const updated = upsertBookmark(first, { url: result.url, result, rating: 4, notes: "更新筆記", tags: ["收藏"] });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ rating: 4, notes: "更新筆記", tags: ["收藏"], url: result.url });
    expect(updated[0]?.savedAt).toBe(first[0]?.savedAt);
  });

  it("uses default CP mappings until a local mapping collection is saved", () => {
    expect(loadCpMappings()).toEqual(DEFAULT_CP_MAPPINGS);
    const updated = upsertCpMapping(DEFAULT_CP_MAPPINGS, { alias: "黑邪", tag: "Heiyan/ Wu Xie" });
    persistCpMappings(updated);
    expect(loadCpMappings()).toContainEqual({ alias: "黑邪", tag: "Heiyan/ Wu Xie" });
  });

  it("deduplicates search history and keeps only the five newest queries", () => {
    const history = ["花", "月", "雨", "風", "雪"];
    expect(recordSearch(history, "花")).toEqual(["花", "月", "雨", "風", "雪"]);
    expect(recordSearch(history, "星")).toEqual(["星", "花", "月", "雨", "風"]);
    expect(loadSearchHistory()).toEqual([]);
  });

  it("validates and restores saved filter preferences", () => {
    persistFilterPreset({ wordCount: "long", completion: "complete", sort: "updated" });
    expect(loadFilterPreset()).toEqual({ wordCount: "long", completion: "complete", sort: "updated" });
  });

  it("filters reading cards by user tag and exact star rating", () => {
    const ao3 = upsertBookmark([], { url: result.url, result, rating: 5, notes: "神作", tags: ["神作", "重讀"] });
    const penanaResult = { ...result, platform: "Penana", url: "https://www.penana.com/story/2", title: "另一篇" } as SearchResult;
    const bookmarks = upsertBookmark(ao3, { url: penanaResult.url, result: penanaResult, rating: 3, notes: "", tags: ["待讀"] });

    expect(collectBookmarkTags(bookmarks)).toEqual(["待讀", "重讀", "神作"]);
    expect(filterBookmarks(bookmarks, "神作", null)).toHaveLength(1);
    expect(filterBookmarks(bookmarks, null, 3)).toMatchObject([{ url: penanaResult.url }]);
    expect(filterBookmarks(bookmarks, "待讀", 5)).toEqual([]);
  });

  it("round-trips validated JSON backups and merges newer reading cards by URL", () => {
    const current = upsertBookmark([], { url: result.url, result, rating: 2, notes: "舊筆記", tags: ["待讀"] });
    const imported = [{ ...current[0]!, rating: 5, notes: "新筆記", updatedAt: "2030-01-01T00:00:00.000Z" }];
    const backup = createBookmarkBackup(imported);
    const parsed = parseBookmarkBackup(JSON.stringify(backup));
    const merged = mergeImportedBookmarks(current, parsed);

    expect(backup.version).toBe(1);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ rating: 5, notes: "新筆記" });
    expect(() => parseBookmarkBackup('{"bookmarks":[{"url":"https://example.com"}]}')).toThrow("備份檔沒有可匯入");
  });
});
