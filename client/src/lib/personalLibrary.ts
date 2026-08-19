import type { ResultViewFilters, SearchResult } from "./searchResults";
import { persistDesktopPersonalValue, readDesktopPersonalValue } from "./desktopPersonalStore";

export const BOOKMARKS_STORAGE_KEY = "sui-read-bookmarks";
export const LEGACY_CP_MAP_STORAGE_KEY = "sui-read-cp-map";
export const CP_MAP_STORAGE_KEY = "sui-read-custom-cp-map";
export const SEARCH_HISTORY_STORAGE_KEY = "sui-read-search-history";
export const FILTER_PRESET_STORAGE_KEY = "sui-read-filter-preset";
export const PINNED_QUERIES_STORAGE_KEY = "sui-read-pinned-queries";
export const EXCLUDED_KEYWORDS_STORAGE_KEY = "sui-read-excluded-keywords";
export const BLACKLIST_GROUPS_STORAGE_KEY = "sui-read-blacklist-groups";
export const CONTENT_SAFETY_SETTINGS_STORAGE_KEY = "sui-read-content-safety-settings";

export type BookmarkShelf = "to-read" | "favorite";
export type ReadingStatus = "unread" | "reading" | "finished";
export type ReadingProgress = { status: ReadingStatus; percent: number; chapter: string };
export type BookmarkSort = "saved-desc" | "saved-asc" | "author" | "words" | "updated";
export type BookmarkRecord = {
  url: string;
  result: SearchResult;
  rating: number;
  notes: string;
  tags: string[];
  shelf: BookmarkShelf;
  progress: ReadingProgress;
  savedAt: string;
  updatedAt: string;
};
export type BookmarkInput = Omit<BookmarkRecord, "savedAt" | "updatedAt" | "shelf" | "progress"> & { shelf?: BookmarkShelf; progress?: Partial<ReadingProgress> };

export type CpMapping = { alias: string; ao3Query: string; localQuery: string };
export type AgeConfirmation = "unknown" | "adult" | "minor";
export type ContentSafetySettings = { ageConfirmation: AgeConfirmation; blurRestrictedSummaries: boolean };
export type BlacklistGroup = { id: string; name: string; keywords: string[]; enabled: boolean };
export type BlacklistMatch = { groupId: string; groupName: string; keywords: string[] };
export type FullPersonalBackup = {
  version: 2;
  exportedAt: string;
  bookmarks: BookmarkRecord[];
  customCpMappings: CpMapping[];
  searchHistory: string[];
  pinnedQueries: string[];
  blacklistGroups: BlacklistGroup[];
  filterPreset: ResultViewFilters;
  contentSafetySettings: ContentSafetySettings;
};
export const DEFAULT_CONTENT_SAFETY_SETTINGS: ContentSafetySettings = { ageConfirmation: "unknown", blurRestrictedSummaries: true };
export const DEFAULT_CP_MAPPINGS: CpMapping[] = [
  { alias: "義忍", ao3Query: "Tomioka Giyuu/Kochou Shinobu", localQuery: "義忍 富岡義勇 胡蝶忍" },
  { alias: "五夏", ao3Query: "Gojo Satoru/Geto Suguru", localQuery: "五夏 五條悟 夏油傑" },
  { alias: "夏五", ao3Query: "Geto Suguru/Gojo Satoru", localQuery: "夏五 夏油傑 五條悟" },
  { alias: "勝出", ao3Query: "Bakugou Katsuki/Midoriya Izuku", localQuery: "勝出 爆豪勝己 綠谷出久" },
  { alias: "轟出", ao3Query: "Todoroki Shouto/Midoriya Izuku", localQuery: "轟出 轟焦凍 綠谷出久" },
  { alias: "佐櫻", ao3Query: "Uchiha Sasuke/Haruno Sakura", localQuery: "佐櫻 宇智波佐助 春野櫻" },
];

const DEFAULT_FILTERS: ResultViewFilters = { wordCount: "all", completion: "all", sort: "relevance", hideBookmarked: false };
const canUseStorage = () => typeof window !== "undefined" && Boolean(window.localStorage);
function readJson<T>(key: string, fallback: T): T { if (!canUseStorage()) return fallback; try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; } }
function writeJson<T>(key: string, value: T): void { if (canUseStorage()) window.localStorage.setItem(key, JSON.stringify(value)); persistDesktopPersonalValue(key, value); }
function normalizeShelf(value: unknown): BookmarkShelf { return value === "favorite" ? "favorite" : "to-read"; }
function normalizeProgress(value: unknown): ReadingProgress {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status: ReadingStatus = record.status === "reading" || record.status === "finished" ? record.status : "unread";
  const rawPercent = typeof record.percent === "number" && Number.isFinite(record.percent) ? record.percent : status === "finished" ? 100 : 0;
  return { status, percent: Math.max(0, Math.min(100, Math.round(rawPercent))), chapter: typeof record.chapter === "string" ? record.chapter.trim().slice(0, 80) : "" };
}

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
    progress: normalizeProgress(record.progress),
    savedAt: typeof record.savedAt === "string" ? record.savedAt : now,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : now,
  };
}

