import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BookmarkImportPreview, BookmarkRecord, CpMapping } from "@/lib/personalLibrary";
import type { SearchResult } from "@/lib/searchResults";
import { ArrowUpRight, Bookmark, Pencil, Plus, Star, Tag, Trash2 } from "lucide-react";
import React, { useEffect, useState } from "react";

type BookmarkEditorDialogProps = {
  open: boolean;
  result: SearchResult | null;
  existing: BookmarkRecord | null;
  onOpenChange: (open: boolean) => void;
  onSave: (record: { result: SearchResult; rating: number; notes: string; tags: string[] }) => void;
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

  useEffect(() => {
    setRating(existing?.rating || 0);
    setNotes(existing?.notes || "");
    setTagText(existing?.tags.join(", ") || "");
  }, [existing, result?.url, open]);

  const save = () => {
    if (!result) return;
    onSave({
      result,
      rating,
      notes: notes.trim(),
      tags: tagText.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-[#10151b]/25 bg-[#f8faf9] p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[#10151b]/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e27d9d]"><Bookmark className="h-3.5 w-3.5" /> READING CARD</div>
          <DialogTitle className="pt-1 text-xl font-black tracking-[-0.05em]">{result?.title || "收藏作品"}</DialogTitle>
          <DialogDescription className="text-[#64727a]">儲存在此裝置；可加入個人評分、心得與標籤。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">個人評分</div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="個人評分">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} 星`} className="p-1 text-[#e27d9d] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#45b9b2]">
                  <Star className="h-6 w-6" fill={value <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              <span className="ml-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#75838b]">{rating ? `${rating} / 5` : "未評分"}</span>
            </div>
          </div>
          <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">個人筆記
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="記下想重讀的段落、避雷或閱讀感想…" className="resize-y border border-[#10151b]/15 bg-white px-3 py-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
          </label>
          <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">自訂標籤
            <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="神作, 重讀, 避雷" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
          </label>
        </div>
        <DialogFooter className="border-t border-[#10151b]/10 bg-white/40 px-6 py-4 sm:justify-between">
          {existing ? <Button type="button" variant="ghost" onClick={() => { onRemove(existing.url); onOpenChange(false); }} className="rounded-none text-[#ad355d] hover:bg-[#ffe3eb] hover:text-[#8b3e59]"><Trash2 className="mr-2 h-4 w-4" />取消收藏</Button> : <span />}
          <Button type="button" onClick={save} className="rounded-none bg-[#10151b] font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white hover:bg-[#24313a]">儲存閱讀卡</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type BookmarkImportPreviewDialogProps = {
  preview: BookmarkImportPreview | null;
  onOpenChange: (open: boolean) => void;
  onMerge: () => void;
  onOverwrite: () => void;
};

export function BookmarkImportPreviewDialog({ preview, onOpenChange, onMerge, onOverwrite }: BookmarkImportPreviewDialogProps) {
  return (
    <Dialog open={Boolean(preview)} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-none border-[#10151b]/25 bg-[#f8faf9] p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[#10151b]/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#45b9b2]"><Bookmark className="h-3.5 w-3.5" /> BACKUP INTAKE</div>
          <DialogTitle className="pt-1 text-xl font-black tracking-[-0.05em]">確認匯入閱讀清單</DialogTitle>
          <DialogDescription className="text-[#64727a]">備份檔已通過格式驗證；選擇寫入方式後才會變更此裝置的閱讀卡。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-[#45b9b2]/40 bg-[#d9f8f5]/60 p-4"><div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#197b75]">收藏作品</div><div className="mt-2 text-2xl font-black">{preview?.bookmarks.length || 0}</div></div>
            <div className="border border-[#c9bcf2]/60 bg-[#f0ecff]/65 p-4"><div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#5c4e87]">自訂標籤</div><div className="mt-2 text-2xl font-black">{preview?.tagCount || 0}</div></div>
          </div>
          <div className="border-y border-[#10151b]/10 py-4"><div className="mb-3 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#75838b]">PREVIEW / 前三筆閱讀卡</div><div className="space-y-2">{preview?.sample.map((bookmark) => <div key={bookmark.url} className="flex items-center justify-between gap-4 border border-[#10151b]/10 bg-white/70 px-3 py-2"><div className="min-w-0"><div className="truncate text-sm font-bold">{bookmark.result.title}</div><div className="truncate font-mono text-[9px] uppercase tracking-[0.1em] text-[#75838b]">BY / {bookmark.result.author}</div></div><div className="shrink-0 font-mono text-xs font-bold text-[#e27d9d]">★ {bookmark.rating || "—"}</div></div>)}</div></div>
        </div>
        <DialogFooter className="flex-col gap-2 border-t border-[#10151b]/10 bg-white/40 px-6 py-4 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full rounded-none border-[#10151b]/15 font-mono text-[10px] font-bold uppercase tracking-[0.12em] sm:w-auto">取消</Button><div className="flex w-full gap-2 sm:w-auto"><Button type="button" variant="outline" onClick={onMerge} className="flex-1 rounded-none border-[#45b9b2] bg-[#d9f8f5] font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#197b75] hover:bg-[#c4f0eb]">合併資料</Button><Button type="button" onClick={onOverwrite} className="flex-1 rounded-none bg-[#10151b] font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-white hover:bg-[#24313a]">完整覆蓋</Button></div></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CpMappingManagerDialogProps = {
  open: boolean;
  mappings: CpMapping[];
  onOpenChange: (open: boolean) => void;
  onChange: (mappings: CpMapping[]) => void;
};

export function CpMappingManagerDialog({ open, mappings, onOpenChange, onChange }: CpMappingManagerDialogProps) {
  const [alias, setAlias] = useState("");
  const [ao3Query, setAo3Query] = useState("");
  const [localQuery, setLocalQuery] = useState("");
  const [editingAlias, setEditingAlias] = useState<string | null>(null);

  const reset = () => { setAlias(""); setAo3Query(""); setLocalQuery(""); setEditingAlias(null); };
  const save = () => {
    const nextAlias = alias.trim();
    const nextAo3Query = ao3Query.trim();
    const nextLocalQuery = localQuery.trim();
    if (!nextAlias || !nextAo3Query || !nextLocalQuery) return;
    onChange([{ alias: nextAlias, tag: nextAo3Query, ao3Query: nextAo3Query, localQuery: nextLocalQuery, source: "custom" }, ...mappings.filter((item) => item.alias !== nextAlias && item.alias !== editingAlias)]);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none border-[#10151b]/25 bg-[#f8faf9] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-[#10151b]/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#45b9b2]"><Tag className="h-3.5 w-3.5" /> PERSONAL REFERENCE INDEX</div>
          <DialogTitle className="pt-1 text-xl font-black tracking-[-0.05em]">CP 詞庫管理</DialogTitle>
          <DialogDescription className="text-[#64727a]">系統詞庫與此裝置的自訂對照會合併顯示。自訂 AO3 與本地查詢會在下一次搜尋立即送往對應平台。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 border border-[#10151b]/15 bg-white/55 p-4 sm:grid-cols-2">
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">中文縮寫
              <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例：義忍" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">AO3 標準 Tag／Query
              <input value={ao3Query} onChange={(event) => setAo3Query(event.target.value)} placeholder="例：Tomioka Giyuu/Kochou Shinobu" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">中文全名／本地 Query
              <input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="例：義忍 富岡義勇 胡蝶忍" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <div className="flex items-end"><Button type="button" onClick={save} disabled={!alias.trim() || !ao3Query.trim() || !localQuery.trim()} className="h-10 w-full rounded-none bg-[#10151b] font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-[#24313a]"><Plus className="mr-1.5 h-3.5 w-3.5" />{editingAlias ? "更新" : "新增"}</Button></div>
          </div>
          <div className="divide-y divide-[#10151b]/10 border-y border-[#10151b]/10">
            {mappings.map((mapping) => <div key={mapping.alias} className="grid gap-3 px-1 py-4 sm:grid-cols-[0.6fr_1.8fr_auto] sm:items-center"><div><div className="font-mono text-sm font-bold text-[#8b3e59]">{mapping.alias}</div><div className={`mt-1 inline-flex border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.12em] ${mapping.source === "custom" ? "border-[#45b9b2] bg-[#d9f8f5] text-[#197b75]" : "border-[#10151b]/15 bg-white/70 text-[#75838b]"}`}>{mapping.source === "custom" ? "CUSTOM" : "SYSTEM"}</div></div><div className="space-y-1.5 font-mono text-[10px] text-[#52616b] break-all"><div><span className="mr-2 text-[#8b3e59]">AO3:</span>{mapping.ao3Query || mapping.tag}</div><div><span className="mr-2 text-[#197b75]">LOCAL:</span>{mapping.localQuery || mapping.alias}</div></div><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => { setEditingAlias(mapping.alias); setAlias(mapping.alias); setAo3Query(mapping.ao3Query || mapping.tag); setLocalQuery(mapping.localQuery || mapping.alias); }} aria-label={`編輯 ${mapping.alias}`} className="h-8 w-8 rounded-none hover:bg-[#d9f8f5]"><Pencil className="h-3.5 w-3.5" /></Button>{mapping.source === "custom" && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(mappings.filter((item) => item.alias !== mapping.alias))} aria-label={`刪除 ${mapping.alias}`} className="h-8 w-8 rounded-none text-[#ad355d] hover:bg-[#ffe3eb] hover:text-[#8b3e59]"><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>)}
            {!mappings.length && <div className="px-1 py-8 text-center text-sm text-[#75838b]">尚未建立自訂對照。</div>}
          </div>
        </div>
        <DialogFooter className="border-t border-[#10151b]/10 bg-white/40 px-6 py-4"><Button type="button" variant="outline" onClick={reset} className="rounded-none border-[#10151b]/15 font-mono text-[10px] font-bold uppercase tracking-[0.12em]">清除表單</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SavedBookmarksGridProps = {
  bookmarks: BookmarkRecord[];
  onEdit: (record: BookmarkRecord) => void;
  onRemove: (url: string) => void;
};

export function SavedBookmarksGrid({ bookmarks, onEdit, onRemove }: SavedBookmarksGridProps) {
  if (!bookmarks.length) {
    return <div className="border border-dashed border-[#10151b]/25 bg-white/45 px-6 py-16 text-center"><Bookmark className="mx-auto mb-4 h-6 w-6 text-[#e27d9d]" /><div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e27d9d]">YOUR SHELF IS READY</div><p className="mt-3 text-sm text-[#66757d]">在作品卡片右上角點選星號，建立第一張閱讀卡。</p></div>;
  }

  return <div className="grid gap-4 md:grid-cols-2">{bookmarks.map((bookmark) => <div key={bookmark.url} className="group overflow-hidden border border-[#10151b]/15 bg-white/75"><div className="flex items-center justify-between border-b border-[#10151b]/10 px-5 py-3"><span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#8b3e59]">SAVED · {bookmark.result.platform}</span><div className="flex items-center text-[#e27d9d]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-3.5 w-3.5" fill={star <= bookmark.rating ? "currentColor" : "none"} />)}</div></div>{bookmark.result.coverUrl && <img src={bookmark.result.coverUrl} alt="" className="h-40 w-full object-cover" loading="lazy" />}<div className="p-5"><h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-0.055em]">{bookmark.result.title}</h3><div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#56646d]">BY / {bookmark.result.author}</div>{bookmark.notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#69777f]">{bookmark.notes}</p>}<div className="mt-4 flex flex-wrap gap-1.5">{bookmark.tags.map((tag) => <span key={tag} className="border border-[#c9bcf2] bg-[#f0ecff] px-2 py-1 font-mono text-[9px] font-semibold text-[#5c4e87]">#{tag}</span>)}</div><div className="mt-6 flex items-center justify-between"><a href={bookmark.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#1d7f79] hover:text-[#e27d9d]">OPEN ORIGINAL <ArrowUpRight className="h-3.5 w-3.5" /></a><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => onEdit(bookmark)} aria-label={`編輯 ${bookmark.result.title} 的閱讀卡`} className="h-8 w-8 rounded-none hover:bg-[#d9f8f5]"><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => onRemove(bookmark.url)} aria-label={`取消收藏 ${bookmark.result.title}`} className="h-8 w-8 rounded-none text-[#ad355d] hover:bg-[#ffe3eb] hover:text-[#8b3e59]"><Trash2 className="h-3.5 w-3.5" /></Button></div></div></div></div>)}</div>;
}
