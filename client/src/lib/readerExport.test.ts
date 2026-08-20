import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { buildReaderEpub, buildReaderTxt, readerExportFilename } from "./readerExport";

const item = {
  bookmark: {
    url: "https://archiveofourown.org/works/42",
    result: { id: "ao3:42", title: "雨後", author: "測試作者", platform: "AO3", summary: "一段簡介", tags: "義忍, 現代", language: "zh" },
    rating: 0, notes: "", tags: ["最愛"], shelf: "favorite" as const, progress: { status: "reading" as const, percent: 20, chapter: "第一章" }, savedAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
  },
  document: { url: "https://archiveofourown.org/works/42", title: "雨後", author: "測試作者", source: "AO3", coverUrl: null, chapters: [{ id: "chapter-1", title: "第一章", paragraphs: ["第一段正文。", "第二段正文。"] }] },
};

describe("reader exports", () => {
  it("creates an attributed UTF-8 text anthology", () => {
    const text = buildReaderTxt([item], new Date("2026-08-20T00:00:00.000Z"));
    expect(text).toContain("雨後");
    expect(text).toContain("https://archiveofourown.org/works/42");
    expect(text).toContain("第一段正文。");
  });

  it("creates a valid EPUB container with uncompressed mimetype, metadata, navigation, cover and chapter", () => {
    const archive = unzipSync(buildReaderEpub([item], new Date("2026-08-20T00:00:00.000Z")));
    expect(strFromU8(archive.mimetype)).toBe("application/epub+zip");
    expect(strFromU8(archive["META-INF/container.xml"])).toContain("OEBPS/content.opf");
    expect(strFromU8(archive["OEBPS/content.opf"])).toContain("Fanfic Atlas 精選 1 篇");
    expect(strFromU8(archive["OEBPS/nav.xhtml"])).toContain("雨後");
    expect(strFromU8(archive["OEBPS/covers/cover-001.svg"])).toContain("測試作者");
    expect(strFromU8(archive["OEBPS/text/book-001.xhtml"])).toContain("第一段正文。");
  });

  it("uses a stable dated filename", () => {
    expect(readerExportFilename("epub", new Date("2026-08-20T00:00:00.000Z"))).toBe("fanfic-atlas-reader-20260820.epub");
  });
});
