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
  language?: string | null;
  rating?: string | null;
};

function normalizeTags(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean).join(", ");
  }
  return typeof value === "string" ? value : "";
}

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
export type LanguageFilter = "all" | "zh" | "zh-hant" | "zh-hans" | "ja" | "en";
export type RatingFilter = "all" | "safe" | "r18";

export type ResultViewFilters = {
  wordCount: WordCountFilter;
  completion: CompletionFilter;
  sort: ResultSortMode;
  hideBookmarked?: boolean;
  language?: LanguageFilter;
  excludedKeywords?: string[];
  rating?: RatingFilter;
};

export function isDisplayableResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SearchResult>;
  if (typeof result.url !== "string" || typeof result.platform !== "string") return false;

  const normalizedUrl = result.url.trim().toLowerCase();
  if (!normalizedUrl.startsWith("http://") && !normalizedUrl.startsWith("https://")) return false;
  if (["example.com", "example.org", "localhost", "127.0.0.1"].some((blocked) => normalizedUrl.includes(blocked))) return false;

  const platform = result.platform.toLowerCase();
  let hostname = "";
  try {
    hostname = new URL(normalizedUrl).hostname;
  } catch {
    return false;
  }
  const hasAllowedHost = (...hosts: string[]) => hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (platform.includes("ao3")) return hasAllowedHost("archiveofourown.org");
  if (platform.includes("cxc")) return hasAllowedHost("cxc.today");
  if (platform.includes("lofter")) return hasAllowedHost("lofter.com");
  if (platform.includes("同人誌中心") || platform.includes("doujin")) return hasAllowedHost("doujin.com.tw");
  if (platform.includes("在水裡寫字") || platform.includes("waterwriter")) return hasAllowedHost("slashtw.space");
  if (platform.includes("penana")) return hasAllowedHost("penana.com");
  if (platform.includes("pixiv")) return hasAllowedHost("pixiv.net", "www.pixiv.net");
  if (platform.includes("巴哈姆特") || platform.includes("bahamut")) return hasAllowedHost("home.gamer.com.tw");
  if (platform.includes("kadokado") || platform.includes("角角者")) return hasAllowedHost("kadokado.com.tw", "www.kadokado.com.tw");
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
  return candidates.flatMap((candidate) => {
    if (!isDisplayableResult(candidate)) return [];
    const result = candidate as SearchResult & { tags?: unknown; updated_at?: unknown };
    const normalized: SearchResult = {
      ...result,
      tags: normalizeTags(result.tags),
      scraped_at: result.scraped_at || (typeof result.updated_at === "string" ? result.updated_at : new Date(0).toISOString()),
    };
    if (!normalized.updatedAt && typeof result.updated_at === "string") {
      normalized.updatedAt = result.updated_at;
    }
    return [normalized];
  });
}

export function appendUniqueResults(current: SearchResult[], incoming: SearchResult[]): SearchResult[] {
  const seen = new Set(current.map((item) => item.url));
  return [...current, ...incoming.filter((item) => !seen.has(item.url))];
}

export function getLoadMoreLabel(isPending: boolean, nextPage: number | null): string {
  if (isPending) return "正在翻頁載入中...";
  return nextPage ? `LOAD MORE / PAGE ${nextPage}` : "NO MORE WORKS";
}

