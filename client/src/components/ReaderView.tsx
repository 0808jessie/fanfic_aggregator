import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/searchResults";
import { AlignJustify, ArrowDownToLine, BookOpen, ChevronLeft, ExternalLink, Loader2, Minus, Plus, Rows3, Type, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type ReaderChapter = { id: string; title: string; paragraphs: string[] };
export type ReaderDocument = { url: string; title: string; author: string; source: string; coverUrl?: string | null; chapters: ReaderChapter[] };
type ReaderTheme = "day" | "sepia" | "slate" | "amoled";
type ReaderFont = "sans" | "serif" | "song";

type ReaderViewProps = {
  work: SearchResult;
  initialProgress?: { percent: number; chapter: string };
  loadDocument: (url: string) => Promise<ReaderDocument>;
  onClose: () => void;
  onOpenSource?: (url: string) => void;
  onProgress?: (progress: { percent: number; chapter: string }) => void;
};

const THEME_OPTIONS: Record<ReaderTheme, { label: string; surface: string; ink: string; muted: string; line: string; control: string }> = {
  day: { label: "Day", surface: "bg-[#f7f8fb]", ink: "text-slate-900", muted: "text-slate-500", line: "border-slate-200", control: "bg-white/90" },
  sepia: { label: "Sepia", surface: "bg-[#f4ecd9]", ink: "text-[#382d21]", muted: "text-[#786956]", line: "border-[#d9c9ad]", control: "bg-[#fbf4e7]/92" },
  slate: { label: "Slate", surface: "bg-[#1f2937]", ink: "text-slate-100", muted: "text-slate-400", line: "border-slate-700", control: "bg-[#273548]/92" },
  amoled: { label: "AMOLED", surface: "bg-black", ink: "text-zinc-100", muted: "text-zinc-500", line: "border-zinc-800", control: "bg-zinc-950/92" },
};
const FONT_OPTIONS: Record<ReaderFont, { label: string; family: string }> = {
  sans: { label: "黑體", family: "Manrope, 'Noto Sans TC', sans-serif" },
  serif: { label: "明體", family: "'Noto Serif TC', Georgia, serif" },
  song: { label: "宋體", family: "STSong, SimSun, 'Noto Serif TC', serif" },
};
const LINE_HEIGHTS = [1.65, 1.9, 2.15] as const;

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function ReaderView({ work, initialProgress, loadDocument, onClose, onOpenSource, onProgress }: ReaderViewProps) {
  const [document, setDocument] = useState<ReaderDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [theme, setTheme] = useState<ReaderTheme>("day");
  const [font, setFont] = useState<ReaderFont>("sans");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeightIndex, setLineHeightIndex] = useState(1);
  const [vertical, setVertical] = useState(false);
  const [progress, setProgress] = useState(clampPercent(initialProgress?.percent || 0));
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastProgressRef = useRef(clampPercent(initialProgress?.percent || 0));
  const loadDocumentRef = useRef(loadDocument);
  const selectedTheme = THEME_OPTIONS[theme];
  const selectedFont = FONT_OPTIONS[font];
  const chapterTitle = document?.chapters[0]?.title || initialProgress?.chapter || "正文";

  loadDocumentRef.current = loadDocument;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadDocumentRef.current(work.url)
      .then((payload) => { if (active) setDocument(payload); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "無法載入原始網站的公開內文。"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey, work.url]);

  useEffect(() => {
    if (!document || !viewportRef.current || !initialProgress?.percent) return;
    const viewport = viewportRef.current;
    const percent = clampPercent(initialProgress.percent) / 100;
    if (vertical) viewport.scrollLeft = -(viewport.scrollWidth - viewport.clientWidth) * percent;
    else viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * percent;
  }, [document, initialProgress?.percent, vertical]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const originalOverflow = globalThis.document.body.style.overflow;
    globalThis.document.body.style.overflow = "hidden";
    return () => { globalThis.document.body.style.overflow = originalOverflow; };
  }, []);

  const contentStyle = useMemo(() => ({
    fontFamily: selectedFont.family,
    fontSize: `${fontSize}px`,
    lineHeight: LINE_HEIGHTS[lineHeightIndex],
    writingMode: vertical ? "vertical-rl" as const : "horizontal-tb" as const,
  }), [fontSize, lineHeightIndex, selectedFont.family, vertical]);

  const reportProgress = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = vertical
      ? Math.abs(viewport.scrollLeft) / Math.max(1, viewport.scrollWidth - viewport.clientWidth)
      : viewport.scrollTop / Math.max(1, viewport.scrollHeight - viewport.clientHeight);
    const next = clampPercent(distance * 100);
    if (next === lastProgressRef.current) return;
    lastProgressRef.current = next;
    setProgress(next);
    onProgress?.({ percent: next, chapter: chapterTitle });
  };

  return <div role="dialog" aria-modal="true" aria-label={`${work.title} 沉浸閱讀器`} className={`fixed inset-0 z-[80] flex flex-col ${selectedTheme.surface} ${selectedTheme.ink}`}>
    <header className={`relative z-10 flex flex-wrap items-center justify-between gap-3 border-b ${selectedTheme.line} ${selectedTheme.control} px-4 py-3 backdrop-blur-xl sm:px-6`}>
      <div className="flex min-w-0 items-center gap-3"><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="關閉閱讀器" className={`h-9 w-9 rounded-full ${selectedTheme.ink} hover:bg-black/5 dark:hover:bg-white/10`}><X className="h-4 w-4" /></Button><div className="min-w-0"><div className="truncate text-sm font-semibold">{document?.title || work.title}</div><div className={`mt-0.5 truncate text-xs ${selectedTheme.muted}`}>{document ? `${document.author} · ${document.source}` : "正在準備閱讀內容"}</div></div></div>
      <div className="flex flex-wrap items-center justify-end gap-1.5" aria-label="閱讀設定">
        <div className={`hidden items-center gap-1 rounded-full border ${selectedTheme.line} px-1 py-1 md:flex`} aria-label="選擇閱讀主題">{(Object.keys(THEME_OPTIONS) as ReaderTheme[]).map((item) => <Button key={item} type="button" variant="ghost" onClick={() => setTheme(item)} aria-pressed={theme === item} className={`h-7 rounded-full px-2 text-xs font-semibold ${theme === item ? "bg-[color:var(--atlas-indigo)] text-white hover:bg-[color:var(--atlas-indigo)]" : `${selectedTheme.muted} hover:bg-black/5`}`}>{THEME_OPTIONS[item].label}</Button>)}</div>
        <Button type="button" variant="ghost" onClick={() => setFontSize((value) => Math.max(15, value - 1))} disabled={fontSize <= 15} aria-label="縮小字級" className={`h-8 rounded-full px-2 ${selectedTheme.ink} hover:bg-black/5`}><Minus className="mr-1 h-3.5 w-3.5" />A</Button>
        <Button type="button" variant="ghost" onClick={() => setFontSize((value) => Math.min(24, value + 1))} disabled={fontSize >= 24} aria-label="放大字級" className={`h-8 rounded-full px-2 ${selectedTheme.ink} hover:bg-black/5`}>A<Plus className="ml-1 h-3.5 w-3.5" /></Button>
        <Button type="button" variant="ghost" onClick={() => setLineHeightIndex((index) => (index + 1) % LINE_HEIGHTS.length)} aria-label="切換行距" className={`h-8 rounded-full px-2 ${selectedTheme.ink} hover:bg-black/5`}><Rows3 className="mr-1 h-3.5 w-3.5" />行距</Button>
        <Button type="button" variant="ghost" onClick={() => setFont((current) => current === "sans" ? "serif" : current === "serif" ? "song" : "sans")} aria-label="切換字型" className={`h-8 rounded-full px-2 ${selectedTheme.ink} hover:bg-black/5`}><Type className="mr-1 h-3.5 w-3.5" />{selectedFont.label}</Button>
        <Button type="button" variant="ghost" onClick={() => setVertical((value) => !value)} aria-pressed={vertical} aria-label="切換橫排或直排" className={`h-8 rounded-full px-2 ${vertical ? "bg-[color:var(--atlas-indigo)] text-white hover:bg-[color:var(--atlas-indigo)]" : `${selectedTheme.ink} hover:bg-black/5`}`}><AlignJustify className="mr-1 h-3.5 w-3.5" />{vertical ? "直排" : "橫排"}</Button>
      </div>
    </header>

    <main ref={viewportRef} onScroll={reportProgress} aria-label="閱讀內容" className={`min-h-0 flex-1 overflow-auto ${vertical ? "px-6 py-8" : "px-5 py-10 sm:px-8 sm:py-14"}`}>
      {loading && <div className="mx-auto flex min-h-[45vh] max-w-xl flex-col items-center justify-center gap-4 text-center"><Loader2 className="h-7 w-7 animate-spin text-[color:var(--atlas-indigo)]" /><div><div className="text-sm font-semibold">正在整理公開內文</div><p className={`mt-2 text-sm ${selectedTheme.muted}`}>只讀取原始頁面可公開取得的正文，不會儲存內容或驗證資料。</p></div></div>}
      {!loading && error && <div className={`mx-auto max-w-xl border ${selectedTheme.line} ${selectedTheme.control} p-6 text-center shadow-[0_20px_60px_rgba(20,24,39,0.10)]`}><BookOpen className="mx-auto h-6 w-6 text-[color:var(--atlas-indigo)]" /><h2 className="mt-4 text-lg font-bold">目前無法整理這篇內文</h2><p className={`mt-2 text-sm leading-relaxed ${selectedTheme.muted}`}>{error}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button type="button" onClick={() => setReloadKey((value) => value + 1)} className="rounded-full bg-[color:var(--atlas-indigo)] text-white hover:bg-[#4338ca]">重新載入</Button><Button type="button" variant="outline" onClick={() => onOpenSource?.(work.url)} className="rounded-full">前往原始頁面 <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button></div></div>}
      {!loading && document && <article style={contentStyle} className={vertical ? "mx-auto h-full min-h-[34rem] max-h-[calc(100vh-10rem)] whitespace-pre-wrap text-pretty" : "mx-auto max-w-[70ch]"}>
        <div className={`mb-10 ${vertical ? "ml-12" : "border-b pb-8"} ${selectedTheme.line}`}><div className={`text-xs font-semibold ${selectedTheme.muted}`}>原始來源 · {document.source}</div><h1 className="mt-3 font-bold tracking-[-0.03em]" style={{ fontSize: vertical ? `${Math.max(fontSize + 8, 26)}px` : "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.15 }}>{document.title}</h1><p className={`mt-3 ${selectedTheme.muted}`} style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}>作者 · {document.author}</p></div>
        {document.chapters.map((chapter) => <section key={chapter.id} className={vertical ? "ml-10" : "mb-12"}><h2 className={`mb-7 font-bold ${selectedTheme.ink}`} style={{ fontSize: `${fontSize + 3}px` }}>{chapter.title}</h2><div className={vertical ? "flex h-full gap-[1.4em]" : "space-y-[1.35em]"}>{chapter.paragraphs.map((paragraph, index) => <p key={`${chapter.id}-${index}`} className="text-pretty">{paragraph}</p>)}</div></section>)}
        <footer className={`mt-12 flex items-center gap-2 border-t pt-5 text-xs ${selectedTheme.line} ${selectedTheme.muted}`}><ArrowDownToLine className="h-3.5 w-3.5" />閱讀位置會同步至這台裝置的藏書閣；正文仍以原始來源為準。</footer>
      </article>}
    </main>

    <footer className={`relative z-10 flex items-center justify-between border-t ${selectedTheme.line} ${selectedTheme.control} px-5 py-3 backdrop-blur-xl sm:px-6`}><Button type="button" variant="ghost" onClick={onClose} className={`h-8 px-2 text-xs font-semibold ${selectedTheme.muted} hover:bg-black/5`}><ChevronLeft className="mr-1 h-3.5 w-3.5" />回到索引</Button><div className={`flex items-center gap-2 text-xs font-semibold ${selectedTheme.muted}`}><span>{chapterTitle}</span><span className={`h-1.5 w-24 overflow-hidden rounded-full ${theme === "slate" || theme === "amoled" ? "bg-white/15" : "bg-slate-200"}`}><span className="block h-full bg-[color:var(--atlas-indigo)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></span><span>{progress}%</span></div><Button type="button" variant="ghost" onClick={() => onOpenSource?.(work.url)} className={`h-8 px-2 text-xs font-semibold ${selectedTheme.ink} hover:bg-black/5`}>原始頁面 <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button></footer>
  </div>;
}
