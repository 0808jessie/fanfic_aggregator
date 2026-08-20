import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isCustomCpMapping, upsertCpMapping, type BookmarkRecord, type BookmarkShelf, type CpMapping } from "@/lib/personalLibrary";
import type { SearchResult } from "@/lib/searchResults";
import { DEFAULT_TROPE_MAPPINGS } from "@/lib/tropeMappings";
import { BlueprintCover } from "@/components/BlueprintCover";
import { ArrowUpRight, Bookmark, CheckSquare, Pencil, Plus, Search, Star, Tag, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";

type BookmarkEditorDialogProps = {
  open: boolean;
  result: SearchResult | null;
  existing: BookmarkRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (record: { result: SearchResult; rating: number; notes: string; tags: string[]; shelf: BookmarkShelf }) => void;
  onRemove: (url: string) => void;
};

export function BookmarkEditorDialog({
  open,
  result,
  existing,
  onOpenChange,
  onSave,
  onRemove,
}: BookmarkEditorDialogProps) {
  const [rating, setRating] = useState(0);
  const [notes, setNotes] = useState("");
  const [tagText, setTagText] = useState("");
  const [shelf, setShelf] = useState<BookmarkShelf>("to-read");

  useEffect(() => {
    setRating(existing?.rating || 0);
    setNotes(existing?.notes || "");
    setTagText(existing?.tags.join(", ") || "");
    setShelf(existing?.shelf || "to-read");
  }, [existing, result?.url, open]);

  const save = () => {
    if (!result) return;
    onSave({
      result,
      rating,
      notes: notes.trim(),
      tags: tagText.split(",").map((tag) => tag.trim()).filter(Boolean),
      shelf,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)] p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[color:var(--atlas-line)] px-6 py-5 text-left">
          <div className="flex items-center gap-2 text-xs font-semibold text-[color:var(--atlas-indigo)]"><Bookmark className="h-3.5 w-3.5" />儲存在這台裝置</div>
          <DialogTitle className="pt-1 text-xl font-extrabold">{result?.title || "收藏作品"}</DialogTitle>
          <DialogDescription className="text-[color:var(--atlas-muted)]">可加入個人評分、心得與標籤，讓下一次重讀更容易找到它。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2 text-xs font-semibold text-[color:var(--atlas-muted)]">個人評分</div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="個人評分">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} 星`} className="p-1 text-[#e76f51] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d70d6]">
                  <Star className="h-6 w-6" fill={value <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold text-[color:var(--atlas-muted)]">{rating ? `${rating} / 5` : "未評分"}</span>
            </div>
          </div>
          <label className="grid gap-2 text-xs font-semibold text-[color:var(--atlas-muted)]">個人筆記
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="記下想重讀的段落、避雷或閱讀感想…" className="resize-y rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 py-3 font-sans text-sm font-normal text-[color:var(--atlas-ink)] outline-none focus:border-[color:var(--atlas-indigo)]" />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-[color:var(--atlas-muted)]">自訂標籤
            <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="神作, 重讀, 避雷" className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 font-sans text-sm font-normal text-[color:var(--atlas-ink)] outline-none focus:border-[color:var(--atlas-indigo)]" />
          </label>
          <label className="grid gap-2 text-xs font-semibold text-[color:var(--atlas-muted)]">藏書分類
            <select value={shelf} onChange={(event) => setShelf(event.target.value as BookmarkShelf)} className="h-10 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 font-sans text-sm font-normal text-[color:var(--atlas-ink)] outline-none focus:border-[color:var(--atlas-indigo)]"><option value="to-read">待讀</option><option value="favorite">最愛</option></select>
          </label>
        </div>
        <DialogFooter className="border-t border-[color:var(--atlas-line)] bg-white/30 px-6 py-4 sm:justify-between">
          {existing ? <Button type="button" variant="ghost" onClick={() => { onRemove(existing.url); onOpenChange(false); }} className="rounded-xl text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)] hover:text-[color:var(--atlas-danger)]"><Trash2 className="mr-2 h-4 w-4" />取消收藏</Button> : <span />}
          <Button type="button" onClick={save} className="rounded-xl bg-[color:var(--atlas-indigo)] text-sm font-semibold text-white hover:bg-[#4338ca]">儲存閱讀卡</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CpMappingLibraryPageProps = {
  mappings: CpMapping[];
  customMappings: CpMapping[];
  onChange: (customMappings: CpMapping[]) => void;
};

export function CpMappingLibraryPage({ mappings, customMappings, onChange }: CpMappingLibraryPageProps) {
  const [alias, setAlias] = useState("");
  const [ao3Query, setAo3Query] = useState("");
  const [localQuery, setLocalQuery] = useState("");
  const [japaneseQuery, setJapaneseQuery] = useState("");
  const [editingAlias, setEditingAlias] = useState<string | null>(null);
  const [inlineEditorKey, setInlineEditorKey] = useState<string | null>(null);
  const [mappingFilter, setMappingFilter] = useState("");

  const reset = () => { setAlias(""); setAo3Query(""); setLocalQuery(""); setJapaneseQuery(""); setEditingAlias(null); };
  const openEditor = (mapping?: CpMapping) => {
    setEditingAlias(mapping?.alias || null);
    setAlias(mapping?.alias || "");
    setAo3Query(mapping?.ao3Query || "");
    setLocalQuery(mapping?.localQuery || "");
    setJapaneseQuery(mapping?.japaneseQuery || "");
    setInlineEditorKey(mapping?.alias || "__new__");
  };
  const closeEditor = () => { setInlineEditorKey(null); reset(); };
  const save = () => {
    if (!alias.trim() || !ao3Query.trim() || !localQuery.trim()) return;
    onChange(upsertCpMapping(customMappings, { alias, ao3Query, localQuery, japaneseQuery }, editingAlias || undefined));
    closeEditor();
  };
  const resetToDefaults = () => { onChange([]); reset(); };
  const normalizedFilter = mappingFilter.trim().toLocaleLowerCase();
  const visibleMappings = normalizedFilter
    ? mappings.filter((mapping) => [mapping.alias, mapping.ao3Query, mapping.localQuery, mapping.japaneseQuery].join(" ").toLocaleLowerCase().includes(normalizedFilter))
    : mappings;
  const renderInlineEditor = () => (
    <div className="grid grid-cols-1 gap-3 border-y border-[color:var(--atlas-line)] bg-[color:var(--atlas-elevated)]/55 px-4 py-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">中文縮寫<input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例：義忍" className="h-10 min-w-0 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 text-sm font-normal text-slate-700 dark:text-slate-200 outline-none transition-colors focus:border-[color:var(--atlas-indigo)]" /></label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">AO3 關係標籤<input value={ao3Query} onChange={(event) => setAo3Query(event.target.value)} placeholder="例：Uchiha Sasuke/Haruno Sakura" className="h-10 min-w-0 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 text-sm font-normal text-slate-700 dark:text-slate-200 outline-none transition-colors focus:border-[color:var(--atlas-indigo)]" /></label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">繁中本地關鍵字<input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="例：佐櫻 宇智波佐助 春野櫻" className="h-10 min-w-0 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 text-sm font-normal text-slate-700 dark:text-slate-200 outline-none transition-colors focus:border-[color:var(--atlas-indigo)]" /></label>
      <label className="grid gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">日文關係標籤<input value={japaneseQuery} onChange={(event) => setJapaneseQuery(event.target.value)} placeholder="例：ぎゆしの、五夏、出勝" className="h-10 min-w-0 rounded-xl border border-[color:var(--atlas-line)] bg-white px-3 text-sm font-normal text-slate-700 dark:text-slate-200 outline-none transition-colors focus:border-[color:var(--atlas-indigo)]" /></label>
      <div className="flex items-center justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={closeEditor} className="h-9 rounded-xl border-[color:var(--atlas-line)] bg-white/70">取消</Button><Button type="button" onClick={save} disabled={!alias.trim() || !ao3Query.trim() || !localQuery.trim()} className="h-9 rounded-xl bg-[color:var(--atlas-indigo)] text-white hover:bg-[#4338ca]">儲存</Button></div>
    </div>
  );

  return (
    <section aria-label="CP 詞庫與世界觀" className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 border-b border-[color:var(--atlas-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]"><Tag className="h-3.5 w-3.5" /></span>你的搜尋詞庫</div><h2 className="mt-2 text-3xl font-extrabold tracking-[-0.035em] text-[color:var(--atlas-ink)]">CP 詞庫與世界觀</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">系統預設與自訂對照會合併使用；自訂值只儲存在這台裝置，於下一次搜尋即時套用。</p></div>
        <span className="text-xs font-semibold text-[color:var(--atlas-muted)]">{mappings.length} 組跨平台對照</span>
      </header>
      <div className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--atlas-muted)]" /><input value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value)} aria-label="搜尋 CP 詞庫" placeholder="搜尋配對、AO3、中文或日文標籤" className="h-10 w-full rounded-xl border border-[color:var(--atlas-line)] bg-white pl-9 pr-3 text-sm text-[color:var(--atlas-ink)] outline-none transition-colors placeholder:text-[color:var(--atlas-muted)] focus:border-[color:var(--atlas-indigo)]" /></label>
            <Button type="button" onClick={() => openEditor()} className="h-10 shrink-0 rounded-xl bg-[color:var(--atlas-indigo)] text-sm font-semibold text-white hover:bg-[#4338ca]"><Plus className="mr-1.5 h-4 w-4" />新增自訂 CP 對照</Button>
          </div>
          {inlineEditorKey === "__new__" && <div className="overflow-hidden rounded-2xl border border-[color:var(--atlas-line)]">{renderInlineEditor()}</div>}
          <div className="space-y-3" aria-label="CP 對照清單">
            {visibleMappings.length ? visibleMappings.map((mapping) => {
              const custom = isCustomCpMapping(mapping, customMappings);
              return <article key={mapping.alias} className="overflow-hidden rounded-2xl border border-[color:var(--atlas-line)] bg-white/65 shadow-[0_8px_20px_rgba(36,33,52,0.035)]">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                  <div className="flex min-w-0 items-center gap-2.5"><div className="truncate text-lg font-extrabold tracking-[-0.025em] text-[color:var(--atlas-indigo)]">{mapping.alias}</div><span className={`shrink-0 rounded-full px-2 py-1 text-xs font-semibold ${custom ? "bg-[color:var(--atlas-success-soft)] text-[color:var(--atlas-success)]" : "bg-[color:var(--atlas-elevated)] text-[color:var(--atlas-muted)]"}`}>{custom ? "自訂" : "系統"}</span></div>
                  <div className="flex shrink-0 items-center gap-1"><Button type="button" variant="ghost" size="sm" onClick={() => openEditor(mapping)} aria-label={`編輯 ${mapping.alias}`} className="h-8 rounded-lg px-2.5 text-sm font-semibold hover:bg-[color:var(--atlas-indigo-soft)]"><Pencil className="mr-1 h-3.5 w-3.5" />編輯</Button>{custom && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(customMappings.filter((item) => item.alias !== mapping.alias))} aria-label={`刪除 ${mapping.alias}`} className="h-8 w-8 rounded-full text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)] hover:text-[color:var(--atlas-danger)]"><Trash2 className="h-3.5 w-3.5" /></Button>}</div>
                </div>
                <div className="flex flex-col gap-2 border-t border-[color:var(--atlas-line)] bg-[color:var(--atlas-elevated)]/38 px-4 py-3 md:flex-row md:items-center md:gap-4 sm:px-5">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span className="rounded-full border border-[color:var(--atlas-indigo)]/15 bg-[color:var(--atlas-indigo-soft)] px-2.5 py-1 text-xs font-bold text-[color:var(--atlas-indigo)]">AO3</span><span className="min-w-0 break-words text-sm font-medium text-[color:var(--atlas-ink)]">{mapping.ao3Query}</span></div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span className="rounded-full border border-[color:var(--atlas-success)]/15 bg-[color:var(--atlas-success-soft)] px-2.5 py-1 text-xs font-bold text-[color:var(--atlas-success)]">繁中</span><span className="min-w-0 break-words text-sm font-medium text-[color:var(--atlas-ink)]">{mapping.localQuery}</span></div>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><span className="rounded-full border border-fuchsia-300/35 bg-fuchsia-50 px-2.5 py-1 text-xs font-bold text-fuchsia-700">日文</span><span className={`min-w-0 break-words text-sm font-medium ${mapping.japaneseQuery ? "text-[color:var(--atlas-ink)]" : "text-[color:var(--atlas-muted)]"}`}>{mapping.japaneseQuery || "暫無"}</span></div>
                </div>
                {inlineEditorKey === mapping.alias && renderInlineEditor()}
              </article>;
            }) : <div className="rounded-2xl border border-dashed border-[color:var(--atlas-line)] px-4 py-10 text-center text-sm text-[color:var(--atlas-muted)]">沒有符合的 CP 對照。</div>}
          </div>
          <section aria-label="題材與世界觀詞庫" className="overflow-hidden rounded-2xl border border-[color:var(--atlas-line)] bg-white/55">
            <div className="flex flex-col gap-1 border-b border-[color:var(--atlas-line)] bg-[color:var(--atlas-elevated)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-slate-900 dark:text-slate-100">題材與世界觀詞庫</div><div className="mt-1 text-xs text-slate-500 dark:text-slate-400">系統預設，搜尋時會自動轉譯</div></div></div>
            <div className="divide-y divide-[color:var(--atlas-line)]">{DEFAULT_TROPE_MAPPINGS.map((trope) => <div key={trope.key} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(9rem,0.55fr)_minmax(19rem,1.25fr)_minmax(13rem,0.8fr)] sm:items-center"><div className="text-sm font-semibold text-[color:var(--atlas-amber)]">{trope.label}</div><span className="inline-flex min-w-0 items-center rounded-full border border-[color:var(--atlas-indigo)]/15 bg-[color:var(--atlas-indigo-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--atlas-indigo)]"><span className="mr-1.5 shrink-0 text-[10px] font-bold uppercase tracking-wide">AO3</span><span className="truncate">{trope.ao3Query}</span></span><span className="inline-flex min-w-0 items-center rounded-full border border-[color:var(--atlas-success)]/15 bg-[color:var(--atlas-success-soft)] px-2.5 py-1 text-xs font-medium text-[color:var(--atlas-success)]"><span className="mr-1.5 shrink-0 text-[10px] font-bold tracking-wide">中文／通用</span><span className="truncate">{trope.localQuery}</span></span></div>)}</div>
          </section>
        </div>
        <footer className="flex flex-col gap-3 border-t border-[color:var(--atlas-line)] pt-5 sm:flex-row sm:items-center sm:justify-between"><Button type="button" variant="ghost" onClick={resetToDefaults} disabled={!customMappings.length} className="w-fit rounded-xl text-sm font-semibold text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)]">重設為系統預設</Button><span className="text-xs text-[color:var(--atlas-muted)]">自訂對照只保留在這台裝置</span></footer>
    </section>
  );
}

type SavedBookmarksGridProps = {
  bookmarks: BookmarkRecord[];
  onEdit: (record: BookmarkRecord) => void;
  onRemove: (url: string) => void;
  selectionMode?: boolean;
  selectedUrls?: Set<string>;
  onToggleSelected?: (url: string) => void;
  onProgressChange?: (url: string, progress: BookmarkRecord["progress"]) => void;
  viewMode?: "cards" | "list";
};

export function SavedBookmarksGrid({ bookmarks, onEdit, onRemove, selectionMode = false, selectedUrls = new Set(), onToggleSelected, onProgressChange, viewMode = "cards" }: SavedBookmarksGridProps) {
  const [progressPopoverUrl, setProgressPopoverUrl] = useState<string | null>(null);
  if (!bookmarks.length) {
    return <div className="atlas-panel relative px-6 py-16 text-center"><Bookmark className="mx-auto mb-4 h-7 w-7 text-[color:var(--atlas-indigo)]" /><div className="text-base font-semibold">你的書架正等待第一本作品</div><p className="mt-3 text-sm text-[color:var(--atlas-muted)]">在作品卡片右上角選擇收藏，為下一次重讀留下線索。</p></div>;
  }

  return <div className={viewMode === "cards" ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>{bookmarks.map((bookmark) => {
    const progress = bookmark.progress;
    const statusLabel = progress.status === "finished" ? "已讀完" : progress.status === "reading" ? "閱讀中" : "未讀";
    const updateProgress = (patch: Partial<BookmarkRecord["progress"]>) => onProgressChange?.(bookmark.url, { ...progress, ...patch });
    const cycleStatus = () => {
      if (progress.status === "unread") updateProgress({ status: "reading", percent: Math.max(1, progress.percent) });
      else if (progress.status === "reading") updateProgress({ status: "finished", percent: 100 });
      else updateProgress({ status: "unread", percent: 0 });
    };
    return <div key={bookmark.url} className={`reader-shelf-card group relative overflow-hidden ${selectionMode && selectedUrls.has(bookmark.url) ? "ring-2 ring-[color:var(--atlas-indigo)] ring-offset-2 ring-offset-[color:var(--atlas-bg)]" : ""}`}>
      <div className="flex items-center justify-between border-b border-[color:var(--atlas-line)] px-5 py-3"><div className="flex items-center gap-2"><span className="rounded-full bg-[color:var(--atlas-indigo-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--atlas-indigo)]">已收藏 · {bookmark.result.platform}</span>{selectionMode && <Checkbox checked={selectedUrls.has(bookmark.url)} onCheckedChange={() => onToggleSelected?.(bookmark.url)} aria-label={`選取 ${bookmark.result.title}`} className="rounded border-[color:var(--atlas-indigo)] data-[state=checked]:bg-[color:var(--atlas-indigo)]" />}</div><div className="flex items-center text-amber-500">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-3.5 w-3.5" fill={star <= bookmark.rating ? "currentColor" : "none"} />)}</div></div>
      {viewMode === "cards" && <BlueprintCover src={bookmark.result.coverUrl} title={bookmark.result.title} />}
      <div className={viewMode === "list" ? "grid gap-4 px-4 py-3 md:grid-cols-[minmax(0,1.45fr)_minmax(12rem,0.85fr)_auto] md:items-center" : "space-y-4 p-5"}><div className="min-w-0"><h3 className={`line-clamp-2 font-extrabold leading-tight ${viewMode === "list" ? "text-base" : "text-xl"}`}>{bookmark.result.title}</h3><div className="mt-2 text-sm text-[color:var(--atlas-muted)]">作者 · {bookmark.result.author}</div>{bookmark.notes && <p className={`whitespace-pre-wrap text-sm leading-6 text-[color:var(--atlas-muted)] ${viewMode === "list" ? "mt-2 line-clamp-1" : "mt-4"}`}>{bookmark.notes}</p>}<div className={`flex flex-wrap gap-1.5 ${viewMode === "list" ? "mt-2" : "mt-4"}`}>{bookmark.tags.map((tag) => <span key={tag} className="rounded-full bg-[color:var(--atlas-indigo-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--atlas-indigo)]">#{tag}</span>)}</div></div>
        <div className="reader-progress p-3"><div className="flex items-center justify-between gap-3"><button type="button" onClick={cycleStatus} aria-label={`${bookmark.result.title} 閱讀狀態：${statusLabel}；點擊切換`} className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-100"><CheckSquare className="h-3.5 w-3.5" />{statusLabel}</button><Popover open={progressPopoverUrl === bookmark.url} onOpenChange={(open) => setProgressPopoverUrl(open ? bookmark.url : null)}><PopoverTrigger asChild><button type="button" aria-label={`編輯 ${bookmark.result.title} 閱讀進度`} className="text-xs font-semibold text-[color:var(--atlas-indigo)] hover:text-[#4338ca]">{progress.percent}%{progress.chapter ? ` · ${progress.chapter}` : " · 編輯進度"}</button></PopoverTrigger><PopoverContent align="end" className="w-64 border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)] p-4 shadow-[var(--atlas-shadow)]"><div className="text-sm font-semibold">閱讀進度</div><label className="mt-3 grid gap-1 text-xs text-[color:var(--atlas-muted)]">進度 %<input aria-label={`${bookmark.result.title} 閱讀進度`} type="number" min="0" max="100" value={progress.percent} onChange={(event) => { const percent = Math.max(0, Math.min(100, Number(event.target.value) || 0)); updateProgress({ percent, status: percent >= 100 ? "finished" : percent > 0 ? "reading" : "unread" }); }} className="h-8 border border-[color:var(--atlas-line)] bg-white px-2 text-xs" /></label><label className="mt-3 grid gap-1 text-xs text-[color:var(--atlas-muted)]">章節／備註<input aria-label={`${bookmark.result.title} 閱讀章節`} value={progress.chapter} onChange={(event) => updateProgress({ chapter: event.target.value })} placeholder="例：第 12 章" className="h-8 border border-[color:var(--atlas-line)] bg-white px-2 text-xs" /></label></PopoverContent></Popover></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[color:var(--atlas-line)]"><div className="h-full bg-[color:var(--atlas-indigo)] transition-[width] duration-200" style={{ width: `${progress.percent}%` }} /></div></div>
        <div className={`flex gap-2 ${viewMode === "list" ? "md:justify-self-end md:items-center" : "items-center justify-between"}`}><a href={bookmark.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--atlas-indigo)] hover:text-[#4338ca]">前往原站閱讀 <ArrowUpRight className="h-3.5 w-3.5" /></a><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => onEdit(bookmark)} aria-label={`編輯 ${bookmark.result.title} 的閱讀卡`} className="h-8 w-8 rounded-full hover:bg-[color:var(--atlas-indigo-soft)]"><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => onRemove(bookmark.url)} aria-label={`取消收藏 ${bookmark.result.title}`} className="h-8 w-8 rounded-full text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)] hover:text-[color:var(--atlas-danger)]"><Trash2 className="h-3.5 w-3.5" /></Button></div></div></div>
    </div>;
  })}</div>;
}
