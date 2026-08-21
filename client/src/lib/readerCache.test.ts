import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReaderDocument } from "@/components/ReaderView";
import { cacheReaderDocument, clearAllReaderDocumentCache, clearReaderDocumentCache, getReaderCacheStats, readCachedReaderDocument } from "@/lib/readerCache";

const seriesDocument: ReaderDocument = {
  url: "https://www.pixiv.net/novel/show.php?id=12298402",
  title: "第三篇：蝶影",
  author: "測試作者",
  source: "Pixiv",
  seriesTitle: "《鬼滅之刃》富岡義勇x胡蝶忍",
  currentChapterIndex: 2,
  chapters: [{ id: "12298402", title: "第三篇：蝶影", index: 3, url: "https://www.pixiv.net/novel/show.php?id=12298402", paragraphs: ["公開正文。"] }],
  tableOfContents: [
    { id: "12298400", title: "第一篇", index: 1, url: "https://www.pixiv.net/novel/show.php?id=12298400", paragraphs: [] },
    { id: "12298401", title: "第二篇", index: 2, url: "https://www.pixiv.net/novel/show.php?id=12298401", paragraphs: [] },
    { id: "12298402", title: "第三篇：蝶影", index: 3, url: "https://www.pixiv.net/novel/show.php?id=12298402", paragraphs: [] },
  ],
};

describe("Reader session cache", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    clearAllReaderDocumentCache();
  });

  it("keeps a Pixiv series TOC, series title, and active chapter position on a cache hit", () => {
    cacheReaderDocument(seriesDocument.url, seriesDocument);

    expect(readCachedReaderDocument(seriesDocument.url)).toMatchObject({
      seriesTitle: "《鬼滅之刃》富岡義勇x胡蝶忍",
      currentChapterIndex: 2,
      tableOfContents: [
        { title: "第一篇", paragraphs: [] },
        { title: "第二篇", paragraphs: [] },
        { title: "第三篇：蝶影", paragraphs: [] },
      ],
    });
  });

  it("reports bytes and supports clearing one work or the full reader cache", () => {
    cacheReaderDocument(seriesDocument.url, seriesDocument);
    expect(getReaderCacheStats()).toMatchObject({ entryCount: 1 });
    expect(getReaderCacheStats().byteSize).toBeGreaterThan(0);

    clearReaderDocumentCache(seriesDocument.url);
    expect(getReaderCacheStats()).toEqual({ entryCount: 0, byteSize: 0 });

    cacheReaderDocument(seriesDocument.url, seriesDocument);
    clearAllReaderDocumentCache();
    expect(readCachedReaderDocument(seriesDocument.url)).toBeNull();
  });
});
