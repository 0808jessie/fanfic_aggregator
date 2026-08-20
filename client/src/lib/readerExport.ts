import { strToU8, zipSync, type ZippableFile } from "fflate";
import type { ReaderDocument } from "@/components/ReaderView";
import type { BookmarkRecord } from "@/lib/personalLibrary";

export type ReaderExportItem = { bookmark: BookmarkRecord; document: ReaderDocument };

const xmlEscape = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", "\"": "&quot;" })[character] || character);
const xhtmlEscape = xmlEscape;

function safeText(value: unknown, fallback = "未命名作品"): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function simpleIdentifier(value: string): string {
  let hash = 5381;
  for (const character of value) hash = ((hash << 5) + hash) ^ character.codePointAt(0)!;
  return `urn:uuid:fanfic-atlas-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function recordTags(bookmark: BookmarkRecord): string {
  return [...bookmark.tags, ...(Array.isArray(bookmark.result.tags) ? bookmark.result.tags : String(bookmark.result.tags || "").split(/[，,]/))]
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, values) => values.indexOf(tag) === index)
    .join("、");
}

function documentParagraphs(document: ReaderDocument): string[] {
  return document.chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean));
}

function chapterTitle(document: ReaderDocument): string {
  return safeText(document.chapters[0]?.title, "正文");
}

export function buildReaderTxt(items: ReaderExportItem[], exportedAt = new Date()): string {
  const header = [
    "Fanfic Atlas 藏書閣 · 純文字匯出",
    `匯出時間：${exportedAt.toLocaleString("zh-TW")}`,
    `作品數：${items.length}`,
    "本檔案僅收錄可由來源公開頁面取得的閱讀段落；請遵守各來源平台的著作權與使用規範。",
  ].join("\n");
  const works = items.map(({ bookmark, document }, index) => [
    "=".repeat(64),
    `${index + 1}. ${safeText(document.title, safeText(bookmark.result.title))}`,
    `作者：${safeText(document.author, safeText(bookmark.result.author, "未知作者"))}`,
    `來源：${safeText(document.source, safeText(bookmark.result.platform, "Fanfic Atlas"))}`,
    `原始網址：${bookmark.url}`,
    recordTags(bookmark) ? `標籤：${recordTags(bookmark)}` : "",
    bookmark.result.summary?.trim() ? `簡介：${bookmark.result.summary.trim()}` : "",
    "",
    chapterTitle(document),
    "-".repeat(24),
    ...documentParagraphs(document),
  ].filter(Boolean).join("\n")).join("\n\n");
  return `${header}\n\n${works}\n`;
}

function generatedCoverSvg(title: string, author: string, index: number): string {
  const palette = [[79, 70, 229], [124, 58, 237], [190, 24, 93]][index % 3];
  const [red, green, blue] = palette;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1800" role="img" aria-label="${xmlEscape(title)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="rgb(${red},${green},${blue})"/><stop offset="1" stop-color="#111827"/></linearGradient></defs>
  <rect width="1200" height="1800" fill="url(#g)"/>
  <rect x="84" y="92" width="1032" height="1616" rx="24" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
  <text x="600" y="260" text-anchor="middle" fill="rgba(255,255,255,.72)" font-family="sans-serif" font-size="34" letter-spacing="8">FANFIC ATLAS</text>
  <foreignObject x="150" y="610" width="900" height="430"><div xmlns="http://www.w3.org/1999/xhtml" style="font:600 64px sans-serif;line-height:1.35;color:#fff;text-align:center;display:flex;height:100%;align-items:center;justify-content:center">${xhtmlEscape(title)}</div></foreignObject>
  <text x="600" y="1250" text-anchor="middle" fill="rgba(255,255,255,.85)" font-family="sans-serif" font-size="38">${xmlEscape(author)}</text>
  <text x="600" y="1530" text-anchor="middle" fill="rgba(255,255,255,.55)" font-family="sans-serif" font-size="26">OFFLINE READING EDITION</text>
</svg>`;
}

