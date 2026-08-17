import type { ResultViewFilters, SearchResult } from "./searchResults";

export const BOOKMARKS_STORAGE_KEY = "sui-read-bookmarks";
export const LEGACY_CP_MAP_STORAGE_KEY = "sui-read-cp-map";
export const CP_MAP_STORAGE_KEY = "sui-read-custom-cp-map";
export const SEARCH_HISTORY_STORAGE_KEY = "sui-read-search-history";
export const FILTER_PRESET_STORAGE_KEY = "sui-read-filter-preset";
export const PINNED_QUERIES_STORAGE_KEY = "sui-read-pinned-queries";

export type BookmarkShelf = "to-read" | "favorite";
export type BookmarkRecord = {
  url: string;
  result: SearchResult;
  rating: number;
  notes: string;
  tags: string[];
  shelf: BookmarkShelf;
  savedAt: string;
  updatedAt: string;
};
export type BookmarkInput = Omit<BookmarkRecord, "savedAt" | "updatedAt" | "shelf"> & { shelf?: BookmarkShelf };

export type CpMapping = { alias: string; ao3Query: string; localQuery: string };
export const DEFAULT_CP_MAPPINGS: CpMapping[] = [
  { alias: "義忍", ao3Query: "Tomioka Giyuu/Kochou Shinobu", localQuery: "義忍 富岡義勇 胡蝶忍" },
  { alias: "五夏", ao3Query: "Gojo Satoru/Geto Suguru", localQuery: "五夏 五條悟 夏油傑" },
  { alias: "夏五", ao3Query: "Geto Suguru/Gojo Satoru", localQuery: "夏五 夏油傑 五條悟" },
  { alias: "勝出", ao3Query: "Bakugou Katsuki/Midoriya Izuku", localQuery: "勝出 爆豪勝己 綠谷出久" },
  { alias: "轟出", ao3Query: "Todoroki Shouto/Midoriya Izuku", localQuery: "轟出 轟焦凍 綠谷出久" },
  { alias: "佐櫻", ao3Query: "Uchiha Sasuke/Haruno Sakura", localQuery: "佐櫻 宇智波佐助 春野櫻" },
];

