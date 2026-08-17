import { Download, FileJson, FileSpreadsheet, FileText, Search, Upload } from "lucide-react";
import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SavedBookmarksGrid } from "@/components/PersonalLibrary";
import {
  bookmarksToCsv,
  bookmarksToMarkdown,
  filterBookmarks,
  parseBookmarkImport,
  serializeBookmarksJson,
  type BookmarkRecord,
  type BookmarkShelf,
} from "@/lib/personalLibrary";

type ExportFormat = "json" | "markdown" | "csv";

type BookshelfViewProps = {
  bookmarks: BookmarkRecord[];
  onEdit: (record: BookmarkRecord) => void;
  onRemove: (url: string) => void;
  onImport: (records: BookmarkRecord[]) => void;
};

function downloadFile(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function BookshelfView({ bookmarks, onEdit, onRemove, onImport }: BookshelfViewProps) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shelf, setShelf] = useState<BookmarkShelf | "all">("all");
  const [tag, setTag] = useState("");
  const [format, setFormat] = useState<ExportFormat>("json");
  const inputRef = useRef<HTMLInputElement>(null);
  const platforms = useMemo(() => Array.from(new Set(bookmarks.map((bookmark) => bookmark.result.platform))).sort(), [bookmarks]);
  const tags = useMemo(() => Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tags))).sort(), [bookmarks]);
  const visibleBookmarks = useMemo(() => filterBookmarks(bookmarks, query, platform, shelf, tag), [bookmarks, query, platform, shelf, tag]);

  const exportList = () => {
    if (format === "json") downloadFile("fanfic-atlas-bookshelf.json", serializeBookmarksJson(visibleBookmarks), "application/json");
    if (format === "markdown") downloadFile("fanfic-atlas-bookshelf.md", bookmarksToMarkdown(visibleBookmarks), "text/markdown");
    if (format === "csv") downloadFile("fanfic-atlas-bookshelf.csv", bookmarksToCsv(visibleBookmarks), "text/csv");
  };
  const importList = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImport(parseBookmarkImport(String(reader.result || "")));
    reader.readAsText(file, "utf-8");
  };

  return <section className="space-y-4">
    <div className="atlas-panel grid gap-3 p-4 lg:grid-cols-[1.3fr_repeat(3,0.65fr)_auto] lg:items-end">
      <label className="grid gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#61707a]">搜尋藏書
        <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#75838b]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="標題、作者、標籤或摘要" className="h-10 border-[#111826]/15 bg-white pl-9 text-sm" /></div>
      </label>
      <label className="grid gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#61707a]">來源
        <select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-10 border border-[#111826]/15 bg-white px-2 text-sm"><option value="all">全部平台</option>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select>
      </label>
      <label className="grid gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#61707a]">分類
        <select value={shelf} onChange={(event) => setShelf(event.target.value as BookmarkShelf | "all")} className="h-10 border border-[#111826]/15 bg-white px-2 text-sm"><option value="all">全部分類</option><option value="to-read">待讀</option><option value="favorite">最愛</option></select>
      </label>
      <label className="grid gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#61707a]">自訂標籤
        <select value={tag} onChange={(event) => setTag(event.target.value)} className="h-10 border border-[#111826]/15 bg-white px-2 text-sm"><option value="">全部標籤</option>{tags.map((item) => <option key={item} value={item}>#{item}</option>)}</select>
      </label>
      <div className="flex gap-2"><select aria-label="匯出格式" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="h-10 border border-[#111826]/15 bg-white px-2 text-xs"><option value="json">JSON</option><option value="markdown">Markdown</option><option value="csv">CSV</option></select><Button type="button" onClick={exportList} disabled={!visibleBookmarks.length} className="h-10 rounded-none bg-[#111826] px-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em]"><Download className="mr-1.5 h-3.5 w-3.5" />匯出</Button><Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="h-10 rounded-none border-[#111826]/15 px-3"><Upload className="h-3.5 w-3.5" /><span className="sr-only">匯入 JSON 書單</span></Button><input ref={inputRef} type="file" accept="application/json,.json" onChange={(event) => importList(event.target.files?.[0])} className="hidden" /></div>
    </div>
    <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.13em] text-[#75838b]"><FileJson className="h-3.5 w-3.5 text-[#2d70d6]" /><span>JSON 可還原完整資料</span><FileText className="ml-2 h-3.5 w-3.5 text-[#e76f51]" /><span>Markdown 適用 Notion / Obsidian</span><FileSpreadsheet className="ml-2 h-3.5 w-3.5 text-[#197b75]" /><span>CSV 適用表格整理</span></div>
    <SavedBookmarksGrid bookmarks={visibleBookmarks} onEdit={onEdit} onRemove={onRemove} />
  </section>;
}
