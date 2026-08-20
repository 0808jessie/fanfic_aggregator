import { CheckSquare, Download, FileJson, FileSpreadsheet, FileText, LayoutGrid, List, ListFilter, RotateCw, Search, Trash2, Upload } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { SavedBookmarksGrid } from "@/components/PersonalLibrary";
import {
  bookmarksToCsv,
  bookmarksToMarkdown,
  filterBookmarks,
  parseBookmarkImport,
  sortBookmarks,
  serializeBookmarksJson,
  type BookmarkRecord,
  type BookmarkShelf,
  type BookmarkSort,
} from "@/lib/personalLibrary";

type ExportFormat = "json" | "markdown" | "csv";
type BookshelfViewMode = "cards" | "list";
type BookshelfViewProps = {
  bookmarks: BookmarkRecord[];
  onEdit: (record: BookmarkRecord) => void;
  onRemove: (url: string) => void;
  onImport: (records: BookmarkRecord[]) => void;
  onBatchRemove: (urls: string[]) => void;
  onBatchUpdate: (urls: string[], patch: { shelf?: BookmarkShelf; tags?: string[]; tagMode?: "replace" | "append" }) => void;
  onProgressChange: (url: string, progress: BookmarkRecord["progress"]) => void;
  onExportAll: () => void;
  onImportAll: (text: string) => void;
  desktopVersion?: string;
  updateCheckPending?: boolean;
  onCheckForUpdates?: () => void;
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

export function BookshelfView({ bookmarks, onEdit, onRemove, onImport, onBatchRemove, onBatchUpdate, onProgressChange, onExportAll, onImportAll, desktopVersion, updateCheckPending = false, onCheckForUpdates }: BookshelfViewProps) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [shelf, setShelf] = useState<BookmarkShelf | "all">("all");
  const [tag, setTag] = useState("");
  const [sort, setSort] = useState<BookmarkSort>("saved-desc");
  const [format, setFormat] = useState<ExportFormat>("json");
  const [viewMode, setViewMode] = useState<BookshelfViewMode>(() => typeof window !== "undefined" && window.localStorage.getItem("fanfic-atlas-bookshelf-view") === "list" ? "list" : "cards");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [batchShelf, setBatchShelf] = useState<BookmarkShelf>("to-read");
  const [batchTags, setBatchTags] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const fullImportRef = useRef<HTMLInputElement>(null);
  const platforms = useMemo(() => Array.from(new Set(bookmarks.map((bookmark) => bookmark.result.platform))).sort(), [bookmarks]);
  const tags = useMemo(() => Array.from(new Set(bookmarks.flatMap((bookmark) => bookmark.tags))).sort(), [bookmarks]);
  const visibleBookmarks = useMemo(() => sortBookmarks(filterBookmarks(bookmarks, query, platform, shelf, tag), sort), [bookmarks, query, platform, shelf, tag, sort]);
  const selectedVisibleUrls = visibleBookmarks.map((bookmark) => bookmark.url).filter((url) => selectedUrls.has(url));

  useEffect(() => {
    window.localStorage.setItem("fanfic-atlas-bookshelf-view", viewMode);
  }, [viewMode]);

  const toggleSelected = (url: string) => setSelectedUrls((current) => {
    const next = new Set(current);
    if (next.has(url)) next.delete(url); else next.add(url);
    return next;
  });
  const toggleAllVisible = () => setSelectedUrls((current) => selectedVisibleUrls.length === visibleBookmarks.length && visibleBookmarks.length ? new Set(Array.from(current).filter((url) => !visibleBookmarks.some((bookmark) => bookmark.url === url))) : new Set([...Array.from(current), ...visibleBookmarks.map((bookmark) => bookmark.url)]));
  const exitSelection = () => { setSelectionMode(false); setSelectedUrls(new Set()); };
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
  const importAll = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onImportAll(String(reader.result || ""));
    reader.readAsText(file, "utf-8");
  };
  const runBatch = (patch: { shelf?: BookmarkShelf; tags?: string[]; tagMode?: "replace" | "append" }) => {
    if (!selectedUrls.size) return;
    onBatchUpdate(Array.from(selectedUrls), patch);
    exitSelection();
  };

  return <section className="space-y-4">
    <div className="reader-library-toolbar grid gap-3 p-5 lg:grid-cols-[1.2fr_repeat(4,0.62fr)_auto] lg:items-end">
      <label className="grid gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">搜尋藏書<div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--atlas-muted)]" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="標題、作者、標籤或摘要" className="h-10 rounded-xl border-[color:var(--atlas-line)] bg-white/80 pl-9 text-sm text-slate-700 dark:text-slate-200" /></div></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">來源<select value={platform} onChange={(event) => setPlatform(event.target.value)} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white/80 px-2 text-sm text-slate-700 dark:text-slate-200"><option value="all">全部平台</option>{platforms.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">分類<select value={shelf} onChange={(event) => setShelf(event.target.value as BookmarkShelf | "all")} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white/80 px-2 text-sm text-slate-700 dark:text-slate-200"><option value="all">全部分類</option><option value="to-read">待讀</option><option value="favorite">最愛</option></select></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">自訂標籤<select value={tag} onChange={(event) => setTag(event.target.value)} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white/80 px-2 text-sm text-slate-700 dark:text-slate-200"><option value="">全部標籤</option>{tags.map((item) => <option key={item} value={item}>#{item}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">排序<select aria-label="藏書排序" value={sort} onChange={(event) => setSort(event.target.value as BookmarkSort)} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white/80 px-2 text-sm text-slate-700 dark:text-slate-200"><option value="saved-desc">收藏時間：新到舊</option><option value="saved-asc">收藏時間：舊到新</option><option value="author">作者名稱</option><option value="words">字數</option><option value="updated">更新時間</option></select></label>
      <div className="flex gap-2"><select aria-label="匯出格式" value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white/80 px-2 text-sm text-slate-700 dark:text-slate-200"><option value="json">JSON</option><option value="markdown">Markdown</option><option value="csv">CSV</option></select><Button type="button" onClick={exportList} disabled={!visibleBookmarks.length} className="h-10 rounded-xl bg-[color:var(--atlas-indigo)] px-3 text-sm font-semibold"><Download className="mr-1.5 h-3.5 w-3.5" />匯出</Button><Button type="button" variant="outline" onClick={() => importRef.current?.click()} className="h-10 rounded-xl border-[color:var(--atlas-line)] bg-white/70 px-3"><Upload className="h-3.5 w-3.5" /><span className="sr-only">匯入 JSON 書單</span></Button><input ref={importRef} type="file" accept="application/json,.json" onChange={(event) => importList(event.target.files?.[0])} className="hidden" /></div>
    </div>
    <div className="reader-library-actions flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant={selectionMode ? "default" : "outline"} onClick={() => selectionMode ? exitSelection() : setSelectionMode(true)} className={`h-9 text-xs font-semibold ${selectionMode ? "bg-[color:var(--atlas-indigo)]" : "border-0 bg-[color:var(--atlas-elevated)]"}`}><CheckSquare className="mr-1.5 h-3.5 w-3.5" />{selectionMode ? "結束多選" : "批次多選"}</Button>{selectionMode && <><Button type="button" variant="outline" onClick={toggleAllVisible} className="h-9 border-0 bg-[color:var(--atlas-elevated)] text-xs font-semibold">全選目前 {visibleBookmarks.length} 筆</Button><span className="text-xs font-semibold text-[color:var(--atlas-indigo)]">已選 {selectedUrls.size} 筆</span></>}</div><div className="flex flex-wrap items-center gap-2"><div className="reader-segmented flex" aria-label="藏書閣檢視模式"><Button type="button" variant="ghost" aria-label="藏書閣卡片模式" aria-pressed={viewMode === "cards"} onClick={() => setViewMode("cards")} className={`h-8 rounded-lg px-3 text-xs font-semibold ${viewMode === "cards" ? "bg-white text-[color:var(--atlas-indigo)] shadow-sm" : "text-[color:var(--atlas-muted)]"}`}><LayoutGrid className="mr-1.5 h-3.5 w-3.5" />卡片模式</Button><Button type="button" variant="ghost" aria-label="藏書閣條列模式" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} className={`h-8 rounded-lg px-3 text-xs font-semibold ${viewMode === "list" ? "bg-white text-[color:var(--atlas-indigo)] shadow-sm" : "text-[color:var(--atlas-muted)]"}`}><List className="mr-1.5 h-3.5 w-3.5" />條列模式</Button></div>{onCheckForUpdates && <><Button type="button" variant="outline" onClick={onCheckForUpdates} disabled={updateCheckPending} className="h-9 border-0 bg-[color:var(--atlas-elevated)] text-xs font-semibold text-[color:var(--atlas-ink)]"><RotateCw className={`mr-1.5 h-3.5 w-3.5 ${updateCheckPending ? "animate-spin" : ""}`} />{updateCheckPending ? "檢查中" : "檢查更新"}</Button><span className="text-xs tabular-nums text-[color:var(--atlas-muted)]">v{desktopVersion}</span></>}<Button type="button" variant="outline" onClick={onExportAll} className="h-9 border-0 bg-[color:var(--atlas-indigo-soft)] text-xs font-semibold text-[color:var(--atlas-indigo)]"><FileJson className="mr-1.5 h-3.5 w-3.5" />匯出全部</Button><Button type="button" variant="outline" onClick={() => fullImportRef.current?.click()} className="h-9 border-0 bg-teal-50 text-xs font-semibold text-teal-700"><Upload className="mr-1.5 h-3.5 w-3.5" />完整還原</Button><input ref={fullImportRef} type="file" accept="application/json,.json" onChange={(event) => importAll(event.target.files?.[0])} className="hidden" /></div></div>
    {selectionMode && <div className="reader-selection-bar sticky bottom-4 z-30 p-4 backdrop-blur-xl"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[color:var(--atlas-indigo)]"><span className="inline-flex items-center gap-2"><ListFilter className="h-3.5 w-3.5" />已選取 {selectedUrls.size} 筆作品</span><Button type="button" variant="ghost" onClick={exitSelection} className="h-7 px-2 text-xs font-semibold text-[color:var(--atlas-muted)] hover:bg-white/70">退出批次模式</Button></div><div className="flex flex-col gap-2 lg:flex-row lg:items-center"><Button type="button" variant="outline" onClick={toggleAllVisible} className="h-9 border-0 bg-white/70 text-xs font-semibold">{selectedVisibleUrls.length === visibleBookmarks.length && visibleBookmarks.length ? "取消全選" : "全選目前篩選結果"}</Button><select aria-label="批次分類" value={batchShelf} onChange={(event) => setBatchShelf(event.target.value as BookmarkShelf)} className="h-9 border-0 bg-white px-2 text-xs"><option value="to-read">改為待讀</option><option value="favorite">改為最愛</option></select><Button type="button" onClick={() => runBatch({ shelf: batchShelf })} disabled={!selectedUrls.size} className="h-9 bg-[color:var(--atlas-indigo)] text-xs font-semibold">批次修改分類</Button><Input aria-label="批次標籤" value={batchTags} onChange={(event) => setBatchTags(event.target.value)} placeholder="加入標籤，以逗號分隔" className="h-9 max-w-xs border-0 bg-white text-xs" /><Button type="button" onClick={() => runBatch({ tags: batchTags.split(/[，,]/).map((value) => value.trim()).filter(Boolean), tagMode: "append" })} disabled={!selectedUrls.size || !batchTags.trim()} className="h-9 bg-slate-700 text-xs font-semibold">加入標籤</Button><Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(true)} disabled={!selectedUrls.size} className="h-9 border-0 bg-[color:var(--atlas-danger-soft)] text-xs font-semibold text-[color:var(--atlas-danger)]"><Trash2 className="mr-1.5 h-3.5 w-3.5" />批次刪除</Button></div></div>}
    <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--atlas-muted)]"><FileJson className="h-3.5 w-3.5 text-[color:var(--atlas-indigo)]" /><span>JSON 可還原書單</span><FileText className="ml-2 h-3.5 w-3.5 text-amber-600" /><span>Markdown 適用 Notion、Obsidian</span><FileSpreadsheet className="ml-2 h-3.5 w-3.5 text-[color:var(--atlas-success)]" /><span>CSV 適用表格</span><span className="ml-2 border-l border-[color:var(--atlas-line)] pl-2 text-[color:var(--atlas-indigo)]">完整備份包含進度、避雷與偏好</span></div>
    <SavedBookmarksGrid bookmarks={visibleBookmarks} onEdit={onEdit} onRemove={onRemove} selectionMode={selectionMode} selectedUrls={selectedUrls} onToggleSelected={toggleSelected} onProgressChange={onProgressChange} viewMode={viewMode} />
    <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}><AlertDialogContent className="rounded-2xl border-[color:var(--atlas-danger-line)] bg-[color:var(--atlas-surface)]"><AlertDialogHeader><div className="text-xs font-semibold text-[color:var(--atlas-danger)]">將從藏書閣移除</div><AlertDialogTitle>確認批次移除？</AlertDialogTitle><AlertDialogDescription>即將從藏書閣移除 {selectedUrls.size} 篇作品，此動作無法復原。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className="rounded-xl">保留作品</AlertDialogCancel><AlertDialogAction onClick={() => { onBatchRemove(Array.from(selectedUrls)); exitSelection(); setDeleteConfirmOpen(false); }} className="rounded-xl bg-[color:var(--atlas-danger)] hover:bg-[#a83f54]">確認移除 {selectedUrls.size} 筆</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