function bookXhtml(item: ReaderExportItem, index: number): string {
  const { bookmark, document } = item;
  const title = safeText(document.title, safeText(bookmark.result.title));
  const author = safeText(document.author, safeText(bookmark.result.author, "未知作者"));
  const paragraphs = documentParagraphs(document).map((paragraph) => `<p>${xhtmlEscape(paragraph)}</p>`).join("\n      ");
  const tags = recordTags(bookmark);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-Hant" lang="zh-Hant"><head><title>${xmlEscape(title)}</title><link rel="stylesheet" type="text/css" href="../styles/reader.css"/></head>
<body><article epub:type="chapter" xmlns:epub="http://www.idpf.org/2007/ops"><header><p class="eyebrow">${xmlEscape(document.source || bookmark.result.platform)}</p><h1>${xmlEscape(title)}</h1><p class="byline">${xmlEscape(author)}</p><p class="source">原始來源：<a href="${xmlEscape(bookmark.url)}">${xmlEscape(bookmark.url)}</a></p>${tags ? `<p class="tags">${xmlEscape(tags)}</p>` : ""}</header><section><h2>${xmlEscape(chapterTitle(document))}</h2>
      ${paragraphs || "<p>來源頁面未提供可匯出的正文段落。</p>"}
    </section></article></body></html>`;
}

function navXhtml(items: ReaderExportItem[]): string {
  const links = items.map(({ bookmark, document }, index) => `<li><a href="text/book-${String(index + 1).padStart(3, "0")}.xhtml">${xmlEscape(safeText(document.title, safeText(bookmark.result.title)))}</a></li>`).join("");
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-Hant" lang="zh-Hant"><head><title>目錄</title></head><body><nav epub:type="toc" id="toc"><h1>目錄</h1><ol>${links}</ol></nav></body></html>`;
}

export function buildReaderEpub(items: ReaderExportItem[], exportedAt = new Date()): Uint8Array {
  if (!items.length) throw new Error("請至少選取一篇可匯出的作品。");
  const title = `Fanfic Atlas 精選 ${items.length} 篇`;
  const identifier = simpleIdentifier(items.map(({ bookmark }) => bookmark.url).join("|"));
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="style" href="styles/reader.css" media-type="text/css"/>',
    ...items.flatMap((_, index) => {
      const number = String(index + 1).padStart(3, "0");
      return [`<item id="cover-${number}" href="covers/cover-${number}.svg" media-type="image/svg+xml"${index === 0 ? ' properties="cover-image"' : ""}/>`, `<item id="book-${number}" href="text/book-${number}.xhtml" media-type="application/xhtml+xml"/>`];
    }),
  ].join("\n    ");
  const spine = items.map((_, index) => `<itemref idref="book-${String(index + 1).padStart(3, "0")}"/>`).join("\n    ");
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0" xml:lang="zh-Hant"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">${xmlEscape(identifier)}</dc:identifier><dc:title>${xmlEscape(title)}</dc:title><dc:language>zh-Hant</dc:language><dc:creator>Fanfic Atlas</dc:creator><dc:date>${exportedAt.toISOString()}</dc:date><dc:description>由 Fanfic Atlas 自來源公開頁面整理的個人離線閱讀匯出。</dc:description><meta property="dcterms:modified">${exportedAt.toISOString().replace(/\.\d{3}Z$/, "Z")}</meta></metadata><manifest>
    ${manifest}
  </manifest><spine>
    ${spine}
  </spine></package>`;
  const css = "body{font-family:serif;line-height:1.9;margin:8%;color:#202124}h1{font-size:1.7em;line-height:1.35}h2{font-size:1.2em;margin-top:2.5em}.eyebrow{letter-spacing:.12em;font-size:.78em;color:#5b5f66}.byline,.source,.tags{font-size:.88em;color:#5b5f66}a{color:#3f51b5;word-break:break-all}p{margin:0 0 1.15em}header{border-bottom:1px solid #d9d9d9;padding-bottom:1.5em;margin-bottom:2.3em}";
  const files: Record<string, ZippableFile> = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 as const }],
    "META-INF/container.xml": strToU8("<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>"),
    "OEBPS/content.opf": strToU8(opf),
    "OEBPS/nav.xhtml": strToU8(navXhtml(items)),
    "OEBPS/styles/reader.css": strToU8(css),
  };
  items.forEach((item, index) => {
    const number = String(index + 1).padStart(3, "0");
    const workTitle = safeText(item.document.title, safeText(item.bookmark.result.title));
    const author = safeText(item.document.author, safeText(item.bookmark.result.author, "未知作者"));
    files[`OEBPS/covers/cover-${number}.svg`] = strToU8(generatedCoverSvg(workTitle, author, index));
    files[`OEBPS/text/book-${number}.xhtml`] = strToU8(bookXhtml(item, index));
  });
  return zipSync(files, { level: 6 });
}

export function readerExportFilename(extension: "txt" | "epub", exportedAt = new Date()): string {
  const stamp = exportedAt.toISOString().slice(0, 10).replaceAll("-", "");
  return `fanfic-atlas-reader-${stamp}.${extension}`;
}
