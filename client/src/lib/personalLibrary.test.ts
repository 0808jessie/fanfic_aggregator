// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_CP_MAPPINGS,
  loadCpMappings,
  loadFilterPreset,
  loadSearchHistory,
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
});
