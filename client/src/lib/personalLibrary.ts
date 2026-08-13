import type { ResultViewFilters, SearchResult } from "./searchResults";

export const BOOKMARKS_STORAGE_KEY = "sui-read-bookmarks";
export const CP_MAP_STORAGE_KEY = "sui-read-cp-map";
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

export type CpMapping = { alias: string; tag: string };

export const DEFAULT_CP_MAPPINGS: CpMapping[] = [
  { alias: "義忍", tag: "Tomioka Giyuu/Kochou Shinobu" },
  { alias: "五夏", tag: "Gojo Satoru/Geto Suguru" },
  { alias: "夏五", tag: "Geto Suguru/Gojo Satoru" },
  { alias: "勝出", tag: "Bakugou Katsuki/Midoriya Izuku" },
  { alias: "轟出", tag: "Todoroki Shouto/Midoriya Izuku" },
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

export function loadCpMappings(): CpMapping[] {
  const records = readJson<CpMapping[]>(CP_MAP_STORAGE_KEY, DEFAULT_CP_MAPPINGS);
  return Array.isArray(records) ? records.filter((record) => record && typeof record.alias === "string" && typeof record.tag === "string") : DEFAULT_CP_MAPPINGS;
}

export function persistCpMappings(mappings: CpMapping[]): void {
  writeJson(CP_MAP_STORAGE_KEY, mappings);
}

export function upsertCpMapping(mappings: CpMapping[], next: CpMapping, previousAlias?: string): CpMapping[] {
  const alias = next.alias.trim();
  const tag = next.tag.trim();
  if (!alias || !tag) return mappings;
  return [{ alias, tag }, ...mappings.filter((mapping) => mapping.alias !== alias && mapping.alias !== previousAlias)];
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
