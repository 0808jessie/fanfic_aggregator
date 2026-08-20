import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/searchResults";
import { cacheReaderDocument, readCachedReaderDocument } from "@/lib/readerCache";
import { AlignJustify, ArrowLeft, ArrowRight, BookOpen, ChevronLeft, ExternalLink, ListTree, Loader2, Minus, Plus, Rows3, Type, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type ReaderChapter = { id: string; title: string; index?: number; url?: string | null; paragraphs: string[] };
export type ReaderDocument = { url: string; title: string; author: string; source: string; coverUrl?: string | null; currentChapterIndex?: number; tableOfContents?: ReaderChapter[]; chapters: ReaderChapter[] };
type ReaderTheme = "day" | "sepia" | "slate" | "amoled";
type ReaderFont = "sans" | "serif" | "song";

type ReaderViewProps = {
  work: SearchResult;
  initialProgress?: { percent: number; chapter: string };
  initialChapterUrl?: string;
  loadDocument: (url: string, chapterUrl?: string) => Promise<ReaderDocument>;
  onClose: () => void;
  onOpenSource?: (url: string) => void;
  onProgress?: (progress: { percent: number; chapter: string; chapterUrl?: string }) => void;
};

const THEME_OPTIONS: Record<ReaderTheme, { label: string; surface: string; ink: string; muted: string; line: string; control: string; dot: string }> = {
  day: { label: "白天白", surface: "bg-[#fbfbfc]", ink: "text-slate-900", muted: "text-slate-500", line: "border-slate-200", control: "bg-white/90", dot: "bg-white border-slate-300" },
  sepia: { label: "羊皮紙", surface: "bg-[#f4ecd9]", ink: "text-[#382d21]", muted: "text-[#786956]", line: "border-[#d9c9ad]", control: "bg-[#fbf4e7]/92", dot: "bg-[#e9d09b] border-[#c6a96e]" },
  slate: { label: "暮雲灰", surface: "bg-[#1f2937]", ink: "text-slate-100", muted: "text-slate-400", line: "border-slate-700", control: "bg-[#273548]/92", dot: "bg-slate-600 border-slate-400" },
  amoled: { label: "極致黑", surface: "bg-black", ink: "text-zinc-100", muted: "text-zinc-500", line: "border-zinc-800", control: "bg-zinc-950/92", dot: "bg-black border-zinc-500" },
};
const FONT_OPTIONS: Record<ReaderFont, { label: string; family: string }> = {
  sans: { label: "黑體", family: "Manrope, 'Noto Sans TC', sans-serif" },
  serif: { label: "明體", family: "'Noto Serif TC', Georgia, serif" },
  song: { label: "宋體", family: "STSong, SimSun, 'Noto Serif TC', serif" },
};
const LINE_HEIGHTS = [1.5, 1.8, 2.2] as const;
const LINE_LABELS = ["緊湊", "標準", "寬鬆"] as const;

function clampPercent(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }

export function ReaderView({ work, initialProgress, initialChapterUrl, loadDocument, onClose, onOpenSource, onProgress }: ReaderViewProps) {
  const [document, setDocument] = useState<ReaderDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<ReaderTheme>("day");
  const [font, setFont] = useState<ReaderFont>("sans");
  const [fontSize, setFontSize] = useState(18);
  const [lineHeightIndex, setLineHeightIndex] = useState(1);
  const [vertical, setVertical] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [progress, setProgress] = useState(clampPercent(initialProgress?.percent || 0));
  const [cacheStatus, setCacheStatus] = useState<"local" | "network" | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const lastProgressRef = useRef(clampPercent(initialProgress?.percent || 0));
  const loadDocumentRef = useRef(loadDocument);
  const chapterCacheRef = useRef(new Map<string, ReaderDocument>());
  const didRestorePositionRef = useRef(false);
  const selectedTheme = THEME_OPTIONS[theme];
  const selectedFont = FONT_OPTIONS[font];
  const activeChapter = document?.chapters[0];
  const chapterTitle = activeChapter?.title || initialProgress?.chapter || "正文";
  const tableOfContents = document?.tableOfContents?.length ? document.tableOfContents : activeChapter ? [{ ...activeChapter, url: document?.url, index: 1 }] : [];
  const currentChapterIndex = Math.max(0, Math.min(document?.currentChapterIndex ?? 0, tableOfContents.length - 1));
  const previousChapter = tableOfContents[currentChapterIndex - 1];
  const nextChapter = tableOfContents[currentChapterIndex + 1];

  loadDocumentRef.current = loadDocument;

  const loadChapter = useCallback(async (chapterUrl?: string) => {
    setLoading(true); setError(null); setDrawerOpen(false);
    const targetUrl = chapterUrl || work.url;
    try {
      const memoryCached = chapterCacheRef.current.get(targetUrl);
      const sessionCached = memoryCached ? null : readCachedReaderDocument(targetUrl);
      const cached = memoryCached || sessionCached;
      const nextDocument = cached || await loadDocumentRef.current(work.url, chapterUrl);
      chapterCacheRef.current.set(targetUrl, nextDocument);
      chapterCacheRef.current.set(nextDocument.url, nextDocument);
      if (!cached) {
        cacheReaderDocument(targetUrl, nextDocument);
        if (nextDocument.url !== targetUrl) cacheReaderDocument(nextDocument.url, nextDocument);
      }
      setCacheStatus(cached ? "local" : "network");
      setDocument(nextDocument);
    }
    catch (reason: unknown) { setError(reason instanceof Error ? reason.message : "無法載入原始網站的公開內文。"); }
    finally { setLoading(false); }
  }, [work.url]);

  useEffect(() => { void loadChapter(initialChapterUrl); }, [initialChapterUrl, loadChapter]);
  useEffect(() => { if (!document || !viewportRef.current || !initialProgress?.percent || didRestorePositionRef.current) return; if (initialChapterUrl && document.url !== initialChapterUrl) return; const viewport = viewportRef.current; const percent = clampPercent(initialProgress.percent) / 100; if (vertical) viewport.scrollLeft = -(viewport.scrollWidth - viewport.clientWidth) * percent; else viewport.scrollTop = (viewport.scrollHeight - viewport.clientHeight) * percent; didRestorePositionRef.current = true; }, [document, initialChapterUrl, initialProgress?.percent, vertical]);
  useEffect(() => { if (!document || !nextChapter?.url || chapterCacheRef.current.has(nextChapter.url)) return; void loadDocumentRef.current(work.url, nextChapter.url).then((prefetched) => { chapterCacheRef.current.set(nextChapter.url!, prefetched); chapterCacheRef.current.set(prefetched.url, prefetched); cacheReaderDocument(nextChapter.url!, prefetched); if (prefetched.url !== nextChapter.url) cacheReaderDocument(prefetched.url, prefetched); }).catch(() => undefined); }, [document, nextChapter?.url, work.url]);
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") drawerOpen ? setDrawerOpen(false) : onClose(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [drawerOpen, onClose]);
  useEffect(() => { const originalOverflow = globalThis.document.body.style.overflow; globalThis.document.body.style.overflow = "hidden"; return () => { globalThis.document.body.style.overflow = originalOverflow; }; }, []);

  const contentStyle = useMemo(() => ({ fontFamily: selectedFont.family, fontSize: `${fontSize}px`, lineHeight: LINE_HEIGHTS[lineHeightIndex], writingMode: vertical ? "vertical-rl" as const : "horizontal-tb" as const }), [fontSize, lineHeightIndex, selectedFont.family, vertical]);
  const reportProgress = () => { const viewport = viewportRef.current; if (!viewport) return; const distance = vertical ? Math.abs(viewport.scrollLeft) / Math.max(1, viewport.scrollWidth - viewport.clientWidth) : viewport.scrollTop / Math.max(1, viewport.scrollHeight - viewport.clientHeight); const next = clampPercent(distance * 100); if (next === lastProgressRef.current) return; lastProgressRef.current = next; setProgress(next); onProgress?.({ percent: next, chapter: chapterTitle, chapterUrl: document?.url }); };
  const controlClass = `rounded-full border ${selectedTheme.line} ${selectedTheme.ink} hover:bg-black/5 ${theme === "slate" || theme === "amoled" ? "hover:bg-white/10" : ""}`;

  return <div role="dialog" aria-modal="true" aria-label={`${work.title} 沉浸閱讀器`} className={`fixed inset-0 z-[80] flex flex-col ${selectedTheme.surface} ${selectedTheme.ink}`}>
    <header className={`relative z-10 flex flex-wrap items-center justify-between gap-3 border-b ${selectedTheme.line} ${selectedTheme.control} px-4 py-3 backdrop-blur-xl sm:px-6`}>
      <div className="flex min-w-0 items-center gap-3"><Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="關閉閱讀器" className={`h-9 w-9 rounded-full ${selectedTheme.ink}`}><X className="h-4 w-4" /></Button><div className="min-w-0"><div className="truncate text-sm font-semibold">{document?.title || work.title}</div><div className={`mt-0.5 flex items-center gap-1.5 truncate text-xs ${selectedTheme.muted}`}><span className="truncate">{document ? `${document.author} · ${document.source}` : "正在準備閱讀內容"}</span>{document && cacheStatus === "local" && <span role="status" className={`shrink-0 rounded-full border ${selectedTheme.line} px-1.5 py-0.5 text-[10px] font-semibold`}>本機快取</span>}</div></div></div>
      <div className="flex flex-wrap items-center justify-end gap-1.5" aria-label="閱讀設定">
        <Button type="button" variant="ghost" onClick={() => setDrawerOpen(true)} disabled={!document} aria-label="開啟章節目錄" className={`${controlClass} h-8 px-3 text-xs font-semibold`}><ListTree className="mr-1.5 h-3.5 w-3.5" />目錄 {document ? `(${currentChapterIndex + 1}/${tableOfContents.length})` : ""}</Button>
        <div className={`flex items-center gap-1 rounded-full border ${selectedTheme.line} px-1 py-1`} aria-label="選擇閱讀主題">{(Object.keys(THEME_OPTIONS) as ReaderTheme[]).map((item) => <button key={item} type="button" title={THEME_OPTIONS[item].label} aria-label={`切換至${THEME_OPTIONS[item].label}`} aria-pressed={theme === item} onClick={() => setTheme(item)} className={`h-5 w-5 rounded-full border ${THEME_OPTIONS[item].dot} ${theme === item ? "ring-2 ring-[color:var(--atlas-indigo)] ring-offset-2 ring-offset-transparent" : ""}`} />)}</div>
        <div className={`flex items-center rounded-full border ${selectedTheme.line} p-0.5`} aria-label="字級控制"><Button type="button" variant="ghost" onClick={() => setFontSize((value) => Math.max(15, value - 1))} disabled={fontSize <= 15} aria-label="縮小字級" className={`h-7 w-7 p-0 ${selectedTheme.ink}`}><Minus className="h-3.5 w-3.5" /></Button><span className={`min-w-10 text-center text-xs font-semibold ${selectedTheme.muted}`}>{fontSize}px</span><Button type="button" variant="ghost" onClick={() => setFontSize((value) => Math.min(26, value + 1))} disabled={fontSize >= 26} aria-label="放大字級" className={`h-7 w-7 p-0 ${selectedTheme.ink}`}><Plus className="h-3.5 w-3.5" /></Button></div>
        <div className={`hidden items-center rounded-full border ${selectedTheme.line} p-0.5 lg:flex`} aria-label="行距選擇">{LINE_HEIGHTS.map((value, index) => <Button key={value} type="button" variant="ghost" onClick={() => setLineHeightIndex(index)} aria-pressed={lineHeightIndex === index} className={`h-7 rounded-full px-2 text-[11px] font-semibold ${lineHeightIndex === index ? "bg-[color:var(--atlas-indigo)] text-white hover:bg-[color:var(--atlas-indigo)]" : selectedTheme.muted}`}>{LINE_LABELS[index]} {value}</Button>)}</div>
        <Button type="button" variant="ghost" onClick={() => setLineHeightIndex((index) => (index + 1) % LINE_HEIGHTS.length)} aria-label="切換行距" className={`${controlClass} h-8 px-2 text-xs lg:hidden`}><Rows3 className="mr-1 h-3.5 w-3.5" />行距 {LINE_HEIGHTS[lineHeightIndex]}</Button>
        <Button type="button" variant="ghost" onClick={() => setFont((current) => current === "sans" ? "serif" : current === "serif" ? "song" : "sans")} aria-label="切換字型" className={`${controlClass} h-8 px-2 text-xs`}><Type className="mr-1 h-3.5 w-3.5" />{selectedFont.label}</Button>
        <Button type="button" variant="ghost" onClick={() => setVertical((value) => !value)} aria-pressed={vertical} aria-label="切換橫排或直排" className={`${controlClass} ${vertical ? "bg-[color:var(--atlas-indigo)] text-white" : ""} h-8 px-2 text-xs`}><AlignJustify className="mr-1 h-3.5 w-3.5" />{vertical ? "直排" : "橫排"}</Button>
      </div>
    </header>

    <main ref={viewportRef} onScroll={reportProgress} aria-label="閱讀內容" className={`min-h-0 flex-1 overflow-auto ${vertical ? "px-6 py-8" : "px-5 py-10 sm:px-8 sm:py-14"}`}>
      {loading && <div className="mx-auto flex min-h-[45vh] max-w-xl flex-col items-center justify-center gap-4 text-center"><Loader2 className="h-7 w-7 animate-spin text-[color:var(--atlas-indigo)]" /><div><div className="text-sm font-semibold">正在整理公開內文</div><p className={`mt-2 text-sm ${selectedTheme.muted}`}>只讀取原始頁面可公開取得的正文，不會儲存內容或驗證資料。</p></div></div>}
      {!loading && error && <div className={`mx-auto max-w-xl border ${selectedTheme.line} ${selectedTheme.control} p-6 text-center shadow-[0_20px_60px_rgba(20,24,39,0.10)]`}><BookOpen className="mx-auto h-6 w-6 text-[color:var(--atlas-indigo)]" /><h2 className="mt-4 text-lg font-bold">目前無法整理這篇內文</h2><p className={`mt-2 text-sm leading-relaxed ${selectedTheme.muted}`}>{error}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><Button type="button" onClick={() => void loadChapter()} className="rounded-full bg-[color:var(--atlas-indigo)] text-white hover:bg-[#4338ca]">重新載入</Button><Button type="button" variant="outline" onClick={() => onOpenSource?.(work.url)} className="rounded-full">前往原始頁面 <ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Button></div></div>}
      {!loading && document && activeChapter && <article style={contentStyle} className={vertical ? "mx-auto h-full min-h-[34rem] max-h-[calc(100vh-10rem)] whitespace-pre-wrap text-pretty" : "mx-auto max-w-[70ch]"}><div className={`mb-10 ${vertical ? "ml-12" : "border-b pb-8"} ${selectedTheme.line}`}><div className={`text-xs font-semibold ${selectedTheme.muted}`}>原始來源 · {document.source}</div><h1 className="mt-3 font-bold tracking-[-0.03em]" style={{ fontSize: vertical ? `${Math.max(fontSize + 8, 26)}px` : "clamp(2rem, 4vw, 3.5rem)", lineHeight: 1.15 }}>{document.title}</h1><p className={`mt-3 ${selectedTheme.muted}`} style={{ fontSize: `${Math.max(fontSize - 2, 14)}px` }}>作者 · {document.author}</p></div><section className={vertical ? "ml-10" : "mb-12"}><h2 className={`mb-7 font-bold ${selectedTheme.ink}`} style={{ fontSize: `${fontSize + 3}px` }}>{activeChapter.title}</h2><div className={vertical ? "flex h-full gap-[1.4em]" : "space-y-[1.35em]"}>{activeChapter.paragraphs.map((paragraph, index) => <p key={`${activeChapter.id}-${index}`} className="whitespace-pre-line text-pretty">{paragraph}</p>)}</div></section><div className={`mt-14 flex flex-wrap justify-between gap-3 border-t pt-6 ${selectedTheme.line}`}><Button type="button" variant="outline" disabled={!previousChapter || loading} onClick={() => void loadChapter(previousChapter?.url || undefined)} className="min-h-11 rounded-xl"><ArrowLeft className="mr-2 h-4 w-4" />上一章</Button><Button type="button" variant="outline" disabled={!nextChapter || loading} onClick={() => void loadChapter(nextChapter?.url || undefined)} className="min-h-11 rounded-xl">下一章<ArrowRight className="ml-2 h-4 w-4" /></Button></div><footer className={`mt-8 flex items-center gap-2 text-xs ${selectedTheme.muted}`}><Rows3 className="h-3.5 w-3.5" />閱讀位置會同步至這台裝置的藏書閣；正文仍以原始來源為準。</footer></article>}
    </main>
    <footer className={`relative z-10 flex items-center justify-between border-t ${selectedTheme.line} ${selectedTheme.control} px-5 py-3 backdrop-blur-xl sm:px-6`}><Button type="button" variant="ghost" onClick={onClose} className={`h-8 px-2 text-xs font-semibold ${selectedTheme.muted}`}><ChevronLeft className="mr-1 h-3.5 w-3.5" />回到索引</Button><div className={`flex items-center gap-2 text-xs font-semibold ${selectedTheme.muted}`}><span>{chapterTitle}</span><span className={`h-1.5 w-24 overflow-hidden rounded-full ${theme === "slate" || theme === "amoled" ? "bg-white/15" : "bg-slate-200"}`}><span className="block h-full bg-[color:var(--atlas-indigo)] transition-[width] duration-200" style={{ width: `${progress}%` }} /></span><span>{progress}%</span></div><Button type="button" variant="ghost" onClick={() => onOpenSource?.(work.url)} className={`h-8 px-2 text-xs font-semibold ${selectedTheme.ink}`}>原始頁面 <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button></footer>
    {drawerOpen && <aside aria-label="章節目錄抽屜" className={`absolute inset-y-0 left-0 z-20 flex w-full max-w-sm flex-col border-r ${selectedTheme.line} ${selectedTheme.control} p-5 pt-20 shadow-2xl backdrop-blur-xl`}><div className="flex items-center justify-between"><div><div className="text-sm font-semibold">章節目錄</div><p className={`mt-1 text-xs ${selectedTheme.muted}`}>第 {currentChapterIndex + 1} / {tableOfContents.length} 章</p></div><Button type="button" variant="ghost" size="icon" aria-label="關閉章節目錄" onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></Button></div><div className="mt-5 min-h-0 flex-1 space-y-1 overflow-y-auto">{tableOfContents.map((chapter, index) => <Button key={`${chapter.id}-${chapter.url}`} type="button" variant="ghost" onClick={() => void loadChapter(chapter.url || undefined)} className={`h-auto w-full justify-start rounded-xl px-3 py-3 text-left ${index === currentChapterIndex ? "bg-[color:var(--atlas-indigo)] text-white hover:bg-[color:var(--atlas-indigo)]" : `${selectedTheme.ink} hover:bg-black/5`}`}><span className="mr-3 text-xs opacity-70">{chapter.index || index + 1}</span><span className="truncate text-sm font-medium">{chapter.title}</span></Button>)}</div></aside>}
  </div>;
}