export function loadBookmarks(): BookmarkRecord[] { const records = readJson<unknown[]>(BOOKMARKS_STORAGE_KEY, []); return records.map(normalizeBookmark).filter((record): record is BookmarkRecord => Boolean(record)); }
export function persistBookmarks(bookmarks: BookmarkRecord[]): void { writeJson(BOOKMARKS_STORAGE_KEY, bookmarks); }
export function upsertBookmark(bookmarks: BookmarkRecord[], next: BookmarkInput): BookmarkRecord[] {
  const now = new Date().toISOString(); const existing = bookmarks.find((bookmark) => bookmark.url === next.url);
  const record: BookmarkRecord = { ...next, shelf: next.shelf || existing?.shelf || "to-read", progress: normalizeProgress(next.progress || existing?.progress), savedAt: existing?.savedAt || now, updatedAt: now };
  return [record, ...bookmarks.filter((bookmark) => bookmark.url !== next.url)];
}
export function filterBookmarks(bookmarks: BookmarkRecord[], query: string, platform: string, shelf: BookmarkShelf | "all", tag: string): BookmarkRecord[] {
  const needle = query.trim().toLocaleLowerCase();
  return bookmarks.filter((bookmark) => {
    const haystack = [bookmark.result.title, bookmark.result.author, bookmark.result.summary, bookmark.result.platform, ...bookmark.tags].join(" ").toLocaleLowerCase();
    return (!needle || haystack.includes(needle)) && (platform === "all" || bookmark.result.platform === platform) && (shelf === "all" || bookmark.shelf === shelf) && (!tag || bookmark.tags.includes(tag));
  });
}
export function sortBookmarks(bookmarks: BookmarkRecord[], sort: BookmarkSort): BookmarkRecord[] {
  return [...bookmarks].sort((left, right) => {
    if (sort === "saved-asc") return left.savedAt.localeCompare(right.savedAt);
    if (sort === "author") return left.result.author.localeCompare(right.result.author, "zh-Hant");
    if (sort === "words") return Number((right.result.wordCount || "").replace(/\D/g, "")) - Number((left.result.wordCount || "").replace(/\D/g, ""));
    if (sort === "updated") return (right.result.updatedAt || right.updatedAt).localeCompare(left.result.updatedAt || left.updatedAt);
    return right.savedAt.localeCompare(left.savedAt);
  });
}
export function updateBookmarksBatch(bookmarks: BookmarkRecord[], urls: string[], patch: { shelf?: BookmarkShelf; tags?: string[]; tagMode?: "replace" | "append" }): BookmarkRecord[] {
  const targets = new Set(urls);
  const now = new Date().toISOString();
  const batchTags = Array.isArray(patch.tags) ? normalizeExcludedKeywordList(patch.tags) : undefined;
  return bookmarks.map((bookmark) => !targets.has(bookmark.url) ? bookmark : {
    ...bookmark,
    shelf: patch.shelf || bookmark.shelf,
    tags: batchTags ? patch.tagMode === "append" ? Array.from(new Set([...bookmark.tags, ...batchTags])) : batchTags : bookmark.tags,
    updatedAt: now,
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
export function clearSearchHistory(): void { if (canUseStorage()) window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY); persistDesktopPersonalValue(SEARCH_HISTORY_STORAGE_KEY, []); }
export function loadPinnedQueries(): string[] { const queries = readJson<string[]>(PINNED_QUERIES_STORAGE_KEY, []); return Array.isArray(queries) ? queries.filter((query) => typeof query === "string" && Boolean(query.trim())).slice(0, 12) : []; }
export function togglePinnedQuery(queries: string[], value: string): string[] { const query = value.trim(); return !query ? queries : queries.includes(query) ? queries.filter((item) => item !== query) : [query, ...queries].slice(0, 12); }
export function persistPinnedQueries(queries: string[]): void { writeJson(PINNED_QUERIES_STORAGE_KEY, queries); }
export function normalizeExcludedKeywordList(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .flatMap((value) => value.split(/[，,\n]/))
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}
export function loadExcludedKeywords(): string[] { const values = readJson<string[]>(EXCLUDED_KEYWORDS_STORAGE_KEY, []); return Array.isArray(values) ? normalizeExcludedKeywordList(values) : []; }
export function persistExcludedKeywords(values: string[]): void { writeJson(EXCLUDED_KEYWORDS_STORAGE_KEY, normalizeExcludedKeywordList(values)); }
function normalizeBlacklistGroup(value: unknown, index = 0): BlacklistGroup | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim().slice(0, 40) : "";
  const keywords = Array.isArray(record.keywords) ? normalizeExcludedKeywordList(record.keywords.filter((item): item is string => typeof item === "string")) : [];
  if (!name) return null;
  return { id: typeof record.id === "string" && record.id.trim() ? record.id.trim().slice(0, 80) : `group-${index}-${name.toLocaleLowerCase().replace(/\s+/g, "-")}`, name, keywords, enabled: record.enabled !== false };
}
function normalizeBlacklistGroups(value: unknown): BlacklistGroup[] { return Array.isArray(value) ? value.map(normalizeBlacklistGroup).filter((group): group is BlacklistGroup => Boolean(group)).slice(0, 20) : []; }
export function defaultBlacklistGroups(values: string[] = []): BlacklistGroup[] { const keywords = normalizeExcludedKeywordList(values); return keywords.length ? [{ id: "general", name: "通用避雷", keywords, enabled: true }] : []; }
export function loadBlacklistGroups(): BlacklistGroup[] { const groups = normalizeBlacklistGroups(readJson<unknown>(BLACKLIST_GROUPS_STORAGE_KEY, [])); return groups.length || (canUseStorage() && window.localStorage.getItem(BLACKLIST_GROUPS_STORAGE_KEY) !== null) ? groups : defaultBlacklistGroups(loadExcludedKeywords()); }
export function activeBlacklistKeywords(groups: BlacklistGroup[]): string[] { return normalizeExcludedKeywordList(groups.filter((group) => group.enabled).flatMap((group) => group.keywords)); }
export function persistBlacklistGroups(groups: BlacklistGroup[]): void { const normalized = normalizeBlacklistGroups(groups); writeJson(BLACKLIST_GROUPS_STORAGE_KEY, normalized); persistExcludedKeywords(activeBlacklistKeywords(normalized)); }
export function upsertBlacklistGroup(groups: BlacklistGroup[], next: Omit<BlacklistGroup, "id"> & { id?: string }): BlacklistGroup[] { const group = normalizeBlacklistGroup({ ...next, id: next.id || `group-${Date.now()}` }); return !group ? groups : [group, ...groups.filter((item) => item.id !== group.id)]; }
export function updateBlacklistGroup(groups: BlacklistGroup[], id: string, patch: Partial<Omit<BlacklistGroup, "id">>): BlacklistGroup[] { return groups.map((group) => group.id === id ? normalizeBlacklistGroup({ ...group, ...patch }) || group : group); }
export function removeBlacklistGroup(groups: BlacklistGroup[], id: string): BlacklistGroup[] { return groups.filter((group) => group.id !== id); }
function normalizeContentSafetySettings(value: Partial<ContentSafetySettings> | null | undefined): ContentSafetySettings {
  return {
    ageConfirmation: value?.ageConfirmation === "adult" || value?.ageConfirmation === "minor" ? value.ageConfirmation : "unknown",
    blurRestrictedSummaries: value?.blurRestrictedSummaries !== false,
  };
}
export function loadContentSafetySettings(): ContentSafetySettings { return normalizeContentSafetySettings(readJson<Partial<ContentSafetySettings>>(CONTENT_SAFETY_SETTINGS_STORAGE_KEY, DEFAULT_CONTENT_SAFETY_SETTINGS)); }
export function persistContentSafetySettings(settings: ContentSafetySettings): void { writeJson(CONTENT_SAFETY_SETTINGS_STORAGE_KEY, normalizeContentSafetySettings(settings)); }
function normalizeFilterPreset(value: Partial<ResultViewFilters>): ResultViewFilters { return { wordCount: value.wordCount === "short" || value.wordCount === "medium" || value.wordCount === "long" ? value.wordCount : "all", completion: value.completion === "complete" || value.completion === "ongoing" ? value.completion : "all", sort: value.sort === "updated" || value.sort === "words" ? value.sort : "relevance", hideBookmarked: value.hideBookmarked === true }; }
export function loadFilterPreset(): ResultViewFilters { return normalizeFilterPreset(readJson<Partial<ResultViewFilters>>(FILTER_PRESET_STORAGE_KEY, DEFAULT_FILTERS)); }
export function persistFilterPreset(filters: ResultViewFilters): void { writeJson(FILTER_PRESET_STORAGE_KEY, filters); }

export type PersonalLibrarySnapshot = {
  bookmarks: BookmarkRecord[];
  customCpMappings: CpMapping[];
  searchHistory: string[];
  pinnedQueries: string[];
  excludedKeywords: string[];
  blacklistGroups: BlacklistGroup[];
  filterPreset: ResultViewFilters;
  contentSafetySettings: ContentSafetySettings;
};

async function hydrateValue<T>(key: string, localValue: T): Promise<T> {
  const desktopValue = await readDesktopPersonalValue<T>(key);
  if (desktopValue !== undefined) {
    if (canUseStorage()) window.localStorage.setItem(key, JSON.stringify(desktopValue));
    return desktopValue;
  }
  persistDesktopPersonalValue(key, localValue);
  return localValue;
}

export async function hydratePersonalLibrary(): Promise<PersonalLibrarySnapshot> {
  const [rawBookmarks, rawMappings, rawHistory, rawPins, rawExcluded, rawBlacklistGroups, rawFilters, rawContentSafety] = await Promise.all([
    hydrateValue<unknown[]>(BOOKMARKS_STORAGE_KEY, readJson<unknown[]>(BOOKMARKS_STORAGE_KEY, [])),
    hydrateValue<unknown>(CP_MAP_STORAGE_KEY, loadCustomCpMappings()),
    hydrateValue<string[]>(SEARCH_HISTORY_STORAGE_KEY, loadSearchHistory()),
    hydrateValue<string[]>(PINNED_QUERIES_STORAGE_KEY, loadPinnedQueries()),
    hydrateValue<string[]>(EXCLUDED_KEYWORDS_STORAGE_KEY, loadExcludedKeywords()),
    hydrateValue<unknown>(BLACKLIST_GROUPS_STORAGE_KEY, loadBlacklistGroups()),
    hydrateValue<Partial<ResultViewFilters>>(FILTER_PRESET_STORAGE_KEY, loadFilterPreset()),
    hydrateValue<Partial<ContentSafetySettings>>(CONTENT_SAFETY_SETTINGS_STORAGE_KEY, loadContentSafetySettings()),
  ]);
  return {
    bookmarks: Array.isArray(rawBookmarks) ? rawBookmarks.map(normalizeBookmark).filter((record): record is BookmarkRecord => Boolean(record)) : [],
    customCpMappings: normalizeCpMappings(rawMappings),
    searchHistory: Array.isArray(rawHistory) ? rawHistory.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).slice(0, 10) : [],
    pinnedQueries: Array.isArray(rawPins) ? rawPins.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim())).slice(0, 12) : [],
    excludedKeywords: Array.isArray(rawExcluded) ? normalizeExcludedKeywordList(rawExcluded) : [],
    blacklistGroups: normalizeBlacklistGroups(rawBlacklistGroups).length ? normalizeBlacklistGroups(rawBlacklistGroups) : defaultBlacklistGroups(Array.isArray(rawExcluded) ? rawExcluded : []),
    filterPreset: normalizeFilterPreset(rawFilters || DEFAULT_FILTERS),
    contentSafetySettings: normalizeContentSafetySettings(rawContentSafety),
  };
}

