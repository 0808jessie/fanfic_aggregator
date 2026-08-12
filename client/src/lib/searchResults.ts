export type SearchResult = {
  title: string;
  author: string;
  platform: string;
  url: string;
  tags: string;
  summary: string;
  scraped_at: string;
  source?: string;
  warning?: string;
};

export function isDisplayableResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SearchResult>;
  if (typeof result.url !== "string" || typeof result.platform !== "string") return false;

  const normalizedUrl = result.url.trim().toLowerCase();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) return false;
  if (["example.com", "example.org", "localhost", "127.0.0.1"].some((blocked) => normalizedUrl.includes(blocked))) return false;

  const platform = result.platform.toLowerCase();
  if (platform.includes("ao3")) return normalizedUrl.includes("archiveofourown.org");
  if (platform.includes("lofter")) return normalizedUrl.includes("lofter.com");
  return false;
}

export function normalizeResults(payload: unknown): SearchResult[] {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ("items" in payload
        ? (payload as { items?: unknown }).items
        : "data" in payload
          ? (payload as { data?: unknown }).data
          : [])
      : [];

  if (!Array.isArray(candidates)) return [];
  return candidates.filter(isDisplayableResult) as SearchResult[];
}

export function appendUniqueResults(current: SearchResult[], incoming: SearchResult[]): SearchResult[] {
  const seen = new Set(current.map((item) => item.url));
  return [...current, ...incoming.filter((item) => !seen.has(item.url))];
}

export function getLoadMoreLabel(isPending: boolean, nextPage: number | null): string {
  if (isPending) return "正在翻頁載入中...";
  return nextPage ? `LOAD MORE / PAGE ${nextPage}` : "NO MORE WORKS";
}

export function extractSearchWarning(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || !("warning" in payload)) return null;
  const warning = (payload as { warning?: unknown }).warning;
  return typeof warning === "string" && warning.trim() ? warning : null;
}

export type SearchPagination = {
  totalWorks: number;
  totalPages: number;
  page: number;
  loadedThroughPage: number;
  nextPage: number | null;
  hasMore: boolean;
};

export function extractIsRateLimited(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  return Boolean((payload as { isRateLimited?: unknown }).isRateLimited);
}

export function extractSearchPagination(payload: unknown): SearchPagination {
  if (!payload || typeof payload !== "object") {
    return { totalWorks: 0, totalPages: 0, page: 1, loadedThroughPage: 0, nextPage: null, hasMore: false };
  }
  const value = payload as Record<string, unknown>;
  const asNumber = (key: string, fallback: number) => {
    const candidate = Number(value[key]);
    return Number.isFinite(candidate) && candidate >= 0 ? candidate : fallback;
  };
  const totalPages = asNumber("totalPages", 0);
  const loadedThroughPage = asNumber("loadedThroughPage", asNumber("page", 1));
  const nextPageValue = asNumber("nextPage", 0);
  return {
    totalWorks: asNumber("totalWorks", 0),
    totalPages,
    page: Math.max(1, asNumber("page", 1)),
    loadedThroughPage,
    nextPage: nextPageValue > 0 ? nextPageValue : null,
    hasMore: Boolean(value.hasMore) && loadedThroughPage < totalPages,
  };
}
