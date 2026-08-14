import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import {
  ArrowUpRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  BookMarked,
  ChevronDown,
  Database,
  Filter,
  History,
  Loader2,
  Search,
  RotateCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Terminal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  appendUniqueResults,
  extractIsRateLimited,
  extractPlatformStatuses,
  extractSearchPagination,
  extractSearchWarning,
  filterAndSortResults,
  getLoadMoreLabel,
  isPlatformRetryable,
  normalizeResults,
  type CompletionFilter,
  type ResultSortMode,
  type SearchPagination,
  type SearchResult,
  type PlatformStatus,
  type WordCountFilter,
} from "@/lib/searchResults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { BookmarkEditorDialog, CpMappingManagerDialog, SavedBookmarksGrid } from "@/components/PersonalLibrary";
import {
  loadBookmarks,
  loadCpMappings,
  loadFilterPreset,
  loadSearchHistory,
  persistBookmarks,
  persistCpMappings,
  persistFilterPreset,
  persistSearchHistory,
  recordSearch,
  upsertBookmark,
  type BookmarkRecord,
  type CpMapping,
} from "@/lib/personalLibrary";

const PLATFORMS = [
  { id: "ao3", label: "AO3", detail: "ARCHIVE OF OUR OWN", tone: "cyan" },
  { id: "lofter", label: "LOFTER", detail: "LOFTER.COM", tone: "pink" },
  { id: "doujin", label: "同人誌中心", detail: "DOUJIN.COM.TW", tone: "violet" },
  { id: "waterwriter", label: "在水裡寫字", detail: "SLASHTW.SPACE", tone: "amber" },
  { id: "penana", label: "PENANA", detail: "PENANA.COM", tone: "teal" },
  { id: "cxc", label: "CxC 創利市集", detail: "CXC.TODAY", tone: "violet" },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

function platformMeta(platform: string) {
  const normalized = platform.toLowerCase();
  return PLATFORMS.find((item) => normalized.includes(item.id) || platform.includes(item.label)) || PLATFORMS[0];
}

function platformToneClass(tone: (typeof PLATFORMS)[number]["tone"]) {
  if (tone === "pink") return "border-[#eea3bb] bg-[#ffe3eb] text-[#8b3e59]";
  if (tone === "violet") return "border-[#c9bcf2] bg-[#f0ecff] text-[#5c4e87]";
  if (tone === "amber") return "border-[#e8c681] bg-[#fff4d8] text-[#8b671e]";
  if (tone === "teal") return "border-[#79cdbd] bg-[#ddf6ef] text-[#176d61]";
  return "border-[#10151b] bg-[#10151b] text-white";
}

function showInfoToast(message: string) {
  const info = (toast as unknown as { message?: (value: string) => void }).message;
  info?.(message);
}

function formatDate(value: string) {
  if (!value) return "RECENT";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "RECENT";
  return date
    .toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" })
    .toUpperCase();
}

function completePlatformStatuses(
  incoming: PlatformStatus[],
  selected: PlatformId[],
  query: string,
): PlatformStatus[] {
  const byId = new Map(incoming.map((status) => [status.platformId, status]));
  return PLATFORMS.map((platform) => {
    const observed = byId.get(platform.id);
    if (observed) return observed;
    const wasSelected = selected.includes(platform.id);
    return {
      platformId: platform.id,
      label: platform.label,
      status: wasSelected ? "error" : "empty",
      itemCount: 0,
      warning: wasSelected ? "本次未收到來源回應，請單獨重試。" : "本次搜尋未啟用此來源。",
      translatedQuery: query,
    };
  });
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["ao3", "lofter", "doujin", "waterwriter", "penana", "cxc"]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus[]>([]);
  const [activeView, setActiveView] = useState<"search" | "bookmarks">("search");
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [bookmarkTarget, setBookmarkTarget] = useState<SearchResult | null>(null);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [cpMappings, setCpMappings] = useState<CpMapping[]>([]);
  const [cpManagerOpen, setCpManagerOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [wordCountFilter, setWordCountFilter] = useState<WordCountFilter>("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [sortMode, setSortMode] = useState<ResultSortMode>("relevance");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedElapsedMs, setCompletedElapsedMs] = useState<number | null>(null);
  const searchStartedAt = useRef<number | null>(null);
  const retryingPlatformRef = useRef<PlatformId | null>(null);
  const [pagination, setPagination] = useState<SearchPagination>({
    totalWorks: 0,
    totalPages: 0,
    page: 1,
    loadedThroughPage: 0,
    nextPage: null,
    hasMore: false,
  });

  const searchMutation = trpc.fastapi.proxy.useMutation({
    onSuccess: (payload) => {
      const isLimited = extractIsRateLimited(payload);
      const warningMsg = extractSearchWarning(payload);
      const incoming = normalizeResults(payload);
      const incomingStatuses = extractPlatformStatuses(payload);
      const retryingPlatform = retryingPlatformRef.current;
      setPlatformStatuses((current) => {
        if (!retryingPlatform) return completePlatformStatuses(incomingStatuses, selectedPlatforms, activeQuery || keyword.trim());
        const retriedStatus = incomingStatuses.find((status) => status.platformId === retryingPlatform);
        return retriedStatus
          ? current.map((status) => status.platformId === retryingPlatform ? retriedStatus : status)
          : current;
      });
      retryingPlatformRef.current = null;
      if (retryingPlatform) {
        setResults((current) => appendUniqueResults(
          current.filter((result) => platformMeta(result.platform).id !== retryingPlatform),
          incoming,
        ));
      } else {
        setResults(incoming);
        setPagination(extractSearchPagination(payload));
        setSearchWarning(incoming.length ? null : warningMsg);
      }
      setHasSearched(true);
      if (searchStartedAt.current !== null) {
        setCompletedElapsedMs(performance.now() - searchStartedAt.current);
        searchStartedAt.current = null;
      }

      if (isLimited) {
        toast.error("伺服器稍微休息中，請於 10 秒後再搜尋", {
          description: warningMsg || "AO3 目前流量較高或觸發防護。",
        });
      }
    },
    onError: (error) => {
      const retryingPlatform = retryingPlatformRef.current;
      setHasSearched(true);
      if (retryingPlatform) {
        setPlatformStatuses((current) => current.map((status) => status.platformId === retryingPlatform
          ? { ...status, status: "error", itemCount: 0, warning: error.message || "搜尋服務暫時無法連線" }
          : status));
      } else {
        setResults([]);
        setPlatformStatuses(completePlatformStatuses([], selectedPlatforms, activeQuery || keyword.trim()));
        setPagination({ totalWorks: 0, totalPages: 0, page: 1, loadedThroughPage: 0, nextPage: null, hasMore: false });
      }
      retryingPlatformRef.current = null;
      setSearchWarning(error.message || "搜尋服務暫時無法連線，請確認 FastAPI 服務已啟動。");
      if (searchStartedAt.current !== null) {
        setCompletedElapsedMs(performance.now() - searchStartedAt.current);
        searchStartedAt.current = null;
      }
      toast.error("搜尋服務暫時無法連線", {
        description: error.message || "請確認 FastAPI 服務已啟動。",
      });
    },
  });

  const loadMoreMutation = trpc.fastapi.proxy.useMutation({
    onSuccess: (payload) => {
      const incoming = normalizeResults(payload);
      setResults((current) => appendUniqueResults(current, incoming));
      setPlatformStatuses(extractPlatformStatuses(payload));
      setPagination(extractSearchPagination(payload));
      const warningMsg = extractSearchWarning(payload);
      if (warningMsg) setSearchWarning(warningMsg);
    },
    onError: (error) => {
      setSearchWarning(error.message || "翻頁載入失敗，請稍後再試。");
      toast.error("翻頁載入失敗", { description: error.message || "請稍後再試。" });
    },
  });

  const selectedLabels = useMemo(
    () => selectedPlatforms.map((platform) => platform.toUpperCase()).join(" + "),
    [selectedPlatforms],
  );

  const displayedResults = useMemo(
    () => filterAndSortResults(results, activeQuery || keyword.trim(), {
      wordCount: wordCountFilter,
      completion: completionFilter,
      sort: sortMode,
    }),
    [results, activeQuery, keyword, wordCountFilter, completionFilter, sortMode],
  );
  const isRetryingSinglePlatform = searchMutation.isPending && Boolean(retryingPlatformRef.current);

  useEffect(() => {
    setBookmarks(loadBookmarks());
    setCpMappings(loadCpMappings());
    setSearchHistory(loadSearchHistory());
    const preset = loadFilterPreset();
    setWordCountFilter(preset.wordCount);
    setCompletionFilter(preset.completion);
    setSortMode(preset.sort);
  }, []);

  useEffect(() => {
    if (!searchMutation.isPending) return;
    const timer = window.setInterval(() => {
      if (searchStartedAt.current !== null) {
        setElapsedMs(performance.now() - searchStartedAt.current);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [searchMutation.isPending]);

  const togglePlatform = (platform: PlatformId) => {
    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1 ? current : current.filter((item) => item !== platform);
      }
      return [...current, platform];
    });
  };

  const runSearch = (forceRefresh: boolean, requestedKeyword?: string, platformOverride?: PlatformId[]) => {
    const trimmedKeyword = (requestedKeyword ?? keyword).trim();
    if (!trimmedKeyword) {
      toast.error("請先輸入搜尋關鍵字");
      return;
    }
    const retryPlatform = platformOverride?.length === 1 ? platformOverride[0] : null;
    retryingPlatformRef.current = retryPlatform;
    setActiveQuery(trimmedKeyword);
    const nextHistory = recordSearch(searchHistory, trimmedKeyword);
    setSearchHistory(nextHistory);
    persistSearchHistory(nextHistory);
    setActiveView("search");
    setSearchWarning(null);
    if (!retryPlatform) setPlatformStatuses([]);
    setElapsedMs(0);
    setCompletedElapsedMs(null);
    searchStartedAt.current = performance.now();
    setPagination({ totalWorks: 0, totalPages: 0, page: 1, loadedThroughPage: 0, nextPage: null, hasMore: false });
    searchMutation.mutate({
      path: "/search",
      method: "POST",
      data: { keyword: trimmedKeyword, platforms: platformOverride ?? selectedPlatforms, page: 1, forceRefresh },
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(false);
  };

  const loadMore = () => {
    if (!pagination.nextPage || loadMoreMutation.isPending || !activeQuery) return;
    loadMoreMutation.mutate({
      path: "/search",
      method: "POST",
      data: { keyword: activeQuery, platforms: selectedPlatforms, page: pagination.nextPage, forceRefresh: false },
    });
  };

  const saveBookmark = (value: { result: SearchResult; rating: number; notes: string; tags: string[] }) => {
    const next = upsertBookmark(bookmarks, { url: value.result.url, ...value });
    setBookmarks(next);
    persistBookmarks(next);
    setBookmarkDialogOpen(false);
    toast.success("已更新閱讀清單");
  };

  const removeBookmark = (url: string) => {
    const next = bookmarks.filter((bookmark) => bookmark.url !== url);
    setBookmarks(next);
    persistBookmarks(next);
    showInfoToast("已從閱讀清單移除");
  };

  const updateCpMappings = (next: CpMapping[]) => {
    setCpMappings(next);
    persistCpMappings(next);
  };

  const saveCurrentFilters = () => {
    persistFilterPreset({ wordCount: wordCountFilter, completion: completionFilter, sort: sortMode });
    toast.success("已設為預設篩選", { description: "下次開啟網站時會自動帶入這組設定。" });
  };

  return (
    <div className="min-h-screen overflow-hidden bg-[#f8faf9] text-[#10151b]">
      <div className="blueprint-grid pointer-events-none fixed inset-0 opacity-70" />
      <div className="blueprint-cross cross-one pointer-events-none fixed" />
      <div className="blueprint-cross cross-two pointer-events-none fixed" />
      <div className="blueprint-orbit orbit-one pointer-events-none fixed" />
      <div className="blueprint-orbit orbit-two pointer-events-none fixed" />

      <header className="relative z-10 border-b border-[#12171c]/10 bg-[#f8faf9]/85 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-10 w-10 items-center justify-center border-2 border-[#10151b] bg-[#c9f4f1]">
              <span className="font-mono text-lg font-bold">∑</span>
            </div>
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-[#4e5b65]">INDEX / 001</div>
              <div className="text-lg font-black tracking-[-0.06em]">FANFIC // ATLAS</div>
            </div>
          </div>
          <div className="hidden items-center gap-6 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#61707a] md:flex">
            <span>FASTAPI CORE</span><span className="h-1 w-1 rounded-full bg-[#f29db7]" />
            <span>ADAPTER NETWORK</span><span className="h-1 w-1 rounded-full bg-[#6bcfca]" />
            <span>LOCAL CACHE READY</span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#10151b]">
            <Button type="button" variant="ghost" onClick={() => setCpManagerOpen(true)} className="hidden h-9 rounded-none px-3 font-mono text-[10px] font-bold uppercase tracking-[0.13em] hover:bg-[#d9f8f5] lg:inline-flex"><Tags className="mr-2 h-3.5 w-3.5" />CP 詞庫管理</Button>
            <span className="h-2 w-2 rounded-full bg-[#41bdb5] shadow-[0_0_0_4px_#c9f4f1]" /> ONLINE
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1440px] px-5 pb-20 pt-10 sm:px-8 lg:px-12 lg:pt-16">
        <section className="grid items-end gap-10 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="mb-5 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.24em] text-[#e27d9d]"><span className="h-px w-10 bg-[#e27d9d]" /> CROSS-PLATFORM DISCOVERY ENGINE</div>
            <h1 className="max-w-4xl text-[clamp(3.5rem,8vw,8.5rem)] font-black leading-[0.83] tracking-[-0.095em]">FIND THE<br /><span className="relative inline-block text-[#10151b]">NEXT STORY<span className="absolute -bottom-2 left-1/4 h-3 w-[62%] -rotate-2 bg-[#f7b2c6] opacity-80" /></span><span className="text-[#6bcfca]">.</span></h1>
            <p className="mt-8 max-w-xl text-base leading-7 text-[#52616b] sm:text-lg">一個入口，掃描多個同人創作平台。搜尋、聚合、去重，讓每段值得被看見的文字都能被找到。</p>
          </div>
          <div className="relative hidden min-h-[230px] lg:block">
            <div className="absolute bottom-2 right-8 h-40 w-40 rounded-full border border-[#75d6d0]" /><div className="absolute bottom-8 right-16 h-24 w-24 rounded-full border border-dashed border-[#f0a4bd]" />
            <div className="absolute right-3 top-10 font-mono text-[10px] leading-5 text-[#60727d]"><div>QUERY SPACE / 41.40338° N</div><div>INDEX VECTOR / 02.17403° E</div><div className="mt-3 text-[#e27d9d]">x² + y² = r²</div><div className="text-[#45b9b2]">∫ stories / ∂ time</div></div>
            <div className="absolute bottom-4 right-[9.3rem] h-2 w-2 bg-[#f29db7]" /><div className="absolute right-0 top-[4.45rem] h-px w-24 bg-[#10151b]/30" />
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-3 border-y border-[#10151b]/15 py-3 sm:mt-16 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setActiveView("search")} className={`h-10 rounded-none border-b-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${activeView === "search" ? "border-[#10151b] bg-white/65 text-[#10151b]" : "border-transparent text-[#75838b] hover:bg-white/60"}`}><Search className="mr-2 h-3.5 w-3.5" />搜尋索引</Button>
            <Button type="button" variant="ghost" onClick={() => setActiveView("bookmarks")} className={`h-10 rounded-none border-b-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${activeView === "bookmarks" ? "border-[#10151b] bg-white/65 text-[#10151b]" : "border-transparent text-[#75838b] hover:bg-white/60"}`}><BookMarked className="mr-2 h-3.5 w-3.5" />我的閱讀清單 <span className="ml-2 text-[#e27d9d]">{bookmarks.length}</span></Button>
          </div>
          <Button type="button" variant="outline" onClick={() => setCpManagerOpen(true)} className="h-9 rounded-none border-[#10151b]/15 bg-white/55 font-mono text-[10px] font-bold uppercase tracking-[0.13em] hover:border-[#45b9b2] lg:hidden"><Tags className="mr-2 h-3.5 w-3.5" />CP 詞庫管理</Button>
        </section>

        <section className="border-b-2 border-[#10151b] py-4">
          <form onSubmit={submitSearch} className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-3"><Search className="h-5 w-5 shrink-0 text-[#e27d9d]" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜尋角色、配對、作品名或關鍵字..." className="h-14 border-0 bg-transparent px-0 text-lg font-medium shadow-none placeholder:text-[#98a4aa] focus-visible:ring-0 sm:text-xl" aria-label="搜尋同人作品" /></div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)} className="h-11 border-[#10151b]/20 bg-white/60 font-mono text-[10px] font-bold uppercase tracking-[0.14em]"><SlidersHorizontal className="mr-2 h-4 w-4" /> FILTERS <ChevronDown className={`ml-2 h-4 w-4 transition-transform ${showFilters ? "rotate-180" : ""}`} /></Button>
              <Button type="button" variant="outline" onClick={() => runSearch(true)} disabled={searchMutation.isPending || !keyword.trim()} aria-label="強制重新抓取" className="h-11 border-[#10151b]/20 bg-white/60 font-mono text-[10px] font-bold uppercase tracking-[0.14em] hover:border-[#45b9b2] hover:text-[#197b75]"><RotateCw className={`h-4 w-4 ${searchMutation.isPending ? "animate-spin" : ""}`} /><span className="sr-only">強制重新抓取</span></Button>
              <Button type="submit" disabled={searchMutation.isPending} className="h-11 min-w-36 bg-[#10151b] px-6 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-[#24313a]">{searchMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Terminal className="mr-2 h-4 w-4" />}{searchMutation.isPending ? "SCANNING" : "RUN SEARCH"}</Button>
            </div>
          </form>
          {searchHistory.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#10151b]/10 pt-3"><span className="mr-1 inline-flex items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-[#75838b]"><History className="h-3 w-3" />最近搜尋</span>{searchHistory.map((entry) => <button key={entry} type="button" onClick={() => { setKeyword(entry); runSearch(false, entry); }} className="border border-[#10151b]/12 bg-white/65 px-2.5 py-1.5 font-mono text-[10px] font-bold text-[#52616b] transition-colors hover:border-[#45b9b2] hover:bg-[#d9f8f5] hover:text-[#197b75]">{entry}</button>)}</div>}
          {searchMutation.isPending && <div className="mt-3 border-t border-[#10151b]/10 pt-3 font-mono text-[10px] font-bold tracking-[0.13em] text-[#197b75]" aria-live="polite">正在掃描 AO3 數據庫...（已耗時 {(elapsedMs / 1000).toFixed(1)} 秒）</div>}
          {showFilters && (
            <div className="mt-4 grid gap-5 border-t border-[#10151b]/10 pt-4 lg:grid-cols-[1.25fr_0.75fr_0.75fr_0.9fr]">
              <div>
                <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#61707a]"><Filter className="h-3.5 w-3.5" /> SOURCE ADAPTERS</div>
                <div className="flex flex-wrap gap-2">{PLATFORMS.map((platform) => { const active = selectedPlatforms.includes(platform.id); return <label key={platform.id} className={`group flex cursor-pointer items-center gap-2 border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.13em] transition-colors ${active ? platform.tone === "cyan" ? "border-[#5acbc4] bg-[#d9f8f5] text-[#126762]" : "border-[#ec9db8] bg-[#ffe3eb] text-[#8b3e59]" : "border-[#10151b]/15 bg-white/50 text-[#86929a]"}`}><Checkbox checked={active} onCheckedChange={() => togglePlatform(platform.id)} aria-label={`搜尋 ${platform.label}`} className="rounded-none border-[#10151b]/30 data-[state=checked]:border-[#10151b] data-[state=checked]:bg-[#10151b] data-[state=checked]:text-white" />{platform.label}</label>; })}</div>
              </div>
              <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">字數區間
                <select value={wordCountFilter} onChange={(event) => setWordCountFilter(event.target.value as WordCountFilter)} className="h-10 border border-[#10151b]/15 bg-white px-3 text-[#10151b] outline-none focus:border-[#45b9b2]">
                  <option value="all">全部</option><option value="short">1,000 字以下</option><option value="medium">1,000–10,000 字</option><option value="long">10,000 字以上</option>
                </select>
              </label>
              <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">完結狀態
                <select value={completionFilter} onChange={(event) => setCompletionFilter(event.target.value as CompletionFilter)} className="h-10 border border-[#10151b]/15 bg-white px-3 text-[#10151b] outline-none focus:border-[#45b9b2]">
                  <option value="all">全部</option><option value="complete">僅看已完結</option><option value="ongoing">僅看連載中</option>
                </select>
              </label>
              <label className="grid gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#61707a]">排序方式
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as ResultSortMode)} className="h-10 border border-[#10151b]/15 bg-white px-3 text-[#10151b] outline-none focus:border-[#45b9b2]">
                  <option value="relevance">相關度最高</option><option value="updated">最新更新</option><option value="words">字數最多</option>
                </select>
              </label>
              <div className="flex items-end lg:col-span-4"><Button type="button" variant="outline" onClick={saveCurrentFilters} className="h-10 rounded-none border-[#10151b]/15 bg-white/65 font-mono text-[10px] font-bold uppercase tracking-[0.13em] hover:border-[#45b9b2] hover:bg-[#d9f8f5] hover:text-[#197b75]"><Save className="mr-2 h-3.5 w-3.5" />設為預設篩選</Button><span className="ml-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#8b979d]">保留字數、完結與排序偏好</span></div>
            </div>
          )}
        </section>

        <section className="mt-8 flex flex-col gap-3 border-b border-[#10151b]/15 pb-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#75838b]">{activeView === "bookmarks" ? "PERSONAL READING LIBRARY" : "SEARCH OUTPUT"}</div><h2 className="mt-2 text-3xl font-black tracking-[-0.07em] sm:text-4xl">{activeView === "bookmarks" ? `${bookmarks.length.toLocaleString()} SAVED STORIES` : searchMutation.isPending ? "SCANNING ARCHIVES..." : hasSearched ? pagination.totalWorks > 0 ? `${pagination.totalWorks.toLocaleString()} STORIES FOUND` : "NO VERIFIED STORIES FOUND" : "READY TO EXPLORE"}</h2>{activeView === "search" && hasSearched && pagination.totalWorks > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#75838b]"><span>LOADED THROUGH PAGE {pagination.loadedThroughPage} / {pagination.totalPages}</span><span>顯示 {displayedResults.length} / {results.length} 筆</span>{completedElapsedMs !== null && <span className="text-[#197b75]">已於 {(completedElapsedMs / 1000).toFixed(1)} 秒內完成查詢</span>}</div>}</div><div className="flex items-center gap-4 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#6b7982]"><span>{activeView === "bookmarks" ? "LOCAL STORAGE / PRIVATE TO THIS DEVICE" : `ADAPTERS: ${selectedLabels}`}</span><span className="hidden h-4 w-px bg-[#10151b]/20 sm:block" />{activeView === "search" && <span className="text-[#45b9b2]">CACHE: CP 2H / NORMAL 30M / LOW 5M</span>}</div></section>

        {activeView === "search" && hasSearched && platformStatuses.length > 0 && (
          <section aria-label="平台連線狀態" className="mt-5 border border-[#10151b]/15 bg-white/60 p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-1 border-b border-[#10151b]/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.17em] text-[#58666e]">ADAPTER CONNECTIONS / 本次搜尋來源</div>
              <span className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#8a969c]">僅重試受阻、冷卻或連線失敗的來源</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-6">
              {platformStatuses.map((status) => {
                const isSuccess = status.status === "success";
                const isCooldown = status.status === "cooldown";
                const isBlocked = status.status === "blocked";
                const tone = isSuccess
                  ? "border-[#80cfc8] bg-[#e4f8f4] text-[#176d61]"
                  : isCooldown
                    ? "border-[#efd59a] bg-[#fff7df] text-[#8d6b20]"
                    : isBlocked || status.status === "error"
                      ? "border-[#efb4c4] bg-[#fff0f4] text-[#913a59]"
                      : "border-[#cfd6d8] bg-[#f4f6f5] text-[#65737a]";
                const stateLabel = isSuccess ? "已連線" : isCooldown ? "冷卻限制中" : isBlocked ? "觸發人機保護" : status.status === "error" ? "連線逾時" : "無公開結果";
                return (
                  <div key={status.platformId} className={`min-w-0 border p-3 ${tone}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">{status.label}</div>
                        <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.1em]">{stateLabel}{isSuccess ? ` · ${status.itemCount} 筆` : ""}</div>
                      </div>
                      {isPlatformRetryable(status) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={searchMutation.isPending}
                          aria-label={`重試 ${status.label}`}
                          onClick={() => runSearch(true, activeQuery || keyword, [status.platformId as PlatformId])}
                          className="h-7 shrink-0 rounded-none border border-current px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] hover:bg-white/70"
                        >
                          <RotateCw className={`mr-1 h-3 w-3 ${searchMutation.isPending ? "animate-spin" : ""}`} />重試
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 truncate font-mono text-[9px] opacity-70" title={status.translatedQuery}>QUERY / {status.translatedQuery}</div>
                    {status.warning && <div className="mt-1 line-clamp-2 font-mono text-[8px] leading-4 opacity-75" title={status.warning}>{status.warning}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8">
          {activeView === "bookmarks" ? (
            <SavedBookmarksGrid
              bookmarks={bookmarks}
              onEdit={(bookmark) => { setBookmarkTarget(bookmark.result); setBookmarkDialogOpen(true); }}
              onRemove={removeBookmark}
            />
          ) : <>
          {!hasSearched && !searchMutation.isPending && <div className="relative overflow-hidden border border-[#10151b]/15 bg-white/60 p-8 sm:p-12"><div className="absolute right-0 top-0 h-24 w-24 border-b border-l border-[#f2a4bc]" /><div className="absolute bottom-0 left-0 h-16 w-16 border-r border-t border-[#72d2cc]" /><div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center"><div><div className="mb-5 flex h-12 w-12 items-center justify-center border border-[#72d2cc] bg-[#d9f8f5] text-[#197b75]"><Sparkles className="h-5 w-5" /></div><h3 className="text-2xl font-black tracking-[-0.06em]">輸入一組關鍵字，開始建立你的閱讀座標。</h3><p className="mt-3 max-w-xl text-sm leading-6 text-[#64727a]">系統會透過獨立的平台 Adapter 同時查詢 AO3、Lofter、同人誌中心、在水裡寫字與 Penana，並將可驗證作品整理成統一索引。</p></div><div className="grid grid-cols-2 gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#66757d]"><div className="border border-[#10151b]/10 bg-white/70 p-4"><Database className="mb-3 h-4 w-4 text-[#e27d9d]" />SQLITE CACHE</div><div className="border border-[#10151b]/10 bg-white/70 p-4"><BookOpen className="mb-3 h-4 w-4 text-[#45b9b2]" />UNIFIED META</div></div></div></div>}
          {hasSearched && results.length === 0 && !searchMutation.isPending && (
            <div className="relative overflow-hidden border border-dashed border-[#10151b]/25 bg-white/45 px-6 py-16 text-center">
              <div className="absolute right-0 top-0 h-16 w-16 border-b border-l border-[#e27d9d]/20" />
              <div className="mx-auto max-w-md">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#fff5f7] text-[#e27d9d]">
                  <X className="h-6 w-6" />
                </div>
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-[#e27d9d]">DISCOVERY HALTED</div>
                <h3 className="mt-4 text-xl font-black tracking-tight">目前無法取得外部作品索引。</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#66757d]">
                  這可能是因為 AO3 / Lofter 伺服器目前有連線限制或防火牆阻擋，導致無法即時抓取。
                  <br /><br />
                  <span className="font-mono text-[10px] font-bold uppercase text-[#10151b]/40">Diagnostic / {searchWarning || "外部平台連線逾時或受阻，沒有可驗證作品。"}</span>
                </p>
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setHasSearched(false)}
                  className="mt-8 h-10 border-[#10151b]/10 font-mono text-[10px] font-bold uppercase tracking-widest"
                >
                  RETURN TO BASE
                </Button>
              </div>
            </div>
          )}
          {searchMutation.isPending && !isRetryingSinglePlatform && <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse border border-[#10151b]/10 bg-white/55" />)}</div>}
          {(!searchMutation.isPending || isRetryingSinglePlatform) && results.length > 0 && displayedResults.length === 0 && <div className="border border-dashed border-[#10151b]/25 bg-white/45 px-6 py-12 text-center"><div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e27d9d]">NO FILTER MATCH</div><p className="mt-3 text-sm text-[#66757d]">目前沒有作品符合這組前端篩選條件；可調整字數、完結狀態或排序方式。</p></div>}
          {(!searchMutation.isPending || isRetryingSinglePlatform) && results.length > 0 && (
            <div className="space-y-6">
              {searchWarning && (
                <div className="border border-[#e27d9d]/40 bg-[#fff5f7] p-4 font-mono text-xs text-[#8b3e59]">
                  <span className="font-bold uppercase tracking-wider">[NOTICE]</span> {searchWarning}
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                {displayedResults.map((result, index) => {
                  const meta = platformMeta(result.platform);
                  const allTags = (result.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
                  const relationshipTags = (result.relationships?.length ? result.relationships : allTags.filter((tag) => tag.includes("/") || tag.includes(" & "))).slice(0, 3);
                  const characterTags = (result.characters || []).slice(0, 3);
                  const highlightedTags = new Set([...relationshipTags, ...characterTags]);
                  const tags = allTags.filter((tag) => !highlightedTags.has(tag)).slice(0, 4);
                  const bookmark = bookmarks.find((item) => item.url === result.url);
                  return (
                    <Card key={`${result.url}-${index}`} className="group rounded-none border-[#10151b]/15 bg-white/75 shadow-none transition-transform duration-200 hover:-translate-y-1 hover:border-[#10151b]/40">
                      <CardContent className="p-0">
                        {result.coverUrl && <img src={result.coverUrl} alt="" loading="lazy" className="h-44 w-full border-b border-[#10151b]/10 object-cover" />}
                        <div className="flex items-center justify-between border-b border-[#10151b]/10 px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Badge className={`rounded-none border font-mono text-[9px] font-bold uppercase tracking-[0.16em] ${platformToneClass(meta.tone)} `}>
                              {meta.label}
                            </Badge>
                            {result.source && (
                              <span className="font-mono text-[9px] uppercase tracking-wider text-[#75838b]">
                                [{result.source}]
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2"><button type="button" onClick={() => bookmark ? removeBookmark(result.url) : (setBookmarkTarget(result), setBookmarkDialogOpen(true))} aria-label={bookmark ? `取消收藏 ${result.title}` : `收藏 ${result.title}`} className={`inline-flex h-7 items-center gap-1 border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] transition-colors ${bookmark ? "border-[#e8a7bf] bg-[#ffe8f0] text-[#8b3e59] hover:bg-[#ffe3eb]" : "border-[#10151b]/12 bg-white/70 text-[#75838b] hover:border-[#e8a7bf] hover:text-[#8b3e59]"}`}>{bookmark ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}{bookmark ? "SAVED" : "SAVE"}</button><span className="font-mono text-[9px] font-bold tracking-[0.12em] text-[#8b979d]">{formatDate(result.scraped_at)}</span></div>
                        </div>
                        <div className="p-5 sm:p-6">
                          <div className="mb-4 flex items-start justify-between gap-4">
                            <h3 className="line-clamp-2 text-xl font-black leading-tight tracking-[-0.055em]">{result.title || "UNTITLED WORK"}</h3>
                            <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-[#9ca8ad] transition-colors group-hover:text-[#e27d9d]" />
                          </div>
                          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-[#56646d]">BY / {result.author || "UNKNOWN AUTHOR"}</div>
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#75838b]"><span>{result.wordCount ? `${result.wordCount} WORDS` : "WORD COUNT / 原站"}</span>{result.isComplete !== null && result.isComplete !== undefined && <span className={result.isComplete ? "text-[#197b75]" : "text-[#b46d25]"}>{result.isComplete ? "COMPLETED" : "IN PROGRESS"}</span>}{typeof result.relevanceScore === "number" && <span className="text-[#8b3e59]">RELEVANCE {result.relevanceScore}</span>}</div>
                          <p className="mt-5 line-clamp-3 text-sm leading-6 text-[#69777f]">{result.summary || "No summary available."}</p>
                          <div className="mt-6 flex flex-wrap gap-1.5">
                            {relationshipTags.map((tag) => <span key={`relationship-${tag}`} className="border border-[#e8a7bf] bg-[#ffe8f0] px-2 py-1 font-mono text-[9px] font-semibold text-[#8b3e59]">♡ {tag}</span>)}
                            {characterTags.map((tag) => <span key={`character-${tag}`} className="border border-[#c9bcf2] bg-[#f0ecff] px-2 py-1 font-mono text-[9px] font-semibold text-[#5c4e87]">◇ {tag}</span>)}
                            {tags.map((tag) => <span key={`tag-${tag}`} className="border border-[#10151b]/10 bg-[#f3f6f5] px-2 py-1 font-mono text-[9px] font-semibold text-[#6a777e]">#{tag}</span>)}
                          </div>
                          <a href={result.url} target="_blank" rel="noreferrer" className="mt-6 inline-flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#1d7f79] hover:text-[#e27d9d]">
                            OPEN ORIGINAL <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {pagination.hasMore && pagination.nextPage && (
                <div className="flex flex-col items-center gap-3 border-t border-[#10151b]/10 pt-6">
                  <Button type="button" onClick={loadMore} disabled={loadMoreMutation.isPending} className="min-w-56 rounded-none bg-[#10151b] px-6 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-white hover:bg-[#24313a]">
                    {loadMoreMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowUpRight className="mr-2 h-4 w-4" />}
                    {getLoadMoreLabel(loadMoreMutation.isPending, pagination.nextPage)}
                  </Button>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#75838b]">{results.length.toLocaleString()} LOADED / {pagination.totalWorks.toLocaleString()} TOTAL WORKS</span>
                </div>
              )}
            </div>
          )}
          </>}
        </div>
        <BookmarkEditorDialog
          open={bookmarkDialogOpen}
          result={bookmarkTarget}
          existing={bookmarkTarget ? bookmarks.find((bookmark) => bookmark.url === bookmarkTarget.url) || null : null}
          onOpenChange={setBookmarkDialogOpen}
          onSave={saveBookmark}
          onRemove={removeBookmark}
        />
        <CpMappingManagerDialog open={cpManagerOpen} mappings={cpMappings} onOpenChange={setCpManagerOpen} onChange={updateCpMappings} />
      </main>

      <footer className="relative z-10 border-t border-[#10151b]/10 bg-[#eff4f2]/80"><div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-6 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#738188] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><span>FANFIC // ATLAS — AGGREGATION PROTOCOL</span><span>BUILD 0.1 / ADAPTERS READY</span></div></footer>
    </div>
  );
}
