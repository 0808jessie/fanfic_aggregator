import React, { useState } from "react";
import { Eye, EyeOff, RotateCw, ShieldAlert, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { ContentSafetySettings } from "@/lib/personalLibrary";
import type { ReaderCacheStats } from "@/lib/readerCache";

type AgeConfirmationDialogProps = {
  open: boolean;
  onConfirm: (ageConfirmation: "adult" | "minor") => void;
};

export function AgeConfirmationDialog({ open, onConfirm }: AgeConfirmationDialogProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-white/70 bg-[color:var(--atlas-surface)]/95 p-0 shadow-[0_26px_80px_rgba(24,29,55,0.24)] backdrop-blur-md" aria-describedby={undefined} aria-label="年齡確認與內容分級提示" showCloseButton={false}>
        <div className="px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]"><ShieldAlert className="h-5 w-5" /></div>
          <DialogHeader className="mt-5 space-y-2 text-left"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em] text-[color:var(--atlas-ink)]">年齡確認</DialogTitle><DialogDescription id="age-confirmation-description" className="text-sm leading-6 text-[color:var(--atlas-muted)]">本應用程式提供跨平台同人作品索引；部分來源可能標示為限制級題材。請選擇適合你的內容保護模式。</DialogDescription></DialogHeader>
        </div>
        <div className="border-t border-[color:var(--atlas-line)] bg-white/35 px-6 py-5 sm:px-8 sm:py-6"><p className="text-xs leading-5 text-[color:var(--atlas-muted)]">此設定可隨時從「偏好與快取設定」調整；原始平台的規範仍會各自生效。</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><Button type="button" variant="outline" onClick={() => onConfirm("minor")} className="h-auto min-h-14 flex-1 rounded-2xl border-[color:var(--atlas-line)] bg-white/80 px-4 py-3 text-left text-[color:var(--atlas-ink)] hover:border-[color:var(--atlas-indigo)] hover:bg-[color:var(--atlas-indigo-soft)]"><span className="block text-sm font-bold">未滿 18 歲</span><span className="mt-1 block text-xs font-normal text-[color:var(--atlas-muted)]">啟用全年齡保護</span></Button><Button type="button" onClick={() => onConfirm("adult")} className="h-auto min-h-14 flex-1 rounded-2xl bg-[color:var(--atlas-indigo)] px-4 py-3 text-left text-white shadow-[0_10px_24px_rgba(79,70,229,0.26)] hover:bg-[#4338ca]"><span className="block text-sm font-bold">已滿 18 歲</span><span className="mt-1 block text-xs font-normal text-white/80">自由選擇瀏覽分級</span></Button></div></div>
      </DialogContent>
    </Dialog>
  );
}

function formatCacheSize(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type ReadingPreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: ContentSafetySettings;
  cacheStats: ReaderCacheStats;
  onConfirmAge: (age: "adult" | "minor") => void;
  onClearCache: () => void;
  appVersion?: string;
  updateAvailable?: boolean;
  updateCheckPending?: boolean;
  updateApplying?: boolean;
  onCheckForUpdates?: () => void;
  onApplyUpdate?: () => void;
};

