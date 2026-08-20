import React, { useState } from "react";
import { Eye, EyeOff, FolderPlus, ShieldOff, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { removeBlacklistGroup, updateBlacklistGroup, upsertBlacklistGroup, type BlacklistDisplayMode, type BlacklistGroup } from "@/lib/personalLibrary";

type ExcludeKeywordEditorProps = {
  keywords: string[];
  onChange: (next: string[]) => void;
};

export function ExcludeKeywordEditor({ keywords, onChange }: ExcludeKeywordEditorProps) {
  const [draft, setDraft] = useState("");
  const addDraft = () => {
    const values = draft.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean);
    if (!values.length) return;
    onChange([...keywords, ...values]);
    setDraft("");
  };

  return (
    <div className="border-t border-[#10151b]/10 pt-4 lg:col-span-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="exclude-keywords" className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#8b3e59]"><ShieldOff className="h-3.5 w-3.5" />避雷標籤／排除關鍵字</label>
          <Input id="exclude-keywords" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addDraft(); } }} placeholder="輸入角色、CP、標籤或雷點；以逗號或 Enter 分隔" className="h-10 border-[#e8a7bf] bg-[#fff8fa] text-sm placeholder:text-[#a98a94] focus-visible:ring-[#e27d9d]" />
          <p className="mt-2 font-mono text-[9px] font-bold leading-4 tracking-[0.08em] text-[#8c747d]">全局設定：命中標題、角色、配對、標籤或摘要的作品會在此裝置立即隱藏。</p>
        </div>
        <Button type="button" variant="outline" onClick={addDraft} disabled={!draft.trim()} className="h-10 shrink-0 rounded-none border-[#e8a7bf] bg-[#fff5f7] font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#8b3e59] hover:bg-[#ffe8f0]">加入避雷</Button>
      </div>
      {keywords.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="目前避雷關鍵字">{keywords.map((keyword) => <span key={keyword} className="inline-flex items-center gap-1 border border-[#e8a7bf] bg-[#ffe8f0] px-2 py-1 font-mono text-[10px] font-bold text-[#8b3e59]">避開：{keyword}<button type="button" onClick={() => onChange(keywords.filter((item) => item !== keyword))} aria-label={`移除避雷關鍵字 ${keyword}`} className="ml-1 inline-flex h-4 w-4 items-center justify-center hover:bg-white"><X className="h-3 w-3" /></button></span>)}</div>}
    </div>
  );
}

type BlacklistGroupManagerProps = {
  groups: BlacklistGroup[];
  onGroupsChange: (groups: BlacklistGroup[]) => void;
  displayMode: BlacklistDisplayMode;
  onDisplayModeChange: (mode: BlacklistDisplayMode) => void;
};

export function BlacklistGroupManager({ groups, onGroupsChange, displayMode, onDisplayModeChange }: BlacklistGroupManagerProps) {
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const addGroup = () => {
    if (!name.trim()) return;
    onGroupsChange(upsertBlacklistGroup(groups, { name, keywords: keywords.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean), enabled: true }));
    setName(""); setKeywords("");
  };
  return <section className="border-t border-[#10151b]/10 pt-4 lg:col-span-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"><ShieldOff className="h-3.5 w-3.5 text-[#8b3e59]" />避雷黑名單分組</div><div role="group" aria-label="避雷命中處理方式" className="inline-flex rounded-xl border border-[#e8a7bf] bg-white p-1"><button type="button" aria-pressed={displayMode === "hide"} onClick={() => onDisplayModeChange("hide")} className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${displayMode === "hide" ? "bg-[#8b3e59] text-white" : "text-[#8b3e59] hover:bg-[#fff0f4]"}`}><EyeOff className="h-3.5 w-3.5" />直接隱藏</button><button type="button" aria-pressed={displayMode === "mask"} onClick={() => onDisplayModeChange("mask")} className={`inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors ${displayMode === "mask" ? "bg-[#8b3e59] text-white" : "text-[#8b3e59] hover:bg-[#fff0f4]"}`}><Eye className="h-3.5 w-3.5" />警示遮罩</button></div></div><p className="text-xs leading-5 text-slate-500">啟用中的分組會比對標題、角色、配對、標籤與摘要；目前採用{displayMode === "hide" ? "直接隱藏" : "警示遮罩，可單篇解鎖"}。</p></div></div><div className="mt-3 grid gap-2 border border-[#e8a7bf] bg-[#fff8fa] p-3 sm:grid-cols-[0.55fr_1fr_auto]"><Input aria-label="避雷分組名稱" value={name} onChange={(event) => setName(event.target.value)} placeholder="例：咒術專區" className="h-9 border-[#e8a7bf] bg-white text-sm" /><Input aria-label="避雷分組關鍵字" value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="角色、CP 或雷點；以逗號分隔" className="h-9 border-[#e8a7bf] bg-white text-sm" /><Button type="button" onClick={addGroup} disabled={!name.trim()} className="h-9 rounded-none bg-[#8b3e59] font-mono text-[9px] font-bold uppercase tracking-[0.1em]"><FolderPlus className="mr-1.5 h-3.5 w-3.5" />新增分組</Button></div>{groups.length > 0 && <div className="mt-3 space-y-2">{groups.map((group) => <div key={group.id} className={`border p-3 ${group.enabled ? "border-[#e8a7bf] bg-[#fff5f7]" : "border-[#111826]/12 bg-white/45 opacity-75"}`}><div className="flex flex-wrap items-center justify-between gap-2"><label className="inline-flex items-center gap-2 font-mono text-[10px] font-bold text-[#8b3e59]"><Checkbox checked={group.enabled} onCheckedChange={(value) => onGroupsChange(updateBlacklistGroup(groups, group.id, { enabled: value === true }))} aria-label={`啟用 ${group.name}`} className="rounded-none border-[#9b4358] data-[state=checked]:bg-[#9b4358]" />{group.name}<span className="text-[#8c747d]">({group.keywords.length})</span></label><Button type="button" variant="ghost" size="sm" onClick={() => onGroupsChange(removeBlacklistGroup(groups, group.id))} className="h-7 rounded-none px-2 text-[#9b4358] hover:bg-[#ffe8f0]"><Trash2 className="mr-1 h-3.5 w-3.5" />刪除</Button></div><Input aria-label={`${group.name} 關鍵字`} value={group.keywords.join(", ")} onChange={(event) => onGroupsChange(updateBlacklistGroup(groups, group.id, { keywords: event.target.value.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean) }))} className="mt-2 h-8 border-[#e8a7bf] bg-white text-xs" /></div>)}</div>}</section>;
}
