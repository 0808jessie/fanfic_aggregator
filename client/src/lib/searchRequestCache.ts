export const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;

type SearchCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

const searchCache = new Map<string, SearchCacheEntry>();

function normalizePlatformList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).sort();
}

/**
 * Stable request identity for browser-local results only. It intentionally
 * excludes forceRefresh: forced retries always bypass the cache.
 */
export function createSearchCacheKey(data: Record<string, unknown>): string {
  return JSON.stringify({
    keyword: typeof data.keyword === "string" ? data.keyword.trim().toLocaleLowerCase() : "",
    mode: data.mode === "author" ? "author" : "keyword",
    platforms: normalizePlatformList(data.platforms),
    page: typeof data.page === "number" ? data.page : 1,
    customCpMappings: Array.isArray(data.customCpMappings) ? data.customCpMappings : [],
  });
}

export function readSearchRequestCache<T>(key: string, now = Date.now()): T | null {
  const entry = searchCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    searchCache.delete(key);
    return null;
  }
  return entry.payload as T;
}

export function isCacheableSearchPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const result = payload as { items?: unknown; success?: unknown };
  return Array.isArray(result.items) && result.success !== false;
}

export function writeSearchRequestCache(key: string, payload: unknown, now = Date.now()): void {
  if (!isCacheableSearchPayload(payload)) return;
  searchCache.set(key, { payload, expiresAt: now + SEARCH_CACHE_TTL_MS });
}

export function clearSearchRequestCache(): void {
  searchCache.clear();
}

/** Tracks only UI relevance; it never attempts to bypass or interrupt a remote service. */
export class LatestSearchRequestGate {
  private activeRequestId = 0;

  begin(): number {
    this.activeRequestId += 1;
    return this.activeRequestId;
  }

  isCurrent(requestId: number): boolean {
    return requestId === this.activeRequestId;
  }
}