export function formatSourceLoadProgress(loadedWorks: number, totalWorks: number, page: number, totalPages: number): string {
  const safeLoaded = Math.max(0, Math.trunc(loadedWorks));
  const safeTotal = Math.max(0, Math.trunc(totalWorks));
  const safePage = Math.max(1, Math.trunc(page));
  const safePages = Math.max(1, Math.trunc(totalPages));
  if (safeTotal > 0) return `已載入第 ${safePage} 頁 ${safeLoaded} 篇／共 ${safeTotal.toLocaleString()} 筆`;
  return safePages > 1 ? `已載入第 ${safePage} 頁 ${safeLoaded} 篇` : `已載入 ${safeLoaded} 篇`;
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

const SIMPLIFIED_MARKERS = /[这后发复里为国书爱见听说车门云东台风万与]/g;
const TRADITIONAL_MARKERS = /[這後髮複裡為國書愛見聽說車門雲東臺風萬與]/g;

function markerCount(text: string, expression: RegExp): number {
  return text.match(expression)?.length || 0;
}

/**
 * Prefer source metadata, then infer from the work text held in memory.
 * These heuristics intentionally run only after a search response is received;
 * changing language controls must never participate in the crawler request.
 */
export function resultLanguage(result: SearchResult): Exclude<LanguageFilter, "all"> | "unknown" {
  const language = (result.language || "").trim().toLocaleLowerCase();
  if (language === "unknown") return "unknown";
  if (/(ja|japanese|日本語|日文)/.test(language)) return "ja";
  if (/(zh-tw|zh-hant|hant|traditional|繁體|繁中|正體)/.test(language)) return "zh-hant";
  if (/(zh-cn|zh-hans|hans|simplified|简体|簡體|简中|簡中)/.test(language)) return "zh-hans";
  if (/(zh|chinese|中文|華文|华文)/.test(language)) return "zh";
  if (/(en|english|英文)/.test(language)) return "en";

  const text = [result.title, result.summary, result.tags, result.relationships?.join(" "), result.characters?.join(" ")]
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) return "unknown";
  if (/[ぁ-んァ-ヶｧ-ﾝ]/.test(text)) return "ja";

  const simplifiedCount = markerCount(text, SIMPLIFIED_MARKERS);
  const traditionalCount = markerCount(text, TRADITIONAL_MARKERS);
  if (simplifiedCount > traditionalCount && simplifiedCount > 0) return "zh-hans";
  if (traditionalCount > simplifiedCount && traditionalCount > 0) return "zh-hant";
  if (/[\u3400-\u9fff]/.test(text)) return "zh";
  if (/[A-Za-z]/.test(text)) return "en";
  return "unknown";
}

export function matchesLanguageFilter(result: SearchResult, filter: LanguageFilter = "all"): boolean {
  if (filter === "all") return true;
  const language = resultLanguage(result);
  if (language === "unknown") return false;
  return filter === "zh" ? language.startsWith("zh") : language === filter;
}

export function countLanguageResults(results: SearchResult[], filter: LanguageFilter): number {
  return results.filter((result) => matchesLanguageFilter(result, filter)).length;
}

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

export function normalizeExcludedKeywords(values: string[]): string[] {
  return Array.from(new Set(
    values.map((value) => value.trim()).filter(Boolean).map((value) => value.toLocaleLowerCase()),
  )).slice(0, 50);
}

export function matchesExcludedKeyword(result: SearchResult, excludedKeywords: string[] = []): boolean {
  const needleList = normalizeExcludedKeywords(excludedKeywords);
  if (!needleList.length) return false;
  const haystack = [
    result.title,
    result.characters?.join(" "),
    result.relationships?.join(" "),
    result.tags,
    result.summary,
  ].map(normalized).join(" ");
  return needleList.some((keyword) => haystack.includes(keyword));
}

export function isRestrictedResult(result: SearchResult): boolean {
  const classification = [result.rating, result.tags, result.title, result.summary]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return /\b(explicit|mature|nsfw|nc[-\s]?17|r[-\s]?18|18\+|r18g)\b|限制級|成人向|僅限成人|十八禁|18禁/.test(classification);
}

export function matchesRatingFilter(result: SearchResult, filter: RatingFilter | undefined): boolean {
  if (!filter || filter === "all") return true;
  return filter === "r18" ? isRestrictedResult(result) : !isRestrictedResult(result);
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
    const blacklistMatch = matchesExcludedKeyword(result, filters.excludedKeywords);
    return wordMatch && completionMatch && matchesLanguageFilter(result, filters.language) && matchesRatingFilter(result, filters.rating) && !blacklistMatch;
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