export function ReadingPreferencesDialog({ open, onOpenChange, settings, cacheStats, onConfirmAge, onClearCache, appVersion, updateAvailable = false, updateCheckPending = false, updateApplying = false, onCheckForUpdates, onApplyUpdate }: ReadingPreferencesDialogProps) {
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [adultConfirmOpen, setAdultConfirmOpen] = useState(false);
  const isAdult = settings.ageConfirmation === "adult";
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent aria-label="偏好與快取設定" className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-white/70 bg-[color:var(--atlas-surface)]/95 p-0 shadow-[0_26px_80px_rgba(24,29,55,0.24)] backdrop-blur-md">
      <DialogHeader className="border-b border-[color:var(--atlas-line)] px-6 py-6 text-left sm:px-8"><DialogTitle className="text-2xl font-extrabold tracking-[-0.04em] text-[color:var(--atlas-ink)]">偏好與快取設定</DialogTitle><DialogDescription className="mt-2 text-sm leading-6 text-[color:var(--atlas-muted)]">調整內容保護模式，並管理這次工作階段中已整理的公開正文。</DialogDescription></DialogHeader>
      <div className="space-y-7 px-6 py-6 sm:px-8">
        <section aria-label="內容保護偏好"><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">內容保護</h3><p className="mt-1 text-xs leading-5 text-[color:var(--atlas-muted)]">變更後會立即套用到分級篩選與限制級摘要。</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" aria-pressed={!isAdult} onClick={() => onConfirmAge("minor")} className={`min-h-16 justify-start rounded-2xl px-4 py-3 text-left ${!isAdult ? "border-[color:var(--atlas-indigo)] bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]" : "border-[color:var(--atlas-line)] bg-white/70 text-[color:var(--atlas-ink)]"}`}><span className="flex items-center gap-3"><ShieldAlert className="h-4 w-4 shrink-0" /><span><span className="block text-sm font-bold">全年齡保護</span><span className="mt-1 block text-xs font-normal opacity-80">隱藏 R18 篩選</span></span></span></Button><Button type="button" aria-pressed={isAdult} onClick={() => { if (!isAdult) setAdultConfirmOpen(true); }} className={`min-h-16 justify-start rounded-2xl px-4 py-3 text-left ${isAdult ? "bg-[color:var(--atlas-indigo)] text-white shadow-[0_10px_24px_rgba(79,70,229,0.22)] hover:bg-[#4338ca]" : "border border-[color:var(--atlas-line)] bg-white/70 text-[color:var(--atlas-ink)] hover:bg-[color:var(--atlas-indigo-soft)]"}`}><span className="flex items-center gap-3"><Sparkles className="h-4 w-4 shrink-0" /><span><span className="block text-sm font-bold">自由選擇分級</span><span className="mt-1 block text-xs font-normal opacity-80">可使用 R18 篩選</span></span></span></Button></div></section>
        <section aria-label="閱讀快取管理" className="border-t border-[color:var(--atlas-line)] pt-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">閱讀快取</h3><p className="mt-1 text-xs leading-5 text-[color:var(--atlas-muted)]">目前已快取 {cacheStats.entryCount} 篇作品，約 {formatCacheSize(cacheStats.byteSize)}。清除後不影響藏書、筆記或閱讀進度。</p></div><span className="shrink-0 rounded-full bg-[color:var(--atlas-elevated)] px-2.5 py-1 text-xs font-semibold text-[color:var(--atlas-muted)]">本次工作階段</span></div><Button type="button" variant="outline" disabled={!cacheStats.entryCount} onClick={() => setClearConfirmOpen(true)} className="mt-4 inline-flex h-10 items-center gap-3 rounded-xl border-[color:var(--atlas-danger-line)] bg-white px-3 text-sm font-semibold text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)] disabled:opacity-45"><Trash2 className="h-4 w-4 shrink-0" />清空所有閱讀快取</Button></section>
        <section aria-label="系統版本與更新" className="border-t border-[color:var(--atlas-line)] pt-6"><div className="flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">系統版本與更新</h3><p className="mt-1 text-xs leading-5 text-[color:var(--atlas-muted)]">目前版本 {appVersion || "v1.2.11"}。{updateAvailable ? "已有可用更新，套用後會重新載入最新版。" : "已是最新版本；你也可以隨時主動重新檢查。"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${updateAvailable ? "bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]" : "bg-[color:var(--atlas-elevated)] text-[color:var(--atlas-muted)]"}`}>{updateAvailable ? "有可用更新" : "已是最新版本"}</span></div><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Button type="button" variant="outline" onClick={onCheckForUpdates} disabled={!onCheckForUpdates || updateCheckPending || updateApplying} className="h-10 rounded-xl border-[color:var(--atlas-line)] bg-white px-3 text-sm font-semibold text-[color:var(--atlas-ink)] hover:border-[color:var(--atlas-indigo)] hover:bg-[color:var(--atlas-indigo-soft)]"><RotateCw className={`mr-2 h-4 w-4 ${updateCheckPending ? "animate-spin" : ""}`} />{updateCheckPending ? "正在檢查…" : "檢查更新"}</Button>{updateAvailable && <Button type="button" onClick={onApplyUpdate} disabled={!onApplyUpdate || updateApplying} className="h-10 rounded-xl bg-[color:var(--atlas-indigo)] px-3 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(79,70,229,0.22)] hover:bg-[#4338ca]"><RotateCw className={`mr-2 h-4 w-4 ${updateApplying ? "animate-spin" : ""}`} />{updateApplying ? "正在套用…" : "立即更新至最新版"}</Button>}</div></section>
      </div>
      <AlertDialog open={adultConfirmOpen} onOpenChange={setAdultConfirmOpen}><AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)]"><AlertDialogHeader><AlertDialogTitle>確認成人分級</AlertDialogTitle><AlertDialogDescription>此模式將包含 18+ 與限制級題材。請確認你已年滿 18 歲，再解鎖自由選擇分級。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保持全年齡保護</AlertDialogCancel><AlertDialogAction onClick={() => { onConfirmAge("adult"); setAdultConfirmOpen(false); }} className="bg-[color:var(--atlas-indigo)] text-white hover:bg-[#4338ca]">已滿 18 歲，解鎖分級</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}><AlertDialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-2xl border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)]"><AlertDialogHeader><AlertDialogTitle>確認清空閱讀快取？</AlertDialogTitle><AlertDialogDescription>將刪除目前已快取的 {cacheStats.entryCount} 篇離線正文（{formatCacheSize(cacheStats.byteSize)}）。這不會影響你的藏書、筆記或評分。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { onClearCache(); setClearConfirmOpen(false); }} className="bg-[color:var(--atlas-danger)] text-white hover:bg-[#b64962]">確認清空</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </DialogContent>
  </Dialog>;
}

export function RestrictedSummary({ summary, shouldBlur }: { summary: string; shouldBlur: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const hidden = shouldBlur && !revealed;
  return <div className="relative mt-5"><p className={`line-clamp-3 text-sm leading-6 text-[#69777f] transition-[filter] duration-200 ${hidden ? "select-none blur-[5px]" : ""}`}>{summary || "No summary available."}</p>{hidden && <button type="button" onClick={() => setRevealed(true)} className="absolute inset-0 flex items-center justify-center gap-2 border border-[#efb4c4] bg-[#fff7f9]/80 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b4358] backdrop-blur-sm"><Eye className="h-3.5 w-3.5" />查看摘要</button>}{shouldBlur && !hidden && <button type="button" onClick={() => setRevealed(false)} className="mt-2 inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#9b4358] hover:underline"><EyeOff className="h-3 w-3" />重新模糊摘要</button>}</div>;
}