const DEFAULT_FILTERS: ResultViewFilters = { wordCount: "all", completion: "all", sort: "relevance" };
const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);
function readJson<T>(key: string, fallback: T): T { if (!canUseStorage()) return fallback; try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function writeJson<T>(key: string, value: T): void { if (canUseStorage()) window.localStorage.setItem(key, JSON.stringify(value)); }
function normalizeShelf(value: unknown): BookmarkShelf { return value === "favorite" ? "favorite" : "to-read"; }

function normalizeBookmark(value: unknown): BookmarkRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.url !== "string" || !record.url.trim() || !record.result || typeof record.result !== "object") return null;
  const now = new Date().toISOString();
  return {
    url: record.url,
    result: record.result as SearchResult,
    rating: typeof record.rating === "number" ? Math.max(0, Math.min(5, record.rating)) : 0,
    notes: typeof record.notes === "string" ? record.notes : "",
    tags: Array.isArray(record.tags) ? record.tags.filter((tag): tag is string => typeof tag === "string" && Boolean(tag.trim())).map((tag) => tag.trim()) : [],
    shelf: normalizeShelf(record.shelf),
    savedAt: typeof record.savedAt === "string" ? record.savedAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

export function loadBookmarks(): BookmarkRecord[] { const records = readJson<unknown[]>(BOOKMARKS_STORAGE_KEY, []); return records.map(normalizeBookmark).filter((record): record is BookmarkRecord => Boolean(record)); }
export function persistBookmarks(bookmarks: BookmarkRecord[]): void { writeJson(BOOKMARKS_STORAGE_KEY, bookmarks); }
export function upsertBookmark(bookmarks: BookmarkRecord[], next: BookmarkInput): BookmarkRecord[] {
  const now = new Date().toISOString(); const existing = bookmarks.find((bookmark) => bookmark.url === next.url);
  const record: BookmarkRecord = { ...next, shelf: next.shelf || existing?.shelf || "to-read", savedAt: existing?.savedAt || now, updatedAt: now };
  return [record, ...bookmarks.filter((bookmark) => bookmark.url !== next.url)];
}
export function filterBookmarks(bookmarks: BookmarkRecord[], query: string, platform: string, shelf: BookmarkShelf | "all", tag: string): BookmarkRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  return bookmarks.filter((bookmark) => {
    const haystack = [bookmark.result.title, bookmark.result.author, bookmark.result.summary, bookmark.result.platform, ...bookmark.tags].join(" ").toLocaleLowerCase();
    return (!needle || haystack.includes(needle)) && (platform === "all" || bookmark.result.platform === platform) && (shelf === "all" || bookmark.shelf === shelf) && (!tag || bookmark.tags.includes(tag));
  });
}
export function serializeBookmarksJson(bookmarks: BookmarkRecord[]): string { return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), bookmarks }, null, 2); }
export function bookmarksToMarkdown(bookmarks: BookmarkRecord[]): string {
  const header = `# Fanfic Atlas 藏書閣\n\n匯出時間：${new Date().toLocaleString("zh-TW")}\n`;
  const entries = bookmarks.map((bookmark) => `\n## [${bookmark.result.title}](${bookmark.url})\n- 作者：${bookmark.result.author}\n- 來源：${bookmark.result.platform}\n- 分類：${bookmark.shelf === "favorite" ? "最愛" : "待讀"}${bookmark.tags.length ? `\n- 標籤：${bookmark.tags.map((tag) => `#${tag}`).join(" ")}` : ""}${bookmark.notes ? `\n- 筆記：${bookmark.notes}` : ""}`);
  return `${header}${entries.join("\n")}`;
}
function csvCell(value: unknown): string { const text = String(value ?? "").replace(/"/g, '""'); return /[",\n]/.test(text) ? `"${text}"` : text; }
export function bookmarksToCsv(bookmarks: BookmarkRecord[]): string {
  const columns = ["title", "author", "platform", "url", "language", "tags", "summary", "shelf", "rating", "notes", "savedAt"];
  const rows = bookmarks.map((bookmark) => [bookmark.result.title, bookmark.result.author, bookmark.result.platform, bookmark.url, bookmark.result.language || "unknown", bookmark.tags.join(" | "), bookmark.result.summary, bookmark.shelf, bookmark.rating, bookmark.notes, bookmark.savedAt]);
  return [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
export function parseBookmarkImport(text: string): BookmarkRecord[] {
  try { const raw = JSON.parse(text) as unknown; const candidates = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { bookmarks?: unknown }).bookmarks) ? (raw as { bookmarks: unknown[] }).bookmarks : []; return candidates.map(normalizeBookmark).filter((record): record is BookmarkRecord => Boolean(record)); } catch { return []; }
}
export function mergeImportedBookmarks(current: BookmarkRecord[], incoming: BookmarkRecord[]): BookmarkRecord[] {
  const byUrl = new Map(current.map((bookmark) => [bookmark.url, bookmark])); incoming.forEach((bookmark) => { const existing = byUrl.get(bookmark.url); byUrl.set(bookmark.url, !existing || bookmark.updatedAt > existing.updatedAt ? bookmark : existing); }); return Array.from(byUrl.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function normalizeCpMapping(value: unknown): CpMapping | null { if (!value || typeof value !== "object") return null; const record = value as Record<string, unknown>; const alias = typeof record.alias === "string" ? record.alias.trim() : ""; const legacyTag = typeof record.tag === "string" ? record.tag.trim() : ""; const ao3Query = typeof record.ao3Query === "string" ? record.ao3Query.trim() : legacyTag; const localQuery = typeof record.localQuery === "string" ? record.localQuery.trim() : alias; return alias && ao3Query && localQuery ? { alias, ao3Query, localQuery } : null; }
function normalizeCpMappings(value: unknown): CpMapping[] { return Array.isArray(value) ? value.map(normalizeCpMapping).filter((mapping): mapping is CpMapping => Boolean(mapping)) : []; }
export function loadCustomCpMappings(): CpMapping[] { const stored = normalizeCpMappings(readJson<unknown>(CP_MAP_STORAGE_KEY, [])); if (stored.length || !canUseStorage() || window.localStorage.getItem(CP_MAP_STORAGE_KEY) !== null) return stored; const migrated = normalizeCpMappings(readJson<unknown>(LEGACY_CP_MAP_STORAGE_KEY, [])); if (migrated.length) writeJson(CP_MAP_STORAGE_KEY, migrated); return migrated; }
export function mergeCpMappings(customMappings: CpMapping[]): CpMapping[] { const normalizedCustom = normalizeCpMappings(customMappings); const customByAlias = new Map(normalizedCustom.map((mapping) => [mapping.alias, mapping])); const defaults = DEFAULT_CP_MAPPINGS.map((mapping) => customByAlias.get(mapping.alias) || mapping); return [...defaults, ...normalizedCustom.filter((mapping) => !DEFAULT_CP_MAPPINGS.some((item) => item.alias === mapping.alias))]; }
export function loadCpMappings(): CpMapping[] { return mergeCpMappings(loadCustomCpMappings()); }
export function persistCpMappings(customMappings: CpMapping[]): void { writeJson(CP_MAP_STORAGE_KEY, normalizeCpMappings(customMappings)); }
export function upsertCpMapping(mappings: CpMapping[], next: CpMapping, previousAlias?: string): CpMapping[] { const normalized = normalizeCpMapping(next); return !normalized ? mappings : [normalized, ...normalizeCpMappings(mappings).filter((mapping) => mapping.alias !== normalized.alias && mapping.alias !== previousAlias)]; }
export function isCustomCpMapping(mapping: CpMapping, customMappings: CpMapping[]): boolean { return customMappings.some((item) => item.alias === mapping.alias); }

export function loadSearchHistory(): string[] { const history = readJson<string[]>(SEARCH_HISTORY_STORAGE_KEY, []); return Array.isArray(history) ? history.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, 10) : []; }
export function recordSearch(history: string[], keyword: string): string[] { const trimmed = keyword.trim(); return !trimmed ? history : [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, 10); }
export function persistSearchHistory(history: string[]): void { writeJson(SEARCH_HISTORY_STORAGE_KEY, history); }
export function clearSearchHistory(): void { if (canUseStorage()) window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY); }
export function loadPinnedQueries(): string[] { const queries = readJson<string[]>(PINNED_QUERIES_STORAGE_KEY, []); return Array.isArray(queries) ? queries.filter((query) => typeof query === "string" && Boolean(query.trim())).slice(0, 12) : []; }
export function togglePinnedQuery(queries: string[], value: string): string[] { const query = value.trim(); return !query ? queries : queries.includes(query) ? queries.filter((item) => item !== query) : [query, ...queries].slice(0, 12); }
export function persistPinnedQueries(queries: string[]): void { writeJson(PINNED_QUERIES_STORAGE_KEY, queries); }
export function loadFilterPreset(): ResultViewFilters { const value = readJson<Partial<ResultViewFilters>>(FILTER_PRESET_STORAGE_KEY, DEFAULT_FILTERS); return { wordCount: value.wordCount === "short" || value.wordCount === "medium" || value.wordCount === "long" ? value.wordCount : "all", completion: value.completion === "complete" || value.completion === "ongoing" ? value.completion : "all", sort: value.sort === "updated" || value.sort === "words" ? value.sort : "relevance" }; }
export function persistFilterPreset(filters: ResultViewFilters): void { writeJson(FILTER_PRESET_STORAGE_KEY, filters); }
