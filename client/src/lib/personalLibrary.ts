import type { ResultViewFilters, SearchResult } from "./searchResults";

export const BOOKMARKS_STORAGE_KEY = "sui-read-bookmarks";
export const CP_MAP_STORAGE_KEY = "sui-read-cp-map";
export const CUSTOM_CP_MAP_STORAGE_KEY = "sui-read-custom-cp-map";
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

export type BookmarkBackup = {
  version: 1;
  exportedAt: string;
  bookmarks: BookmarkRecord[];
};

export type BookmarkLibrarySort = "saved_desc" | "saved_asc" | "rating_desc" | "rating_asc";

export type BookmarkImportPreview = {
  bookmarks: BookmarkRecord[];
  tagCount: number;
  sample: BookmarkRecord[];
};

export type CpMapping = {
  alias: string;
  /** Legacy display field retained for previously saved mappings. */
  tag: string;
  ao3Query?: string;
  localQuery?: string;
  source?: "system" | "custom";
};

export const DEFAULT_CP_MAPPINGS: CpMapping[] = [
  { alias: "義忍", tag: "Tomioka Giyuu/Kochou Shinobu", ao3Query: '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"', localQuery: "義忍 富岡義勇 胡蝶忍", source: "system" },
  { alias: "五夏", tag: "Gojo Satoru/Geto Suguru", ao3Query: '"Gojo Satoru/Geto Suguru" OR "五夏"', localQuery: "五夏 五條悟 夏油傑", source: "system" },
  { alias: "夏五", tag: "Geto Suguru/Gojo Satoru", ao3Query: '"Geto Suguru/Gojo Satoru" OR "夏五"', localQuery: "夏五 夏油傑 五條悟", source: "system" },
  { alias: "勝出", tag: "Bakugou Katsuki/Midoriya Izuku", ao3Query: '"Bakugou Katsuki/Midoriya Izuku" OR "勝出"', localQuery: "勝出 爆豪勝己 綠谷出久", source: "system" },
  { alias: "轟出", tag: "Todoroki Shouto/Midoriya Izuku", ao3Query: '"Todoroki Shouto/Midoriya Izuku" OR "轟出"', localQuery: "轟出 轟焦凍 綠谷出久", source: "system" },
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

export function collectBookmarkTags(bookmarks: BookmarkRecord[]): string[] {
  return Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tags.map((tag) => tag.trim()).filter(Boolean)))).sort((a, b) => a.localeCompare(b, "zh-TW"));
}

export function filterBookmarks(bookmarks: BookmarkRecord[], tag: string | null, rating: number | null): BookmarkRecord[] {
  return bookmarks.filter((bookmark) => {
    const hasTag = !tag || bookmark.tags.some((bookmarkTag) => bookmarkTag === tag);
    const hasRating = rating === null || bookmark.rating === rating;
    return hasTag && hasRating;
  });
}

export function filterAndSortBookmarks(
  bookmarks: BookmarkRecord[],
  options: { query: string; tag: string | null; rating: number | null; sort: BookmarkLibrarySort },
): BookmarkRecord[] {
  const normalizedQuery = options.query.trim().toLocaleLowerCase();
  const visible = filterBookmarks(bookmarks, options.tag, options.rating).filter((bookmark) => {
    if (!normalizedQuery) return true;
    const searchable = [bookmark.result.title, bookmark.result.author, bookmark.notes, ...bookmark.tags]
      .join(" ")
      .toLocaleLowerCase();
    return searchable.includes(normalizedQuery);
  });
  const timestamp = (value: string) => {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return [...visible].sort((left, right) => {
    if (options.sort === "rating_desc") return right.rating - left.rating || timestamp(right.savedAt) - timestamp(left.savedAt);
    if (options.sort === "rating_asc") return left.rating - right.rating || timestamp(right.savedAt) - timestamp(left.savedAt);
    if (options.sort === "saved_asc") return timestamp(left.savedAt) - timestamp(right.savedAt);
    return timestamp(right.savedAt) - timestamp(left.savedAt);
  });
}

export function createBookmarkBackup(bookmarks: BookmarkRecord[]): BookmarkBackup {
  return { version: 1, exportedAt: new Date().toISOString(), bookmarks };
}

function isSearchResult(value: unknown): value is SearchResult {
  return Boolean(value) && typeof value === "object" && typeof (value as SearchResult).url === "string" && typeof (value as SearchResult).title === "string";
}

function normalizeImportedBookmark(value: unknown): BookmarkRecord | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<BookmarkRecord>;
  if (typeof candidate.url !== "string" || !candidate.url.startsWith(("http")) || !isSearchResult(candidate.result)) return null;
  const rating = typeof candidate.rating === "number" && Number.isFinite(candidate.rating) ? Math.max(0, Math.min(5, Math.round(candidate.rating))) : 0;
  const tags = Array.isArray(candidate.tags) ? candidate.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim()) : [];
  const now = new Date().toISOString();
  return {
    url: candidate.url,
    result: candidate.result,
    rating,
    notes: typeof candidate.notes === "string" ? candidate.notes : "",
    tags: Array.from(new Set(tags)),
    savedAt: typeof candidate.savedAt === "string" ? candidate.savedAt : now,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : now,
  };
}

