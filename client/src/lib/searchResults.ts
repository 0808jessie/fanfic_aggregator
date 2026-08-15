export type SearchResult = {
  id?: string;
  title: string;
  author: string;
  platform: string;
  url: string;
  tags: string;
  relationships?: string[];
  characters?: string[];
  summary: string;
  coverUrl?: string | null;
  wordCount?: string | null;
  updatedAt?: string | null;
  isComplete?: boolean | null;
  relevanceScore?: number;
  scraped_at: string;
  source?: string;
  warning?: string;
};

export type PlatformStatusKind = "success" | "blocked" | "cooldown" | "empty" | "error";

export type PlatformStatus = {
  platformId: string;
  label: string;
  status: PlatformStatusKind;
  itemCount: number;
  warning?: string | null;
  translatedQuery: string;
};

export type WordCountFilter = "all" | "short" | "medium" | "long";
export type CompletionFilter = "all" | "complete" | "ongoing";
export type ResultSortMode = "relevance" | "updated" | "words";

export type ResultViewFilters = {
  wordCount: WordCountFilter;
  completion: CompletionFilter;
  sort: ResultSortMode;
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
  if (platform.includes("cxc")) return normalizedUrl.includes("cxc.today");
  if (platform.includes("lofter")) return normalizedUrl.includes("lofter.com");
  if (platform.includes("同人誌中心") || platform.includes("doujin")) return normalizedUrl.includes("doujin.com.tw");
  if (platform.includes("在水裡寫字") || platform.includes("waterwriter")) return normalizedUrl.includes("slashtw.space");
  if (platform.includes("penana")) return normalizedUrl.includes("penana.com");
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

export function extractPlatformStatuses(payload: unknown): PlatformStatus[] {
  if (!payload || typeof payload !== "object") return [];
  const candidate = (payload as { platformStatuses?: unknown }).platformStatuses;
  if (!Array.isArray(candidate)) return [];

  const validStatuses = new Set<PlatformStatusKind>(["success", "blocked", "cooldown", "empty", "error"]);
  return candidate.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const status = value as Partial<PlatformStatus>;
    if (
      typeof status.platformId !== "string"
      || typeof status.label !== "string"
      || typeof status.status !== "string"
      || !validStatuses.has(status.status as PlatformStatusKind)
      || typeof status.translatedQuery !== "string"
    ) {
      return [];
    }
    const count = Number(status.itemCount);
    return [{
      platformId: status.platformId,
      label: status.label,
      status: status.status as PlatformStatusKind,
      itemCount: Number.isFinite(count) ? Math.max(0, count) : 0,
      warning: typeof status.warning === "string" ? status.warning : null,
      translatedQuery: status.translatedQuery,
    }];
  });
}

export function isPlatformRetryable(status: PlatformStatus): boolean {
  return status.status === "blocked" || status.status === "cooldown" || status.status === "error";
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

export function parseWordCount(value: string | null | undefined): number {
  const digits = (value || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

function localRelevanceScore(result: SearchResult, keyword: string): number {
  const query = normalized(keyword);
  if (!query) return 0;
  const tags = [...(result.relationships || []), ...(result.tags || "").split(",")].map(normalized);
  let score = tags.some((tag) => tag.includes(query)) ? 100 : 0;
  if (normalized(result.title).includes(query)) score += 50;
  if (normalized(result.summary).includes(query)) score += 20;
  return score;
}

function updatedTimestamp(result: SearchResult): number {
  const timestamp = Date.parse(result.updatedAt || result.scraped_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterAndSortResults(
  results: SearchResult[],
  keyword: string,
  filters: ResultViewFilters,
): SearchResult[] {
  const filtered = results.filter((result) => {
    const words = parseWordCount(result.wordCount);
    const wordMatch = filters.wordCount === "all"
      || (filters.wordCount === "short" && words > 0 && words < 1_000)
      || (filters.wordCount === "medium" && words >= 1_000 && words <= 10_000)
      || (filters.wordCount === "long" && words > 10_000);
    const completionMatch = filters.completion === "all"
      || (filters.completion === "complete" && result.isComplete === true)
      || (filters.completion === "ongoing" && result.isComplete === false);
    return wordMatch && completionMatch;
  });

  return filtered
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      const relevanceDelta = (right.result.relevanceScore ?? localRelevanceScore(right.result, keyword))
        - (left.result.relevanceScore ?? localRelevanceScore(left.result, keyword));
      const updatedDelta = updatedTimestamp(right.result) - updatedTimestamp(left.result);
      const wordsDelta = parseWordCount(right.result.wordCount) - parseWordCount(left.result.wordCount);
      if (filters.sort === "updated") return updatedDelta || relevanceDelta || wordsDelta || left.index - right.index;
      if (filters.sort === "words") return wordsDelta || relevanceDelta || updatedDelta || left.index - right.index;
      return relevanceDelta || updatedDelta || wordsDelta || left.index - right.index;
    })
    .map(({ result }) => result);
}
