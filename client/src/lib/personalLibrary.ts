import type { ResultViewFilters, SearchResult } from "./searchResults";

export const BOOKMARKS_STORAGE_KEY = "sui-read-bookmarks";
export const LEGACY_CP_MAP_STORAGE_KEY = "sui-read-cp-map";
export const CP_MAP_STORAGE_KEY = "sui-read-custom-cp-map";
export const SEARCH_HISTORY_STORAGE_KEY = "sui-read-search-history";
export const FILTER_PRESET_STORAGE_KEY = "sui-read-filter-preset";

export type BookmarkRecord = {
  url: string;
  result: SearchResult;
  rating: number;
  notes: string;
  tags: string[];
  savedAt: string;
  updatedAt: string;
};

export type CpMapping = {
  alias: string;
  ao3Query: string;
  localQuery: string;
};

export const DEFAULT_CP_MAPPINGS: CpMapping[] = [
  { alias: "義忍", ao3Query: "Tomioka Giyuu/Kochou Shinobu", localQuery: "義忍 富岡義勇 胡蝶忍" },
  { alias: "五夏", ao3Query: "Gojo Satoru/Geto Suguru", localQuery: "五夏 五條悟 夏油傑" },
  { alias: "夏五", ao3Query: "Geto Suguru/Gojo Satoru", localQuery: "夏五 夏油傑 五條悟" },
  { alias: "勝出", ao3Query: "Bakugou Katsuki/Midoriya Izuku", localQuery: "勝出 爆豪勝己 綠谷出久" },
  { alias: "轟出", ao3Query: "Todoroki Shouto/Midoriya Izuku", localQuery: "轟出 轟焦凍 綠谷出久" },
  { alias: "佐櫻", ao3Query: "Uchiha Sasuke/Haruno Sakura", localQuery: "佐櫻 宇智波佐助 春野櫻" },
];

const DEFAULT_FILTERS: ResultViewFilters = { wordCount: "all", completion: "all", sort: "relevance" };

function canUseStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function readJson<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function normalizeCpMapping(value: unknown): CpMapping | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const alias = typeof record.alias === "string" ? record.alias.trim() : "";
  const legacyTag = typeof record.tag === "string" ? record.tag.trim() : "";
  const ao3Query = typeof record.ao3Query === "string" ? record.ao3Query.trim() : legacyTag;
  const localQuery = typeof record.localQuery === "string" ? record.localQuery.trim() : alias;
  return alias && ao3Query && localQuery ? { alias, ao3Query, localQuery } : null;
}

function normalizeCpMappings(value: unknown): CpMapping[] {
  return Array.isArray(value)
    ? value.map(normalizeCpMapping).filter((mapping): mapping is CpMapping => Boolean(mapping))
    : [];
}

export function loadBookmarks(): BookmarkRecord[] {
  const records = readJson<BookmarkRecord[]>(BOOKMARKS_STORAGE_KEY, []);
  return Array.isArray(records) ? records.filter((record) => record && typeof record.url === "string" && record.result) : [];
}

export function persistBookmarks(bookmarks: BookmarkRecord[]): void {
  writeJson(BOOKMARKS_STORAGE_KEY, bookmarks);
}

export function upsertBookmark(bookmarks: BookmarkRecord[], next: Omit<BookmarkRecord, "savedAt" | "updatedAt">): BookmarkRecord[] {
  const now = new Date().toISOString();
  const existing = bookmarks.find((bookmark) => bookmark.url === next.url);
  const record: BookmarkRecord = { ...next, savedAt: existing?.savedAt || now, updatedAt: now };
  return [record, ...bookmarks.filter((bookmark) => bookmark.url !== next.url)];
}

/** Load only user-created overrides, migrating the earlier single-tag key once. */
export function loadCustomCpMappings(): CpMapping[] {
  const stored = normalizeCpMappings(readJson<unknown>(CP_MAP_STORAGE_KEY, []));
  if (stored.length || !canUseStorage() || window.localStorage.getItem(CP_MAP_STORAGE_KEY) !== null) return stored;

  const migrated = normalizeCpMappings(readJson<unknown>(LEGACY_CP_MAP_STORAGE_KEY, []));
  if (migrated.length) writeJson(CP_MAP_STORAGE_KEY, migrated);
  return migrated;
}

/** Merge user overrides onto the built-in cross-platform vocabulary. */
export function mergeCpMappings(customMappings: CpMapping[]): CpMapping[] {
  const normalizedCustom = normalizeCpMappings(customMappings);
  const customByAlias = new Map(normalizedCustom.map((mapping) => [mapping.alias, mapping]));
  const defaults = DEFAULT_CP_MAPPINGS.map((mapping) => customByAlias.get(mapping.alias) || mapping);
  const additions = normalizedCustom.filter((mapping) => !DEFAULT_CP_MAPPINGS.some((item) => item.alias === mapping.alias));
  return [...defaults, ...additions];
}

export function loadCpMappings(): CpMapping[] {
  return mergeCpMappings(loadCustomCpMappings());
}

/** Persist only custom mappings so a reset can always restore the system defaults. */
export function persistCpMappings(customMappings: CpMapping[]): void {
  writeJson(CP_MAP_STORAGE_KEY, normalizeCpMappings(customMappings));
}

export function upsertCpMapping(mappings: CpMapping[], next: CpMapping, previousAlias?: string): CpMapping[] {
  const normalized = normalizeCpMapping(next);
  if (!normalized) return mappings;
  return [normalized, ...normalizeCpMappings(mappings).filter((mapping) => mapping.alias !== normalized.alias && mapping.alias !== previousAlias)];
}

export function isCustomCpMapping(mapping: CpMapping, customMappings: CpMapping[]): boolean {
  return customMappings.some((item) => item.alias === mapping.alias);
}

export function loadSearchHistory(): string[] {
  const history = readJson<string[]>(SEARCH_HISTORY_STORAGE_KEY, []);
  return Array.isArray(history) ? history.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 5) : [];
}

export function recordSearch(history: string[], keyword: string): string[] {
  const trimmed = keyword.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, 5);
}

export function persistSearchHistory(history: string[]): void {
  writeJson(SEARCH_HISTORY_STORAGE_KEY, history);
}

export function loadFilterPreset(): ResultViewFilters {
  const value = readJson<Partial<ResultViewFilters>>(FILTER_PRESET_STORAGE_KEY, DEFAULT_FILTERS);
  return {
    wordCount: value.wordCount === "short" || value.wordCount === "medium" || value.wordCount === "long" ? value.wordCount : "all",
    completion: value.completion === "complete" || value.completion === "ongoing" ? value.completion : "all",
    sort: value.sort === "updated" || value.sort === "words" ? value.sort : "relevance",
  };
}

export function persistFilterPreset(filters: ResultViewFilters): void {
  writeJson(FILTER_PRESET_STORAGE_KEY, filters);
}