export function parseBookmarkBackup(json: string): BookmarkRecord[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("備份檔不是有效的 JSON 格式。");
  }
  const records = Array.isArray(parsed) ? parsed : (parsed as Partial<BookmarkBackup>)?.bookmarks;
  if (!Array.isArray(records)) throw new Error("備份檔缺少 bookmarks 清單。");
  const normalized = records.map(normalizeImportedBookmark).filter((record): record is BookmarkRecord => record !== null);
  if (!normalized.length && records.length) throw new Error("備份檔沒有可匯入的閱讀卡資料。");
  return normalized;
}

export function createBookmarkImportPreview(bookmarks: BookmarkRecord[]): BookmarkImportPreview {
  return {
    bookmarks,
    tagCount: collectBookmarkTags(bookmarks).length,
    sample: bookmarks.slice(0, 3),
  };
}

export function mergeNewBookmarks(current: BookmarkRecord[], imported: BookmarkRecord[]): BookmarkRecord[] {
  const existingUrls = new Set(current.map((bookmark) => bookmark.url));
  return [...current, ...imported.filter((bookmark) => !existingUrls.has(bookmark.url))]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function mergeImportedBookmarks(current: BookmarkRecord[], imported: BookmarkRecord[]): BookmarkRecord[] {
  const byUrl = new Map(current.map((bookmark) => [bookmark.url, bookmark]));
  for (const bookmark of imported) {
    const existing = byUrl.get(bookmark.url);
    if (!existing || new Date(bookmark.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) byUrl.set(bookmark.url, bookmark);
  }
  return Array.from(byUrl.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function upsertBookmark(bookmarks: BookmarkRecord[], next: Omit<BookmarkRecord, "savedAt" | "updatedAt">): BookmarkRecord[] {
  const now = new Date().toISOString();
  const existing = bookmarks.find((bookmark) => bookmark.url === next.url);
  const record: BookmarkRecord = { ...next, savedAt: existing?.savedAt || now, updatedAt: now };
  return [record, ...bookmarks.filter((bookmark) => bookmark.url !== next.url)];
}

function normalizeCpMapping(value: unknown, source: "system" | "custom"): CpMapping | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<CpMapping>;
  const alias = typeof candidate.alias === "string" ? candidate.alias.trim() : "";
  const tag = typeof candidate.tag === "string" ? candidate.tag.trim() : "";
  const ao3Query = typeof candidate.ao3Query === "string" ? candidate.ao3Query.trim() : tag;
  const localQuery = typeof candidate.localQuery === "string" ? candidate.localQuery.trim() : alias;
  if (!alias || !ao3Query) return null;
  return { alias, tag: tag || ao3Query, ao3Query, localQuery: localQuery || alias, source };
}

function normalizedMappings(records: unknown, source: "system" | "custom"): CpMapping[] {
  return Array.isArray(records)
    ? records.map((record) => normalizeCpMapping(record, source)).filter((record): record is CpMapping => record !== null)
    : [];
}

export function loadCpMappings(): CpMapping[] {
  const defaults = DEFAULT_CP_MAPPINGS.map((mapping) => ({ ...mapping, source: "system" as const }));
  const legacy = normalizedMappings(readJson<unknown>(CP_MAP_STORAGE_KEY, []), "custom");
  const custom = normalizedMappings(readJson<unknown>(CUSTOM_CP_MAP_STORAGE_KEY, legacy), "custom")
    .filter((mapping) => {
      const system = DEFAULT_CP_MAPPINGS.find((candidate) => candidate.alias === mapping.alias);
      // Older releases persisted a copied default list as `{ alias, tag }`.
      // Do not let that legacy shadow erase the richer system local query.
      return !system || mapping.ao3Query !== system.tag || mapping.localQuery !== mapping.alias;
    });
  const byAlias = new Map<string, CpMapping>(defaults.map((mapping) => [mapping.alias, mapping]));
  custom.forEach((mapping) => byAlias.set(mapping.alias, mapping));
  return Array.from(byAlias.values());
}

export function persistCpMappings(mappings: CpMapping[]): void {
  const defaultByAlias = new Map(DEFAULT_CP_MAPPINGS.map((mapping) => [mapping.alias, mapping]));
  const custom = mappings
    .map((mapping) => normalizeCpMapping(mapping, mapping.source === "system" ? "system" : "custom"))
    .filter((mapping): mapping is CpMapping => mapping !== null)
    .filter((mapping) => {
      const system = defaultByAlias.get(mapping.alias);
      return !system || mapping.source === "custom" || system.ao3Query !== mapping.ao3Query || system.localQuery !== mapping.localQuery;
    })
    .map(({ source: _source, ...mapping }) => mapping);
  writeJson(CUSTOM_CP_MAP_STORAGE_KEY, custom);
  // Keep the pre-upgrade key in sync so existing installations remain readable.
  writeJson(CP_MAP_STORAGE_KEY, custom);
}

export function upsertCpMapping(mappings: CpMapping[], next: CpMapping, previousAlias?: string): CpMapping[] {
  const alias = next.alias.trim();
  const tag = next.tag.trim() || next.ao3Query?.trim() || "";
  const ao3Query = next.ao3Query?.trim() || tag;
  const localQuery = next.localQuery?.trim() || alias;
  if (!alias || !ao3Query) return mappings;
  const custom: CpMapping = { alias, tag, ao3Query, localQuery, source: "custom" };
  return [custom, ...mappings.filter((mapping) => mapping.alias !== alias && mapping.alias !== previousAlias)];
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
