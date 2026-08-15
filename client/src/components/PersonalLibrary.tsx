import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isCustomCpMapping, upsertCpMapping, type BookmarkRecord, type CpMapping } from "@/lib/personalLibrary";
import type { SearchResult } from "@/lib/searchResults";
import { DEFAULT_TROPE_MAPPINGS } from "@/lib/tropeMappings";
import { BlueprintCover } from "@/components/BlueprintCover";
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
      <DialogContent className="rounded-none border-[#111826]/25 bg-[#f5f1e8] p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-[#111826]/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d70d6]"><Bookmark className="h-3.5 w-3.5" /> READING CARD / LOCAL ONLY</div>
          <DialogTitle className="pt-1 text-xl font-black tracking-[-0.05em]">{result?.title || "收藏作品"}</DialogTitle>
          <DialogDescription className="text-[#64727a]">儲存在此裝置；可加入個人評分、心得與標籤。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div>
            <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e7480]">個人評分</div>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="個人評分">
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} 星`} className="p-1 text-[#e76f51] transition-transform hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d70d6]">
                  <Star className="h-6 w-6" fill={value <= rating ? "currentColor" : "none"} />
                </button>
              ))}
              <span className="ml-2 font-mono text-[10px] font-bold tracking-[0.14em] text-[#75838b]">{rating ? `${rating} / 5` : "未評分"}</span>
            </div>
          </div>
          <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e7480]">個人筆記
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} placeholder="記下想重讀的段落、避雷或閱讀感想…" className="resize-y border border-[#111826]/15 bg-white px-3 py-3 font-sans text-sm font-normal normal-case tracking-normal text-[#111826] outline-none focus:border-[#2d70d6]" />
          </label>
          <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6e7480]">自訂標籤
            <input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="神作, 重讀, 避雷" className="h-10 border border-[#111826]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#111826] outline-none focus:border-[#2d70d6]" />
          </label>
        </div>
        <DialogFooter className="border-t border-[#111826]/10 bg-white/40 px-6 py-4 sm:justify-between">
          {existing ? <Button type="button" variant="ghost" onClick={() => { onRemove(existing.url); onOpenChange(false); }} className="rounded-none text-[#9b4358] hover:bg-[#fff0f4] hover:text-[#e76f51]"><Trash2 className="mr-2 h-4 w-4" />取消收藏</Button> : <span />}
          <Button type="button" onClick={save} className="rounded-none bg-[#111826] font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-white hover:bg-[#2d70d6]">儲存閱讀卡</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CpMappingManagerDialogProps = {
  open: boolean;
  mappings: CpMapping[];
  customMappings: CpMapping[];
  onOpenChange: (open: boolean) => void;
  onChange: (customMappings: CpMapping[]) => void;
};

export function CpMappingManagerDialog({ open, mappings, customMappings, onOpenChange, onChange }: CpMappingManagerDialogProps) {
  const [alias, setAlias] = useState("");
  const [ao3Query, setAo3Query] = useState("");
  const [localQuery, setLocalQuery] = useState("");
  const [editingAlias, setEditingAlias] = useState<string | null>(null);

  const reset = () => { setAlias(""); setAo3Query(""); setLocalQuery(""); setEditingAlias(null); };
  const save = () => {
    if (!alias.trim() || !ao3Query.trim() || !localQuery.trim()) return;
    onChange(upsertCpMapping(customMappings, { alias, ao3Query, localQuery }, editingAlias || undefined));
    reset();
  };
  const resetToDefaults = () => { onChange([]); reset(); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-none border-[#111826]/25 bg-[#f5f1e8] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-[#111826]/10 px-6 py-5 text-left">
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d70d6]"><Tag className="h-3.5 w-3.5" /> PERSONAL REFERENCE INDEX</div>
          <DialogTitle className="pt-1 text-xl font-black tracking-[-0.05em]">CP 詞庫管理</DialogTitle>
          <DialogDescription className="text-[#64727a]">系統預設與你的自訂對照會合併使用；自訂值只儲存在此裝置，並於下一次搜尋即時套用。</DialogDescription>
        </DialogHeader>
        <div className="space-y-5 px-6 py-5">
          <div className="grid gap-3 border border-[#111826]/15 bg-white/65 p-4 sm:grid-cols-2">
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">中文縮寫
              <input value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="例：義忍" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">AO3 關係標籤
              <input value={ao3Query} onChange={(event) => setAo3Query(event.target.value)} placeholder="例：Uchiha Sasuke/Haruno Sakura" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a] sm:col-span-2">繁中本地關鍵字
              <input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="例：佐櫻 宇智波佐助 春野櫻" className="h-10 border border-[#10151b]/15 bg-white px-3 font-sans text-sm font-normal normal-case tracking-normal text-[#10151b] outline-none focus:border-[#45b9b2]" />
            </label>
            <div className="sm:col-span-2"><Button type="button" onClick={save} disabled={!alias.trim() || !ao3Query.trim() || !localQuery.trim()} className="h-10 rounded-none bg-[#10151b] font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-[#24313a]"><Plus className="mr-1.5 h-3.5 w-3.5" />{editingAlias ? "更新自訂對照" : "新增自訂對照"}</Button></div>
          </div>
          <div className="overflow-hidden border border-[#111826]/15 bg-white/50">
            <div className="grid gap-2 border-b border-[#111826]/10 bg-[#e6efff] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#53627a] sm:grid-cols-[0.5fr_1.25fr_1.25fr_auto]"><span>CP</span><span>AO3 TAG</span><span>LOCAL QUERY</span><span>STATUS</span></div>
            <div className="divide-y divide-[#10151b]/10">{mappings.map((mapping) => { const custom = isCustomCpMapping(mapping, customMappings); return <div key={mapping.alias} className="grid gap-2 px-3 py-3 sm:grid-cols-[0.5fr_1.25fr_1.25fr_auto] sm:items-center"><div className="font-mono text-sm font-bold text-[#8b3e59]">{mapping.alias}</div><div className="break-all font-mono text-[11px] text-[#52616b]">{mapping.ao3Query}</div><div className="break-all font-mono text-[11px] text-[#52616b]">{mapping.localQuery}</div><div className="flex items-center gap-1"><span className={`border px-1.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] ${custom ? "border-[#75d6d0] bg-[#d9f8f5] text-[#197b75]" : "border-[#10151b]/15 bg-white/60 text-[#75838b]"}`}>{custom ? "CUSTOM" : "SYSTEM"}</span><Button type="button" variant="ghost" size="icon" onClick={() => { setEditingAlias(mapping.alias); setAlias(mapping.alias); setAo3Query(mapping.ao3Query); setLocalQuery(mapping.localQuery); }} aria-label={`${custom ? "編輯" : "自訂覆寫"} ${mapping.alias}`} className="h-8 w-8 rounded-none hover:bg-[#d9f8f5]"><Pencil className="h-3.5 w-3.5" /></Button>{custom && <Button type="button" variant="ghost" size="icon" onClick={() => onChange(customMappings.filter((item) => item.alias !== mapping.alias))} aria-label={`刪除 ${mapping.alias}`} className="h-8 w-8 rounded-none text-[#ad355d] hover:bg-[#ffe3eb] hover:text-[#8b3e59]"><Trash2 className="h-3.5 w-3.5" /></Button>}</div></div>; })}</div>
          </div>
          <section aria-label="題材與世界觀詞庫" className="overflow-hidden border border-[#111826]/15 bg-white/50">
            <div className="flex flex-col gap-1 border-b border-[#111826]/10 bg-[#fff0e9] px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#c75b41]">TROPE / WORLD INDEX</div><div className="mt-1 text-sm font-bold text-[#111826]">題材與世界觀詞庫</div></div><span className="font-mono text-[9px] font-medium text-[#6e7480]">系統預設 · 搜尋時自動轉譯</span></div>
            <div className="divide-y divide-[#111826]/10">{DEFAULT_TROPE_MAPPINGS.map((trope) => <div key={trope.key} className="grid gap-2 px-3 py-3 sm:grid-cols-[0.75fr_1.25fr_1fr] sm:items-center"><div><div className="font-mono text-sm font-bold text-[#c75b41]">{trope.label}</div><div className="mt-1 font-mono text-[9px] text-[#6e7480]">別名：{trope.aliases.join(" · ")}</div></div><div className="break-all font-mono text-[10px] text-[#52616b]"><span className="mr-2 text-[#2d70d6]">AO3</span>{trope.ao3Query}</div><div className="break-all font-mono text-[10px] text-[#52616b]"><span className="mr-2 text-[#197b75]">LOCAL</span>{trope.localQuery}<span className="ml-2 text-[#8b3e59]">/ CxC {trope.cxcQuery}</span></div></div>)}</div>
          </section>
        </div>
        <DialogFooter className="border-t border-[#111826]/10 bg-white/40 px-6 py-4 sm:justify-between"><Button type="button" variant="ghost" onClick={resetToDefaults} disabled={!customMappings.length} className="rounded-none font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b4358] hover:bg-[#fff0f4]">重設為系統預設</Button><Button type="button" variant="outline" onClick={reset} className="rounded-none border-[#111826]/15 font-mono text-[10px] font-bold uppercase tracking-[0.12em] hover:border-[#2d70d6]">清除表單</Button></DialogFooter>
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
    return <div className="atlas-panel relative px-6 py-16 text-center"><Bookmark className="mx-auto mb-4 h-7 w-7 text-[#2d70d6]" /><div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#2d70d6]">YOUR SHELF IS READY</div><p className="mt-3 text-sm text-[#66757d]">在作品卡片右上角選擇收藏，為下一次重讀留下線索。</p></div>;
  }

  return <div className="grid gap-4 md:grid-cols-2">{bookmarks.map((bookmark) => <div key={bookmark.url} className="atlas-panel group relative overflow-hidden"><div className="flex items-center justify-between border-b border-[#111826]/10 px-5 py-3"><span className="font-mono text-[9px] font-bold uppercase tracking-[0.15em] text-[#2d70d6]">SAVED · {bookmark.result.platform}</span><div className="flex items-center text-[#e76f51]">{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="h-3.5 w-3.5" fill={star <= bookmark.rating ? "currentColor" : "none"} />)}</div></div><BlueprintCover src={bookmark.result.coverUrl} title={bookmark.result.title} className="h-40" /><div className="p-5"><h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-0.055em]">{bookmark.result.title}</h3><div className="mt-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#56646d]">BY / {bookmark.result.author}</div>{bookmark.notes && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#69777f]">{bookmark.notes}</p>}<div className="mt-4 flex flex-wrap gap-1.5">{bookmark.tags.map((tag) => <span key={tag} className="border border-[#b7c9ef] bg-[#e6efff] px-2 py-1 font-mono text-[9px] font-semibold text-[#45629d]">#{tag}</span>)}</div><div className="mt-6 flex items-center justify-between"><a href={bookmark.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#2d70d6] hover:text-[#e76f51]">READ AT SOURCE <ArrowUpRight className="h-3.5 w-3.5" /></a><div className="flex gap-1"><Button type="button" variant="ghost" size="icon" onClick={() => onEdit(bookmark)} aria-label={`編輯 ${bookmark.result.title} 的閱讀卡`} className="h-8 w-8 rounded-none hover:bg-[#e6efff]"><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" onClick={() => onRemove(bookmark.url)} aria-label={`取消收藏 ${bookmark.result.title}`} className="h-8 w-8 rounded-none text-[#9b4358] hover:bg-[#fff0f4] hover:text-[#e76f51]"><Trash2 className="h-3.5 w-3.5" /></Button></div></div></div></div>)}</div>;
}
