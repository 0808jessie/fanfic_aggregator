import type { ReaderChapter, ReaderDocument } from "@/components/ReaderView";

const CACHE_PREFIX = "fanfic-atlas-reader-cache:v1:";
const CACHE_INDEX_KEY = `${CACHE_PREFIX}index`;
const MAX_CACHE_ENTRIES = 24;
const MAX_DOCUMENT_BYTES = 500_000;

type CachedReaderDocument = { cachedAt: string; document: ReaderDocument };

export type ReaderCacheStats = {
  entryCount: number;
  byteSize: number;
};

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function cacheKey(url: string): string { return `${CACHE_PREFIX}${encodeURIComponent(url)}`; }

function normalizeChapter(value: unknown, requireParagraphs = true): ReaderChapter | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const paragraphs = Array.isArray(record.paragraphs) ? record.paragraphs.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
  if (!id || !title || (requireParagraphs && !paragraphs.length)) return null;
  return {
    id,
    title,
    paragraphs,
    index: typeof record.index === "number" && Number.isFinite(record.index) ? record.index : undefined,
    url: typeof record.url === "string" && record.url.trim() ? record.url : undefined,
  };
}

function normalizeDocument(value: unknown): ReaderDocument | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const url = typeof record.url === "string" ? record.url.trim() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const author = typeof record.author === "string" ? record.author.trim() : "";
  const source = typeof record.source === "string" ? record.source.trim() : "";
  const chapters = Array.isArray(record.chapters) ? record.chapters.map((chapter) => normalizeChapter(chapter, true)).filter((chapter): chapter is ReaderChapter => Boolean(chapter)) : [];
  // TOC entries intentionally omit body paragraphs. Normalizing them as chapter bodies
  // used to discard the entire Pixiv/Penana series menu on a cache hit.
  const tableOfContents = Array.isArray(record.tableOfContents) ? record.tableOfContents.map((chapter) => normalizeChapter(chapter, false)).filter((chapter): chapter is ReaderChapter => Boolean(chapter)) : undefined;
  if (!url || !title || !author || !source || !chapters.length) return null;
  return {
    url,
    title,
    author,
    source,
    chapters,
    coverUrl: typeof record.coverUrl === "string" && record.coverUrl.trim() ? record.coverUrl : null,
    seriesTitle: typeof record.seriesTitle === "string" && record.seriesTitle.trim() ? record.seriesTitle.trim() : null,
    tableOfContents: tableOfContents?.length ? tableOfContents : undefined,
    currentChapterIndex: typeof record.currentChapterIndex === "number" && Number.isFinite(record.currentChapterIndex) ? record.currentChapterIndex : 0,
  };
}

function readIndex(store: Storage): string[] {
  try {
    const value = JSON.parse(store.getItem(CACHE_INDEX_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  } catch {
    return [];
  }
}

function writeIndex(store: Storage, urls: string[]): void {
  try { store.setItem(CACHE_INDEX_KEY, JSON.stringify(urls)); } catch { /* Storage can be unavailable or full. */ }
}

function touchCacheEntry(store: Storage, url: string): void {
  const next = [url, ...readIndex(store).filter((item) => item !== url)].slice(0, MAX_CACHE_ENTRIES);
  for (const staleUrl of readIndex(store).slice(MAX_CACHE_ENTRIES - 1)) {
    if (!next.includes(staleUrl)) store.removeItem(cacheKey(staleUrl));
  }
  writeIndex(store, next);
}

/** Read a public chapter cached only for the current browser or desktop session. */
export function readCachedReaderDocument(url: string): ReaderDocument | null {
  const store = sessionStore();
  if (!store || !url.trim()) return null;
  try {
    const raw = JSON.parse(store.getItem(cacheKey(url)) || "null") as Partial<CachedReaderDocument> | null;
    const document = normalizeDocument(raw?.document);
    if (!document) {
      store.removeItem(cacheKey(url));
      return null;
    }
    touchCacheEntry(store, url);
    return document;
  } catch {
    return null;
  }
}

/** Cache a successfully parsed public chapter without retaining it beyond this session. */
export function cacheReaderDocument(url: string, document: ReaderDocument): void {
  const store = sessionStore();
  if (!store || !url.trim()) return;
  try {
    const payload = JSON.stringify({ cachedAt: new Date().toISOString(), document } satisfies CachedReaderDocument);
    if (payload.length > MAX_DOCUMENT_BYTES) return;
    store.setItem(cacheKey(url), payload);
    touchCacheEntry(store, url);
  } catch {
    // A quota error must never block the live reader or its source fallback.
  }
}

function storageByteLength(value: string): number {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

/** Return the live size of Reader documents stored for this browser or desktop session. */
export function getReaderCacheStats(): ReaderCacheStats {
  const store = sessionStore();
  if (!store) return { entryCount: 0, byteSize: 0 };
  const urls = Array.from(new Set(readIndex(store)));
  return urls.reduce<ReaderCacheStats>((stats, url) => {
    const raw = store.getItem(cacheKey(url));
    if (!raw) return stats;
    return { entryCount: stats.entryCount + 1, byteSize: stats.byteSize + storageByteLength(raw) };
  }, { entryCount: 0, byteSize: 0 });
}

/** Remove every cached chapter associated with one source URL while keeping other Reader sessions warm. */
export function clearReaderDocumentCache(url: string): void {
  const store = sessionStore();
  if (!store || !url.trim()) return;
  store.removeItem(cacheKey(url));
  writeIndex(store, readIndex(store).filter((item) => item !== url));
}

/** Clear the current-session Reader document pool and its LRU index. */
export function clearAllReaderDocumentCache(): void {
  const store = sessionStore();
  if (!store) return;
  const keys = Array.from({ length: store.length }, (_, index) => store.key(index)).filter((key): key is string => Boolean(key && key.startsWith(CACHE_PREFIX)));
  keys.forEach((key) => store.removeItem(key));
}
