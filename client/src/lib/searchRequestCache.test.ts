import { afterEach, describe, expect, it } from "vitest";
import {
  LatestSearchRequestGate,
  SEARCH_CACHE_TTL_MS,
  clearSearchRequestCache,
  createSearchCacheKey,
  readSearchRequestCache,
  writeSearchRequestCache,
} from "./searchRequestCache";

afterEach(() => clearSearchRequestCache());

describe("browser-local search request protection", () => {
  it("reuses the same query, mode, page, and platform set for fifteen minutes regardless of platform order", () => {
    const firstKey = createSearchCacheKey({ keyword: " 義忍 ", mode: "keyword", platforms: ["pixiv", "ao3"], page: 1, customCpMappings: [] });
    const reorderedKey = createSearchCacheKey({ keyword: "義忍", mode: "keyword", platforms: ["ao3", "pixiv"], page: 1, customCpMappings: [] });
    const payload = { items: [{ title: "快取作品" }], success: true };

    writeSearchRequestCache(firstKey, payload, 1_000);
    expect(reorderedKey).toBe(firstKey);
    expect(readSearchRequestCache(reorderedKey, 1_000 + SEARCH_CACHE_TTL_MS - 1)).toEqual(payload);
    expect(readSearchRequestCache(reorderedKey, 1_000 + SEARCH_CACHE_TTL_MS)).toBeNull();
  });

  it("does not cache a globally failed or malformed search envelope", () => {
    const key = createSearchCacheKey({ keyword: "義忍", platforms: ["ao3"] });
    writeSearchRequestCache(key, { items: [], success: false }, 1_000);
    writeSearchRequestCache(key, { warning: "malformed" }, 1_000);

    expect(readSearchRequestCache(key, 1_001)).toBeNull();
  });

  it("allows only the latest user request to apply a response", () => {
    const gate = new LatestSearchRequestGate();
    const firstRequest = gate.begin();
    const secondRequest = gate.begin();

    expect(gate.isCurrent(firstRequest)).toBe(false);
    expect(gate.isCurrent(secondRequest)).toBe(true);
  });
});
