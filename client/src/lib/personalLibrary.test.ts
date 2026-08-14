// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  collectBookmarkTags,
  createBookmarkBackup,
  createBookmarkImportPreview,
  DEFAULT_CP_MAPPINGS,
  filterAndSortBookmarks,
  filterBookmarks,
  loadCpMappings,
  loadFilterPreset,
  loadSearchHistory,
  mergeImportedBookmarks,
  mergeNewBookmarks,
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
    expect(loadCpMappings()).toContainEqual(expect.objectContaining({ alias: "黑邪", tag: "Heiyan/ Wu Xie", ao3Query: "Heiyan/ Wu Xie", localQuery: "黑邪", source: "custom" }));
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

  it("searches notes, tags, titles and authors then sorts reading cards by saved time or rating", () => {
    const first = upsertBookmark([], { url: result.url, result, rating: 2, notes: "雨夜重讀筆記", tags: ["待讀"] });
    const secondResult = { ...result, url: "https://www.penana.com/story/9", platform: "Penana", title: "星夜長篇", author: "另一位作者" } as SearchResult;
    const bookmarks = [
      { ...first[0]!, savedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ...upsertBookmark([], { url: secondResult.url, result: secondResult, rating: 5, notes: "神作推薦", tags: ["神作"] }).map((bookmark) => ({ ...bookmark, savedAt: "2026-02-01T00:00:00.000Z", updatedAt: "2026-02-01T00:00:00.000Z" })),
    ];

    expect(filterAndSortBookmarks(bookmarks, { query: "義忍短篇", tag: null, rating: null, sort: "saved_desc" })).toMatchObject([{ url: result.url }]);
    expect(filterAndSortBookmarks(bookmarks, { query: "另一位", tag: null, rating: null, sort: "saved_desc" })).toMatchObject([{ url: secondResult.url }]);
    expect(filterAndSortBookmarks(bookmarks, { query: "雨夜", tag: null, rating: null, sort: "saved_desc" })).toMatchObject([{ url: result.url }]);
    expect(filterAndSortBookmarks(bookmarks, { query: "神作", tag: null, rating: null, sort: "saved_desc" })).toMatchObject([{ url: secondResult.url }]);
    expect(filterAndSortBookmarks(bookmarks, { query: "", tag: null, rating: null, sort: "rating_desc" }).map((bookmark) => bookmark.rating)).toEqual([5, 2]);
    expect(filterAndSortBookmarks(bookmarks, { query: "", tag: null, rating: null, sort: "rating_asc" }).map((bookmark) => bookmark.rating)).toEqual([2, 5]);
    expect(filterAndSortBookmarks(bookmarks, { query: "", tag: null, rating: null, sort: "saved_asc" }).map((bookmark) => bookmark.url)).toEqual([result.url, secondResult.url]);
  });

  it("previews validated imports and merges only records that are not already saved", () => {
    const current = upsertBookmark([], { url: result.url, result, rating: 2, notes: "保留既有筆記", tags: ["待讀"] });
    const newResult = { ...result, url: "https://www.penana.com/story/11", platform: "Penana", title: "備份新增作品" } as SearchResult;
    const imported = [
      { ...current[0]!, rating: 5, notes: "不得覆寫" },
      ...upsertBookmark([], { url: newResult.url, result: newResult, rating: 4, notes: "備份筆記", tags: ["神作"] }),
    ];
    const preview = createBookmarkImportPreview(imported);
    const merged = mergeNewBookmarks(current, imported);

    expect(preview).toMatchObject({ tagCount: 2 });
    expect(preview.sample).toHaveLength(2);
    expect(merged).toHaveLength(2);
    expect(merged.find((bookmark) => bookmark.url === result.url)).toMatchObject({ rating: 2, notes: "保留既有筆記" });
  });
});