export function serializeFullPersonalBackup(data: Omit<FullPersonalBackup, "version" | "exportedAt">): string {
  return JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), ...data }, null, 2);
}

export function parseFullPersonalBackup(text: string): FullPersonalBackup | null {
  try {
    const raw = JSON.parse(text) as Partial<FullPersonalBackup> & { excludedKeywords?: unknown };
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.bookmarks)) return null;
    const groups = normalizeBlacklistGroups(raw.blacklistGroups);
    return {
      version: 2,
      exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : new Date().toISOString(),
      bookmarks: raw.bookmarks.map(normalizeBookmark).filter((record): record is BookmarkRecord => Boolean(record)),
      customCpMappings: normalizeCpMappings(raw.customCpMappings),
      searchHistory: Array.isArray(raw.searchHistory) ? raw.searchHistory.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 10) : [],
      pinnedQueries: Array.isArray(raw.pinnedQueries) ? raw.pinnedQueries.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 12) : [],
      blacklistGroups: groups.length ? groups : defaultBlacklistGroups(Array.isArray(raw.excludedKeywords) ? raw.excludedKeywords.filter((item: unknown): item is string => typeof item === "string") : []),
      filterPreset: normalizeFilterPreset(raw.filterPreset || DEFAULT_FILTERS),
      contentSafetySettings: normalizeContentSafetySettings(raw.contentSafetySettings),
    };
  } catch { return null; }
}
