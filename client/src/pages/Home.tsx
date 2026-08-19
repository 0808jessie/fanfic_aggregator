import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import React from "react";
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Bookmark,
  BookmarkCheck,
  BookMarked,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Filter,
  History,
  LayoutGrid,
  List,
  Loader2,
  Search,
  RotateCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Terminal,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import {
  isTauriDesktopRuntime,
  postSidecarSearch,
  waitForSidecarReady,
} from "@/lib/desktopApi";
import {
  LatestSearchRequestGate,
  createSearchCacheKey,
  readSearchRequestCache,
  writeSearchRequestCache,
} from "@/lib/searchRequestCache";
import {
  appendUniqueResults,
  countLanguageResults,
  extractIsRateLimited,
  extractPlatformStatuses,
  extractSearchPagination,
  extractSearchWarning,
  filterAndSortResults,
  isPlatformRetryable,
  isRestrictedResult,
  normalizeResults,
  matchesExcludedKeyword,
  type CompletionFilter,
  type LanguageFilter,
  type ResultSortMode,
  type SearchPagination,
  type SearchResult,
  type PlatformStatus,
  type RatingFilter,
  type WordCountFilter,
} from "@/lib/searchResults";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { BlueprintCover } from "@/components/BlueprintCover";
import { BookshelfView } from "@/components/BookshelfView";
import { BlacklistGroupManager } from "@/components/ExcludeKeywordEditor";
import { AgeConfirmationDialog, RestrictedSummary } from "@/components/ContentSafety";
import { BookmarkEditorDialog, CpMappingManagerDialog } from "@/components/PersonalLibrary";
import {
  loadBookmarks,
  activeBlacklistKeywords,
  clearSearchHistory,
  DEFAULT_CONTENT_SAFETY_SETTINGS,
  loadContentSafetySettings,
  loadCustomCpMappings,
  loadExcludedKeywords,
  loadBlacklistGroups,
  loadFilterPreset,
  loadPinnedQueries,
  loadSearchHistory,
  hydratePersonalLibrary,
  mergeImportedBookmarks,
  mergeCpMappings,
  persistBookmarks,
  persistContentSafetySettings,
  persistCpMappings,
  persistExcludedKeywords,
  persistBlacklistGroups,
  persistFilterPreset,
  persistPinnedQueries,
  persistSearchHistory,
  recordSearch,
  parseFullPersonalBackup,
  serializeFullPersonalBackup,
  normalizeExcludedKeywordList,
  togglePinnedQuery,
  updateBookmarksBatch,
  updateBlacklistGroup,
  upsertBookmark,
  type BookmarkRecord,
  type BlacklistGroup,
  type ContentSafetySettings,
  type CpMapping,
} from "@/lib/personalLibrary";

const PLATFORMS = [
  { id: "ao3", label: "AO3", detail: "ARCHIVE OF OUR OWN", tone: "cyan" },
  { id: "doujin", label: "同人誌中心", detail: "DOUJIN.COM.TW", tone: "violet" },
  { id: "waterwriter", label: "在水裡寫字", detail: "SLASHTW.SPACE", tone: "amber" },
  { id: "penana", label: "PENANA", detail: "PENANA.COM", tone: "teal" },
  { id: "cxc", label: "CxC 創利市集", detail: "CXC.TODAY", tone: "violet" },
  { id: "pixiv", label: "Pixiv", detail: "PIXIV.NET", tone: "rose" },
  { id: "bahamut", label: "巴哈姆特創作大廳", detail: "HOME.GAMER.COM.TW", tone: "cyan" },
  { id: "popo", label: "POPO 原創市集", detail: "POPO.TW · 索引導流", tone: "teal" },
  { id: "kadokado", label: "KadoKado 角角者", detail: "KADOKADO.COM.TW · 索引導流", tone: "amber" },
] as const;

const FALLBACK_DESKTOP_VERSION = "1.2.1";
const UPDATER_MANIFEST_URL = "https://github.com/0808jessie/fanfic_aggregator/releases/latest/download/latest.json";

type DesktopUpdate = {
  version: string;
  body?: string;
  download: (onEvent?: (event: { event: "Started"; data: { contentLength?: number } } | { event: "Progress"; data: { chunkLength: number } } | { event: "Finished" }) => void) => Promise<void>;
  install: () => Promise<void>;
};

type PlatformId = (typeof PLATFORMS)[number]["id"];
type ResultViewMode = "cards" | "list";

const RESULT_PAGE_SIZES = [12, 24, 36] as const;

function platformMeta(platform: string) {
  const normalized = platform.toLowerCase();
  return PLATFORMS.find((item) => normalized.includes(item.id) || platform.includes(item.label)) || PLATFORMS[0];
}

function platformToneClass(tone: (typeof PLATFORMS)[number]["tone"]) {
  if (tone === "violet") return "border-[#c9bcf2] bg-[#f0ecff] text-[#5c4e87]";
  if (tone === "amber") return "border-[#e8c681] bg-[#fff4d8] text-[#8b671e]";
  if (tone === "teal") return "border-[#79cdbd] bg-[#ddf6ef] text-[#176d61]";
  return "border-[#10151b] bg-[#10151b] text-white";
}

function showInfoToast(message: string) {
  const info = (toast as unknown as { message?: (value: string) => void }).message;
  info?.(message);
}

function describeUpdaterCheckError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "未知錯誤");
  const message = rawMessage.toLocaleLowerCase();
  if (message.includes("signature") || message.includes("pubkey") || message.includes("minisign")) {
    return { title: "更新清單簽名無法驗證", description: "請確認安裝的版本與官方 Release 使用同一組更新簽名金鑰。" };
  }
  if (message.includes("latest.json") || message.includes("404") || message.includes("manifest")) {
    return { title: "找不到更新清單", description: "GitHub Release 尚未提供 latest.json，請稍後再試或檢查該版本的 Release 資產。" };
  }
  if (message.includes("network") || message.includes("fetch") || message.includes("timeout") || message.includes("connect")) {
    return { title: "無法連線至更新服務", description: "請確認網路可存取 GitHub Releases，或稍後再次檢查更新。" };
  }
  return { title: "暫時無法檢查更新", description: "更新服務回應異常；詳細原因已記錄於桌面應用程式日誌。" };
}

function extractUpdaterHttpStatus(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || "");
  const match = rawMessage.match(/\b(?:HTTP\s*)?(4\d\d|5\d\d)\b/i);
  return match ? Number(match[1]) : null;
}

function formatDate(value: string) {
  if (!value) return "RECENT";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "RECENT";
  return date
    .toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" })
    .toUpperCase();
}

function isNavigableAuthor(author: string | null | undefined) {
  const normalized = (author || "").trim().toLowerCase();
  return Boolean(normalized) && !new Set([
    "unknown author", "unknown", "未知創作者", "匿名", "anonymous", "n/a", "-",
  ]).has(normalized);
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

function resultPageWindow(current: number, total: number) {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  const candidates = new Set([1, total, current - 1, current, current + 1]);
  return Array.from(candidates).filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

export default function Home() {
  const [keyword, setKeyword] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"keyword" | "author">("keyword");
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformId[]>(["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv", "bahamut"]);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageFilter>("all");
  const [activePlatformFilter, setActivePlatformFilter] = useState<PlatformId | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [platformStatuses, setPlatformStatuses] = useState<PlatformStatus[]>([]);
  const [activeView, setActiveView] = useState<"search" | "bookmarks">("search");
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([]);
  const [bookmarkTarget, setBookmarkTarget] = useState<SearchResult | null>(null);
  const [bookmarkDialogOpen, setBookmarkDialogOpen] = useState(false);
  const [cpMappings, setCpMappings] = useState<CpMapping[]>([]);
  const [customCpMappings, setCustomCpMappings] = useState<CpMapping[]>([]);
  const [cpManagerOpen, setCpManagerOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [pinnedQueries, setPinnedQueries] = useState<string[]>([]);
  const [excludedKeywords, setExcludedKeywords] = useState<string[]>([]);
  const [blacklistGroups, setBlacklistGroups] = useState<BlacklistGroup[]>([]);
  const [showFilteredResults, setShowFilteredResults] = useState(false);
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>(() => window.localStorage.getItem("fanfic-atlas-result-view") === "list" ? "list" : "cards");
  const [resultsPerPage, setResultsPerPage] = useState<number>(() => {
    const saved = Number(window.localStorage.getItem("fanfic-atlas-results-per-page"));
    return RESULT_PAGE_SIZES.includes(saved as (typeof RESULT_PAGE_SIZES)[number]) ? saved : 24;
  });
  const [localResultPage, setLocalResultPage] = useState(1);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [revealedFilteredUrls, setRevealedFilteredUrls] = useState<Set<string>>(new Set());
  const [expandedTagUrls, setExpandedTagUrls] = useState<Set<string>>(new Set());
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>(() => loadContentSafetySettings().ageConfirmation === "adult" ? "all" : "safe");
  const [contentSafetySettings, setContentSafetySettings] = useState<ContentSafetySettings>(() => loadContentSafetySettings());
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [wordCountFilter, setWordCountFilter] = useState<WordCountFilter>("all");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("all");
  const [sortMode, setSortMode] = useState<ResultSortMode>("relevance");
  const [hideBookmarkedResults, setHideBookmarkedResults] = useState(() => loadFilterPreset().hideBookmarked === true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [completedElapsedMs, setCompletedElapsedMs] = useState<number | null>(null);
  const [sidecarState, setSidecarState] = useState<"idle" | "starting" | "ready" | "error">("idle");
  const [desktopSearchPending, setDesktopSearchPending] = useState(false);
  const [desktopVersion, setDesktopVersion] = useState(FALLBACK_DESKTOP_VERSION);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<DesktopUpdate | null>(null);
  const [updateCheckPending, setUpdateCheckPending] = useState(false);
  const [updateInstallPending, setUpdateInstallPending] = useState(false);
  const [updateDownloadPercent, setUpdateDownloadPercent] = useState(0);
  const [retryingPlatformId, setRetryingPlatformId] = useState<PlatformId | null>(null);
  const searchStartedAt = useRef<number | null>(null);
  const retryingPlatformRef = useRef<PlatformId | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const activeDesktopSearchAbortRef = useRef<AbortController | null>(null);
  const searchRequestGateRef = useRef(new LatestSearchRequestGate());
  const updaterCheckInFlightRef = useRef(false);
  const personalDataRevisionRef = useRef(0);
  const [pagination, setPagination] = useState<SearchPagination>({
    totalWorks: 0,
    totalPages: 0,
    page: 1,
    loadedThroughPage: 0,
    nextPage: null,
    hasMore: false,
  });

  const handleSearchSuccess = (payload: any, request?: { data?: Record<string, unknown> }) => {
      const requestId = Number(request?.data?.clientRequestId);
      if (Number.isFinite(requestId) && requestId > 0 && !searchRequestGateRef.current.isCurrent(requestId)) return;
      if (request?.data && request.data.forceRefresh !== true) {
        writeSearchRequestCache(createSearchCacheKey(request.data), payload);
      }
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
      setRetryingPlatformId(null);
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
    };

  const handleSearchError = (error: { message?: string }, request?: { data?: Record<string, unknown> }) => {
      const requestId = Number(request?.data?.clientRequestId);
      if (Number.isFinite(requestId) && requestId > 0 && !searchRequestGateRef.current.isCurrent(requestId)) return;
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
      setRetryingPlatformId(null);
      setSearchWarning(error.message || "搜尋服務暫時無法連線，請確認 FastAPI 服務已啟動。");
      if (searchStartedAt.current !== null) {
        setCompletedElapsedMs(performance.now() - searchStartedAt.current);
        searchStartedAt.current = null;
      }
      toast.error("搜尋服務暫時無法連線", {
        description: error.message || "請確認 FastAPI 服務已啟動。",
      });
    };

  const searchMutation = trpc.fastapi.proxy.useMutation({
    onSuccess: (payload, request) => handleSearchSuccess(payload, request as { data?: Record<string, unknown> }),
    onError: (error, request) => handleSearchError(error, request as { data?: Record<string, unknown> }),
  });

  const desktopRuntime = isTauriDesktopRuntime();
  const isSearchPending = searchMutation.isPending || desktopSearchPending;

  const requestSearch = (request: { path: string; method: "POST"; data: Record<string, unknown> }, requestId: number, cacheKey: string | null) => {
    if (!desktopRuntime) {
      searchMutation.mutate(request as any);
      return;
    }

    activeDesktopSearchAbortRef.current?.abort();
    const controller = new AbortController();
    activeDesktopSearchAbortRef.current = controller;
    setDesktopSearchPending(true);
    setSidecarState("starting");
    void (async () => {
      try {
        await waitForSidecarReady({ signal: controller.signal });
        if (!searchRequestGateRef.current.isCurrent(requestId)) return;
        setSidecarState("ready");
        const payload = await postSidecarSearch(request.data, undefined, controller.signal);
        if (!searchRequestGateRef.current.isCurrent(requestId)) return;
        if (cacheKey) writeSearchRequestCache(cacheKey, payload);
        handleSearchSuccess(payload);
      } catch (error) {
        if (!searchRequestGateRef.current.isCurrent(requestId) || (error instanceof DOMException && error.name === "AbortError")) return;
        setSidecarState("error");
        handleSearchError(error instanceof Error ? error : new Error("搜尋服務暫時無法連線"));
      } finally {
        if (searchRequestGateRef.current.isCurrent(requestId)) {
          setDesktopSearchPending(false);
          activeDesktopSearchAbortRef.current = null;
        }
      }
    })();
  };


  const selectedLabels = useMemo(
    () => selectedPlatforms.map((platform) => platform.toUpperCase()).join(" + "),
    [selectedPlatforms],
  );

  const bookmarkUrls = useMemo(() => new Set(bookmarks.map((bookmark) => bookmark.url.trim())), [bookmarks]);
  const locallyFilteredResults = useMemo(
    () => filterAndSortResults(
      activePlatformFilter
        ? results.filter((result) => platformMeta(result.platform).id === activePlatformFilter)
        : results,
      activeQuery || keyword.trim(),
      { wordCount: wordCountFilter, completion: completionFilter, sort: sortMode, language: selectedLanguage, excludedKeywords: showFilteredResults ? [] : excludedKeywords, rating: contentSafetySettings.ageConfirmation === "minor" ? "safe" : ratingFilter },
    ),
    [results, activePlatformFilter, activeQuery, keyword, wordCountFilter, completionFilter, sortMode, selectedLanguage, excludedKeywords, showFilteredResults, ratingFilter, contentSafetySettings.ageConfirmation],
  );
  const hiddenBookmarkedResultCount = useMemo(
    () => hideBookmarkedResults ? locallyFilteredResults.filter((result) => bookmarkUrls.has(result.url.trim())).length : 0,
    [hideBookmarkedResults, locallyFilteredResults, bookmarkUrls],
  );
  const displayedResults = useMemo(
    () => hideBookmarkedResults ? locallyFilteredResults.filter((result) => !bookmarkUrls.has(result.url.trim())) : locallyFilteredResults,
    [hideBookmarkedResults, locallyFilteredResults, bookmarkUrls],
  );
  const localResultPageCount = Math.max(1, Math.ceil(displayedResults.length / resultsPerPage));
  const visibleResults = useMemo(
    () => displayedResults.slice((localResultPage - 1) * resultsPerPage, localResultPage * resultsPerPage),
    [displayedResults, localResultPage, resultsPerPage],
  );
  const usesSourcePagination = pagination.totalPages > 1;
  const unifiedCurrentPage = usesSourcePagination ? pagination.page : localResultPage;
  const unifiedPageCount = usesSourcePagination ? pagination.totalPages : localResultPageCount;
  const activeFilterCount = [
    selectedLanguage !== "all",
    wordCountFilter !== "all",
    completionFilter !== "all",
    contentSafetySettings.ageConfirmation === "adult" && ratingFilter !== "all",
    Boolean(activePlatformFilter),
    selectedPlatforms.length !== PLATFORMS.length,
    excludedKeywords.length > 0,
    hideBookmarkedResults,
  ].filter(Boolean).length;
  const activeFilterChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; clear: () => void }> = [];
    if (selectedLanguage !== "all") {
      const label = selectedLanguage === "zh" ? "中文" : selectedLanguage === "zh-hant" ? "繁體" : selectedLanguage === "zh-hans" ? "簡體" : selectedLanguage === "en" ? "英文" : "日文";
      chips.push({ id: "language", label, clear: () => setSelectedLanguage("all") });
    }
    if (wordCountFilter !== "all") chips.push({ id: "words", label: wordCountFilter === "short" ? "1,000 字以下" : wordCountFilter === "medium" ? "1,000–10,000 字" : "10,000 字以上", clear: () => setWordCountFilter("all") });
    if (completionFilter !== "all") chips.push({ id: "completion", label: completionFilter === "complete" ? "僅完結" : "僅連載", clear: () => setCompletionFilter("all") });
    if (sortMode !== "relevance") chips.push({ id: "sort", label: sortMode === "updated" ? "最新更新" : "字數最多", clear: () => setSortMode("relevance") });
    if (contentSafetySettings.ageConfirmation === "adult" && ratingFilter !== "all") chips.push({ id: "rating", label: ratingFilter === "safe" ? "僅全年齡" : "僅 R18", clear: () => setRatingFilter("all") });
    if (activePlatformFilter) chips.push({ id: "result-platform", label: `${platformMeta(activePlatformFilter).label} 結果`, clear: () => setActivePlatformFilter(null) });
    if (selectedPlatforms.length !== PLATFORMS.length) chips.push({ id: "sources", label: `${selectedPlatforms.length} 個來源`, clear: () => setSelectedPlatforms(PLATFORMS.map((platform) => platform.id)) });
    if (excludedKeywords.length > 0 && !showFilteredResults) chips.push({ id: "blacklist", label: "避雷生效中", clear: () => setShowFilteredResults(true) });
    if (hideBookmarkedResults) chips.push({ id: "bookmarks", label: `隱藏已收藏${hiddenBookmarkedResultCount ? ` ${hiddenBookmarkedResultCount} 篇` : ""}`, clear: () => setHideBookmarkedResults(false) });
    return chips;
  }, [selectedLanguage, wordCountFilter, completionFilter, sortMode, contentSafetySettings.ageConfirmation, ratingFilter, activePlatformFilter, selectedPlatforms.length, excludedKeywords.length, showFilteredResults, hideBookmarkedResults, hiddenBookmarkedResultCount]);
  const languageCounts = useMemo(
    () => Object.fromEntries(
      (["all", "zh", "zh-hant", "zh-hans", "en", "ja"] as const).map((language) => [language, countLanguageResults(results.filter((result) => !matchesExcludedKeyword(result, excludedKeywords)), language)]),
    ) as Record<LanguageFilter, number>,
    [results, excludedKeywords],
  );
  const filteredResultCount = useMemo(
    () => results.filter((result) => matchesExcludedKeyword(result, excludedKeywords)).length,
    [results, excludedKeywords],
  );
  const isRetryingSinglePlatform = isSearchPending && Boolean(retryingPlatformId);
  const sourceProgress = useMemo(() => {
    const selectedStatuses = platformStatuses.filter((status) => selectedPlatforms.includes(status.platformId as PlatformId));
    const trackedStatuses = isRetryingSinglePlatform && retryingPlatformId ? selectedStatuses.filter((status) => status.platformId === retryingPlatformId) : selectedStatuses;
    const responded = trackedStatuses.filter((status) => status.status === "success" || status.status === "empty").length;
    const blocked = trackedStatuses.filter((status) => status.status === "blocked" || status.status === "cooldown" || status.status === "error").length;
    const total = isRetryingSinglePlatform ? 1 : selectedPlatforms.length;
    const pending = isSearchPending ? Math.max(0, total - responded - blocked) : 0;
    return { total, responded, pending, blocked };
  }, [platformStatuses, selectedPlatforms, isSearchPending, isRetryingSinglePlatform]);

  useEffect(() => {
    setBookmarks(loadBookmarks());
    const savedCustomMappings = loadCustomCpMappings();
    setCustomCpMappings(savedCustomMappings);
    setCpMappings(mergeCpMappings(savedCustomMappings));
    setSearchHistory(loadSearchHistory());
    setPinnedQueries(loadPinnedQueries());
    const savedBlacklistGroups = loadBlacklistGroups();
    setBlacklistGroups(savedBlacklistGroups);
    setExcludedKeywords(activeBlacklistKeywords(savedBlacklistGroups).length ? activeBlacklistKeywords(savedBlacklistGroups) : loadExcludedKeywords());
    const savedContentSafety = loadContentSafetySettings();
    setContentSafetySettings(savedContentSafety);
    if (savedContentSafety.ageConfirmation === "minor") setRatingFilter("safe");
    if (savedContentSafety.ageConfirmation === "adult") setRatingFilter("all");
    const preset = loadFilterPreset();
    setWordCountFilter(preset.wordCount);
    setCompletionFilter(preset.completion);
    setSortMode(preset.sort);
    setHideBookmarkedResults(preset.hideBookmarked === true);
    let mounted = true;
    const initialRevision = personalDataRevisionRef.current;
    void hydratePersonalLibrary().then((snapshot) => {
      if (!mounted || personalDataRevisionRef.current !== initialRevision) return;
      setBookmarks(snapshot.bookmarks);
      setCustomCpMappings(snapshot.customCpMappings);
      setCpMappings(mergeCpMappings(snapshot.customCpMappings));
      setSearchHistory(snapshot.searchHistory);
      setPinnedQueries(snapshot.pinnedQueries);
      setBlacklistGroups(snapshot.blacklistGroups);
      setExcludedKeywords(activeBlacklistKeywords(snapshot.blacklistGroups).length ? activeBlacklistKeywords(snapshot.blacklistGroups) : snapshot.excludedKeywords);
      setContentSafetySettings(snapshot.contentSafetySettings);
      if (snapshot.contentSafetySettings.ageConfirmation === "minor") setRatingFilter("safe");
      if (snapshot.contentSafetySettings.ageConfirmation === "adult") setRatingFilter("all");
      setWordCountFilter(snapshot.filterPreset.wordCount);
      setCompletionFilter(snapshot.filterPreset.completion);
      setSortMode(snapshot.filterPreset.sort);
      setHideBookmarkedResults(snapshot.filterPreset.hideBookmarked === true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    setLocalResultPage(1);
  }, [activeQuery, activePlatformFilter, selectedLanguage, wordCountFilter, completionFilter, sortMode, ratingFilter, showFilteredResults, hideBookmarkedResults, bookmarks, resultsPerPage, pagination.page]);

  useEffect(() => {
    window.localStorage.setItem("fanfic-atlas-result-view", resultViewMode);
  }, [resultViewMode]);

  useEffect(() => {
    window.localStorage.setItem("fanfic-atlas-results-per-page", String(resultsPerPage));
  }, [resultsPerPage]);

  useEffect(() => {
    const updateScrollButton = () => setShowScrollToTop(window.scrollY > 300);
    updateScrollButton();
    window.addEventListener("scroll", updateScrollButton, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollButton);
  }, []);

  useEffect(() => {
    if (!isSearchPending) return;
    const timer = window.setInterval(() => {
      if (searchStartedAt.current !== null) {
        setElapsedMs(performance.now() - searchStartedAt.current);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [isSearchPending]);

  const checkForAppUpdate = async (origin: "startup" | "manual") => {
    if (!desktopRuntime) {
      if (origin === "manual") showInfoToast("更新檢查僅適用於已安裝的 Fanfic Atlas 桌面版。");
      return;
    }
    if (updaterCheckInFlightRef.current) {
      if (origin === "manual") showInfoToast("正在檢查更新，請稍候。 ");
      return;
    }

    updaterCheckInFlightRef.current = true;
    setUpdateCheckPending(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      // Tauri v2 returns an Update object or null. `available` is deprecated
      // and therefore must not gate this prompt.
      const update = await check();
      if (!update) {
        if (origin === "manual") toast.success("目前已是最新版本", { description: `Fanfic Atlas v${desktopVersion}` });
        return;
      }
      setAvailableUpdate(update as DesktopUpdate);
      setUpdateDownloadPercent(0);
      setUpdateDialogOpen(true);
    } catch (error) {
      const diagnostic = describeUpdaterCheckError(error);
      console.error("[Updater] Update check failed", {
        endpoint: UPDATER_MANIFEST_URL,
        statusCode: extractUpdaterHttpStatus(error),
        diagnostic,
        error,
      });
      if (origin === "manual") {
        toast.error(diagnostic.title, { description: diagnostic.description });
      }
    } finally {
      updaterCheckInFlightRef.current = false;
      setUpdateCheckPending(false);
    }
  };

  const installAvailableUpdate = async () => {
    if (!availableUpdate || updateInstallPending) return;
    setUpdateInstallPending(true);
    setUpdateDownloadPercent(0);
    let downloadedBytes = 0;
    let totalBytes: number | undefined;
    try {
      await availableUpdate.download((event) => {
        if (event.event === "Started") {
          downloadedBytes = 0;
          totalBytes = event.data.contentLength;
          setUpdateDownloadPercent(0);
        }
        if (event.event === "Progress") {
          downloadedBytes += event.data.chunkLength;
          if (totalBytes && totalBytes > 0) {
            setUpdateDownloadPercent(Math.min(99, Math.round((downloadedBytes / totalBytes) * 100)));
          }
        }
        if (event.event === "Finished") setUpdateDownloadPercent(100);
      });
      await availableUpdate.install();
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (error) {
      console.error("[Updater] Update installation failed:", error);
      setUpdateInstallPending(false);
      toast.error("更新未完成", { description: "下載或驗證失敗，請稍後重新檢查更新。" });
    }
  };

  useEffect(() => {
    if (!desktopRuntime) return;
    let mounted = true;
    setSidecarState("starting");
    void waitForSidecarReady()
      .then(() => mounted && setSidecarState("ready"))
      .catch(() => mounted && setSidecarState("error"));

    setDesktopVersion(FALLBACK_DESKTOP_VERSION);
    void checkForAppUpdate("startup");

    return () => { mounted = false; };
  }, [desktopRuntime]);

  const togglePlatform = (platform: PlatformId) => {
    setSelectedPlatforms((current) => {
      if (current.includes(platform)) {
        return current.length === 1 ? current : current.filter((item) => item !== platform);
      }
      return [...current, platform];
    });
  };

  const togglePlatformQuickFilter = (platform: PlatformId) => {
    setActivePlatformFilter((current) => current === platform ? null : platform);
  };

  const navigateToAuthor = (author: string) => {
    if (!isNavigableAuthor(author)) return;
    const cleanAuthor = author.trim();
    setKeyword(cleanAuthor);
    setSearchMode("author");
    runSearch(false, cleanAuthor, undefined, "author");
  };

  const runSearch = (forceRefresh: boolean, requestedKeyword?: string, platformOverride?: PlatformId[], requestedMode: "keyword" | "author" = searchMode) => {
    const trimmedKeyword = (requestedKeyword ?? keyword).trim();
    if (!trimmedKeyword) {
      toast.error("請先輸入搜尋關鍵字");
      return;
    }
    const retryPlatform = platformOverride?.length === 1 ? platformOverride[0] : null;
    const requestId = searchRequestGateRef.current.begin();
    personalDataRevisionRef.current += 1;
    retryingPlatformRef.current = retryPlatform;
    setActiveQuery(trimmedKeyword);
    const nextHistory = recordSearch(searchHistory, trimmedKeyword);
    setSearchHistory(nextHistory);
    persistSearchHistory(nextHistory);
    setActiveView("search");
    setSearchWarning(null);
    if (!retryPlatform) setActivePlatformFilter(null);
    if (!retryPlatform) setPlatformStatuses([]);
    setElapsedMs(0);
    setCompletedElapsedMs(null);
    searchStartedAt.current = performance.now();
    if (!retryPlatform) {
      setPagination({ totalWorks: 0, totalPages: 0, page: 1, loadedThroughPage: 0, nextPage: null, hasMore: false });
    }
    const requestData = { keyword: trimmedKeyword, mode: requestedMode, platforms: platformOverride ?? selectedPlatforms, page: 1, forceRefresh, customCpMappings };
    const cacheKey = createSearchCacheKey(requestData);
    if (!forceRefresh) {
      if (desktopRuntime) activeDesktopSearchAbortRef.current?.abort();
      const cachedPayload = readSearchRequestCache<unknown>(cacheKey);
      if (cachedPayload) {
        if (desktopRuntime) setDesktopSearchPending(false);
        handleSearchSuccess(cachedPayload);
        showInfoToast("已載入 15 分鐘內的本機搜尋快取。");
        return;
      }
    }
    requestSearch({
      path: "/search",
      method: "POST",
      data: { ...requestData, clientRequestId: requestId },
    }, requestId, desktopRuntime && !forceRefresh ? cacheKey : null);
  };

  const retrySinglePlatform = (event: React.MouseEvent<HTMLButtonElement>, platform: PlatformId) => {
    event.preventDefault();
    event.stopPropagation();
    setRetryingPlatformId(platform);
    runSearch(true, activeQuery || keyword, [platform]);
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(false);
  };

  const goToSourcePage = (page: number) => {
    if (!activeQuery || page < 1 || page > pagination.totalPages || page === pagination.page || isSearchPending) return;
    const requestId = searchRequestGateRef.current.begin();
    searchStartedAt.current = performance.now();
    setElapsedMs(0);
    setCompletedElapsedMs(null);
    setSearchWarning(null);
    const requestData = { keyword: activeQuery, mode: searchMode, platforms: selectedPlatforms, page, forceRefresh: false, customCpMappings };
    const cacheKey = createSearchCacheKey(requestData);
    const cachedPayload = readSearchRequestCache<unknown>(cacheKey);
    if (cachedPayload) {
      handleSearchSuccess(cachedPayload);
      showInfoToast("已載入此頁的本機搜尋快取。");
      return;
    }
    requestSearch({ path: "/search", method: "POST", data: { ...requestData, clientRequestId: requestId } }, requestId, desktopRuntime ? cacheKey : null);
  };

  const goToUnifiedPage = (page: number) => {
    if (usesSourcePagination) {
      goToSourcePage(page);
      return;
    }
    setLocalResultPage(page);
  };

  const goToPreviousUnifiedPage = () => {
    if (localResultPage > 1) {
      setLocalResultPage((page) => page - 1);
      return;
    }
    if (usesSourcePagination) goToSourcePage(pagination.page - 1);
  };

  const goToNextUnifiedPage = () => {
    if (localResultPage < localResultPageCount) {
      setLocalResultPage((page) => page + 1);
      return;
    }
    if (usesSourcePagination) goToSourcePage(pagination.page + 1);
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  const saveBookmark = (value: { result: SearchResult; rating: number; notes: string; tags: string[]; shelf: "to-read" | "favorite" }) => {
    personalDataRevisionRef.current += 1;
    const next = upsertBookmark(bookmarks, { url: value.result.url, ...value });
    setBookmarks(next);
    persistBookmarks(next);
    setBookmarkDialogOpen(false);
    toast.success("已更新閱讀清單");
  };

  const openExternalUrl = async (
    event: React.MouseEvent<HTMLAnchorElement>,
    url: string,
    successMessage?: string,
  ) => {
    if (!isTauriDesktopRuntime()) return;

    event.preventDefault();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      if (successMessage) showInfoToast(successMessage);
    } catch (error) {
      console.error("[External Opener] Failed to open an external source:", { url, error });
      showInfoToast("無法以系統瀏覽器開啟來源，請稍後重試。");
    }
  };

  const removeBookmark = (url: string) => {
    personalDataRevisionRef.current += 1;
    const next = bookmarks.filter((bookmark) => bookmark.url !== url);
    setBookmarks(next);
    persistBookmarks(next);
    showInfoToast("已從閱讀清單移除");
  };

  const importBookmarks = (incoming: BookmarkRecord[]) => {
    if (!incoming.length) { toast.error("找不到可還原的 JSON 藏書資料"); return; }
    personalDataRevisionRef.current += 1;
    const next = mergeImportedBookmarks(bookmarks, incoming);
    setBookmarks(next);
    persistBookmarks(next);
    toast.success(`已匯入 ${incoming.length} 筆藏書`, { description: `藏書閣目前共有 ${next.length} 筆。` });
  };

  const clearHistory = () => {
    personalDataRevisionRef.current += 1;
    setSearchHistory([]);
    clearSearchHistory();
  };

  const removeHistoryEntry = (entry: string) => {
    personalDataRevisionRef.current += 1;
    setSearchHistory((current) => {
      const next = current.filter((item) => item !== entry);
      persistSearchHistory(next);
      return next;
    });
  };

  const pinCurrentQuery = () => {
    personalDataRevisionRef.current += 1;
    const next = togglePinnedQuery(pinnedQueries, keyword || activeQuery);
    setPinnedQueries(next);
    persistPinnedQueries(next);
  };

  const updateExcludedKeywords = (next: string[]) => {
    personalDataRevisionRef.current += 1;
    const normalized = normalizeExcludedKeywordList(next);
    setExcludedKeywords(normalized);
    persistExcludedKeywords(normalized);
  };

  const updateBlacklistGroups = (nextGroups: BlacklistGroup[]) => {
    personalDataRevisionRef.current += 1;
    const activeKeywords = activeBlacklistKeywords(nextGroups);
    setBlacklistGroups(nextGroups);
    setExcludedKeywords(activeKeywords);
    persistBlacklistGroups(nextGroups);
  };

  const updateBookmarkProgress = (url: string, progress: BookmarkRecord["progress"]) => {
    personalDataRevisionRef.current += 1;
    const next = bookmarks.map((bookmark) => bookmark.url === url ? { ...bookmark, progress, updatedAt: new Date().toISOString() } : bookmark);
    setBookmarks(next);
    persistBookmarks(next);
  };

  const batchUpdateBookmarks = (urls: string[], patch: Parameters<typeof updateBookmarksBatch>[2]) => {
    personalDataRevisionRef.current += 1;
    const next = updateBookmarksBatch(bookmarks, urls, patch);
    setBookmarks(next);
    persistBookmarks(next);
    toast.success(`已更新 ${urls.length} 筆藏書`);
  };

  const batchRemoveBookmarks = (urls: string[]) => {
    personalDataRevisionRef.current += 1;
    const targets = new Set(urls);
    const next = bookmarks.filter((bookmark) => !targets.has(bookmark.url));
    setBookmarks(next);
    persistBookmarks(next);
    toast.success(`已移除 ${urls.length} 筆藏書`);
  };

  const exportAllPersonalData = () => {
    const body = serializeFullPersonalBackup({ bookmarks, customCpMappings, searchHistory, pinnedQueries, blacklistGroups, filterPreset: { wordCount: wordCountFilter, completion: completionFilter, sort: sortMode }, contentSafetySettings });
    const url = URL.createObjectURL(new Blob([body], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fanfic-atlas-complete-backup.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importAllPersonalData = (text: string) => {
    const backup = parseFullPersonalBackup(text);
    if (!backup) { toast.error("找不到可還原的完整備份資料"); return; }
    personalDataRevisionRef.current += 1;
    setBookmarks(backup.bookmarks); persistBookmarks(backup.bookmarks);
    setCustomCpMappings(backup.customCpMappings); setCpMappings(mergeCpMappings(backup.customCpMappings)); persistCpMappings(backup.customCpMappings);
    setSearchHistory(backup.searchHistory); persistSearchHistory(backup.searchHistory);
    setPinnedQueries(backup.pinnedQueries); persistPinnedQueries(backup.pinnedQueries);
    setBlacklistGroups(backup.blacklistGroups); setExcludedKeywords(activeBlacklistKeywords(backup.blacklistGroups)); persistBlacklistGroups(backup.blacklistGroups);
    setWordCountFilter(backup.filterPreset.wordCount); setCompletionFilter(backup.filterPreset.completion); setSortMode(backup.filterPreset.sort); persistFilterPreset(backup.filterPreset);
    setContentSafetySettings(backup.contentSafetySettings); persistContentSafetySettings(backup.contentSafetySettings);
    toast.success("已完整還原個人資料", { description: `包含 ${backup.bookmarks.length} 筆藏書與 ${backup.blacklistGroups.length} 組避雷設定。` });
  };

  const confirmAge = (ageConfirmation: "adult" | "minor") => {
    personalDataRevisionRef.current += 1;
    const next = { ...contentSafetySettings, ageConfirmation };
    setContentSafetySettings(next);
    if (ageConfirmation === "minor") setRatingFilter("safe");
    if (ageConfirmation === "adult") setRatingFilter("all");
    persistContentSafetySettings(next);
  };

  const setSensitiveSummaryBlur = (blurRestrictedSummaries: boolean) => {
    personalDataRevisionRef.current += 1;
    const next = { ...contentSafetySettings, blurRestrictedSummaries };
    setContentSafetySettings(next);
    persistContentSafetySettings(next);
  };

  const updateCpMappings = (nextCustomMappings: CpMapping[]) => {
    personalDataRevisionRef.current += 1;
    setCustomCpMappings(nextCustomMappings);
    setCpMappings(mergeCpMappings(nextCustomMappings));
    persistCpMappings(nextCustomMappings);
  };

  const saveCurrentFilters = () => {
    personalDataRevisionRef.current += 1;
    persistFilterPreset({ wordCount: wordCountFilter, completion: completionFilter, sort: sortMode, hideBookmarked: hideBookmarkedResults });
    toast.success("已設為預設篩選", { description: "下次開啟網站時會自動帶入這組設定。" });
  };

  const updateHideBookmarkedResults = (next: boolean) => {
    personalDataRevisionRef.current += 1;
    setHideBookmarkedResults(next);
    persistFilterPreset({ wordCount: wordCountFilter, completion: completionFilter, sort: sortMode, hideBookmarked: next });
  };

  const resetAllFilters = () => {
    personalDataRevisionRef.current += 1;
    setSelectedLanguage("all");
    setWordCountFilter("all");
    setCompletionFilter("all");
    setSortMode("relevance");
    setActivePlatformFilter(null);
    setSelectedPlatforms(PLATFORMS.map((platform) => platform.id));
    setRatingFilter(contentSafetySettings.ageConfirmation === "minor" ? "safe" : "all");
    setShowFilteredResults(false);
    setHideBookmarkedResults(false);
    setRevealedFilteredUrls(new Set());
    persistFilterPreset({ wordCount: "all", completion: "all", sort: "relevance", hideBookmarked: false });
    toast.success("已清除本次搜尋篩選", { description: "全局避雷分組與內容保護設定維持生效。" });
  };

  return (
    <div className="fanfic-app overflow-hidden">

      <header className="relative z-10 border-b border-[color:var(--atlas-line)] bg-[color:var(--atlas-bg)]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="brand-mark flex h-10 w-10 items-center justify-center">
              <span className="text-lg font-extrabold">A</span>
            </div>
            <div>
              <div className="text-base font-extrabold tracking-[-0.04em]">Fanfic Atlas</div>
              <div className="mt-0.5 text-xs text-[color:var(--atlas-muted)]">跨平台同人閱讀</div>
            </div>
          </div>
          <div className="hidden items-center gap-5 text-xs text-[color:var(--atlas-muted)] md:flex">
            <span>搜尋</span><span>{PLATFORMS.length} 個來源</span><span>私人藏書</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-[color:var(--atlas-muted)]">
            <Button type="button" variant="ghost" onClick={() => setCpManagerOpen(true)} className="hidden h-9 border-0 bg-[color:var(--atlas-elevated)] px-3 text-xs font-semibold text-[color:var(--atlas-ink)] hover:bg-[color:var(--atlas-indigo-soft)] lg:inline-flex"><Tags className="mr-2 h-3.5 w-3.5" />CP 詞庫</Button>
            <span className="h-2 w-2 rounded-full bg-[#0f766e]" />已連線
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1160px] px-5 pb-20 pt-12 sm:px-8 lg:pt-16">
        <section className="grid items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <h1 className="max-w-3xl text-[clamp(2.65rem,5vw,4.6rem)] font-extrabold">把想讀的故事<br /><span className="text-[color:var(--atlas-indigo)]">留在這裡。</span></h1>
            <p className="mt-5 max-w-xl text-base leading-8 text-[color:var(--atlas-muted)]">從多個公開來源找到作品，依照你的閱讀習慣、分級與避雷設定，安靜地整理成自己的書架。</p>
          </div>
          <div className="atlas-panel hidden p-6 lg:block">
            <div className="text-sm font-semibold">你的私人閱讀空間</div>
            <p className="mt-3 text-sm leading-6 text-[color:var(--atlas-muted)]">搜尋結果只做索引與導流；收藏、筆記、避雷與閱讀進度都保留在你的裝置。</p>
            <div className="mt-6 flex items-center gap-2 text-sm text-[color:var(--atlas-indigo)]"><span className="h-2 w-2 rounded-full bg-current" />準備好開始搜尋</div>
          </div>
        </section>

        <section className="mt-10 flex flex-col gap-3 border-b border-[color:var(--atlas-line)] pb-3 sm:mt-14 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => setActiveView("search")} className={`h-10 rounded-none border-b-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${activeView === "search" ? "border-[#10151b] bg-white/65 text-[#10151b]" : "border-transparent text-[#75838b] hover:bg-white/60"}`}><Search className="mr-2 h-3.5 w-3.5" />搜尋索引</Button>
            <Button type="button" variant="ghost" onClick={() => setActiveView("bookmarks")} className={`h-10 rounded-none border-b-2 px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] ${activeView === "bookmarks" ? "border-[#10151b] bg-white/65 text-[#10151b]" : "border-transparent text-[#75838b] hover:bg-white/60"}`}><BookMarked className="mr-2 h-3.5 w-3.5" />藏書閣 / 收藏夾 <span className="ml-2 text-[#e27d9d]">{bookmarks.length}</span></Button>
          </div>
          <Button type="button" variant="outline" onClick={() => setCpManagerOpen(true)} className="h-9 rounded-none border-[#10151b]/15 bg-white/55 font-mono text-[10px] font-bold uppercase tracking-[0.13em] hover:border-[#45b9b2] lg:hidden"><Tags className="mr-2 h-3.5 w-3.5" />CP 詞庫管理</Button>
        </section>

        <section className="reader-command relative mt-6 px-4 py-4 sm:px-6 sm:py-5">
          <form onSubmit={submitSearch} className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex flex-1 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${searchMode === "author" ? "bg-amber-50 text-amber-700" : "bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]"}`}>{searchMode === "author" ? <UserRound className="h-5 w-5 shrink-0" /> : <Search className="h-5 w-5 shrink-0" />}</div><div className="relative min-w-0 flex-1"><div className="reader-segmented mb-2 flex w-fit"><Button type="button" variant="ghost" aria-pressed={searchMode === "keyword"} onClick={() => setSearchMode("keyword")} className={`h-7 px-3 text-xs font-semibold ${searchMode === "keyword" ? "bg-white text-[color:var(--atlas-indigo)] shadow-sm" : "text-[color:var(--atlas-muted)]"}`}>關鍵字 / CP</Button><Button type="button" variant="ghost" aria-pressed={searchMode === "author"} onClick={() => setSearchMode("author")} className={`h-7 px-3 text-xs font-semibold ${searchMode === "author" ? "bg-white text-amber-700 shadow-sm" : "text-[color:var(--atlas-muted)]"}`}>作者</Button></div><Input value={keyword} onChange={(event) => { setKeyword(event.target.value); setHistoryMenuOpen(false); }} onFocus={() => setHistoryMenuOpen(true)} onBlur={(event) => { const nextFocus = event.relatedTarget; if (!(nextFocus instanceof Node) || !historyMenuRef.current?.contains(nextFocus)) setHistoryMenuOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") setHistoryMenuOpen(false); }} placeholder={searchMode === "author" ? "輸入作者暱稱、繪師或社團名..." : "輸入角色、配對、作品名或關鍵字"} className="h-10 border-0 bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0 sm:text-xl" aria-label="搜尋同人作品" />{historyMenuOpen && searchHistory.length > 0 && <div ref={historyMenuRef} aria-label="最近搜尋" className="absolute left-0 right-0 top-full z-30 mt-3 overflow-hidden rounded-2xl border border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)]/95 p-2 shadow-[0_18px_42px_rgba(29,28,45,0.16)] backdrop-blur-xl"><div className="mb-1 flex items-center justify-between px-2 py-1"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[color:var(--atlas-muted)]"><History className="h-3.5 w-3.5" />最近搜尋</span><button type="button" onClick={() => { clearHistory(); setHistoryMenuOpen(false); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)]">清空</button></div>{searchHistory.map((entry) => <div key={entry} className="group flex items-center gap-1 rounded-xl px-2 transition-colors hover:bg-[color:var(--atlas-indigo-soft)]"><button type="button" onClick={() => { setKeyword(entry); setSearchMode("keyword"); setHistoryMenuOpen(false); runSearch(false, entry); }} className="min-w-0 flex-1 truncate py-2 text-left text-sm font-semibold text-[color:var(--atlas-ink)]">{entry}</button><button type="button" onClick={() => removeHistoryEntry(entry)} aria-label={`刪除最近搜尋 ${entry}`} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[color:var(--atlas-muted)] opacity-0 transition-opacity hover:bg-white hover:text-[color:var(--atlas-danger)] focus-visible:opacity-100 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button></div>)}</div>}{searchMode === "author" && <div className="mt-1 text-xs text-amber-700">正在搜尋作者：{keyword}</div>}</div></div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="outline" onClick={() => runSearch(true)} disabled={isSearchPending || !keyword.trim()} aria-label="強制重新抓取" className="h-11 rounded-xl border-[color:var(--atlas-line)] bg-white/80 text-[color:var(--atlas-muted)] hover:border-[color:var(--atlas-indigo)] hover:text-[color:var(--atlas-indigo)]"><RotateCw className={`h-4 w-4 ${isSearchPending ? "animate-spin" : ""}`} /><span className="sr-only">強制重新抓取</span></Button>
              <Button type="submit" disabled={isSearchPending} aria-label={isSearchPending ? "SCANNING" : "RUN SEARCH"} className="h-11 min-w-36 bg-[color:var(--atlas-indigo)] px-6 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(79,70,229,0.24)] hover:bg-[#4338ca]">{isSearchPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{isSearchPending ? "搜尋中" : "開始搜尋"}</Button>
            </div>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--atlas-line)] pt-3"><Button type="button" variant="outline" onClick={pinCurrentQuery} disabled={!(keyword || activeQuery).trim()} className="h-8 rounded-full border-[color:var(--atlas-danger-line)] bg-[color:var(--atlas-danger-soft)] px-3 text-xs font-semibold text-[color:var(--atlas-danger)] hover:bg-[#ffe4eb]">釘選目前搜尋詞</Button>{pinnedQueries.map((entry) => <button key={entry} type="button" onClick={() => { setKeyword(entry); setSearchMode("keyword"); runSearch(false, entry); }} className="rounded-full bg-[color:var(--atlas-indigo-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--atlas-indigo)] hover:bg-white">{entry}</button>)}</div>
          <div className="mt-3 border-t border-[#10151b]/10 pt-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 border border-[#111826]/15 bg-white/70 p-1" aria-label="語言快速篩選">
                  {(["all", "zh-hant", "zh-hans", "ja", "en"] as const).map((lang) => <button key={lang} type="button" onClick={() => setSelectedLanguage(lang)} className={`h-7 px-2 font-mono text-[9px] font-bold tracking-[0.08em] transition-colors ${selectedLanguage === lang ? "bg-[#111826] text-white" : "text-[#61707a] hover:bg-[#f0ece1]"}`}>{lang === "all" ? "全部" : lang === "zh-hant" ? "繁體" : lang === "zh-hans" ? "簡體" : lang === "ja" ? "日文" : "英文"}</button>)}
                </div>
                <div className="flex items-center gap-1 border border-[#efb4c4] bg-[#fff7f9] p-1" aria-label="內容分級快速篩選">
                  {(["all", "safe", "r18"] as const).map((rating) => <button key={rating} type="button" disabled={contentSafetySettings.ageConfirmation !== "adult" && rating !== "safe"} onClick={() => setRatingFilter(rating)} className={`h-7 px-2 font-mono text-[9px] font-bold tracking-[0.08em] transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${ratingFilter === rating ? "bg-[#9b4358] text-white" : "text-[#8b3e59] hover:bg-[#ffe5eb]"}`}>{rating === "all" ? "全部" : rating === "safe" ? "全年齡" : "R18"}</button>)}
                </div>
                <Button type="button" variant="outline" onClick={() => setShowFilters((current) => !current)} className={`h-9 rounded-none border-[#111826]/20 bg-white/80 font-mono text-[9px] font-bold uppercase tracking-[0.12em] hover:border-[#2d70d6] hover:bg-[#e6efff] ${activeFilterCount ? "border-[#2d70d6] bg-[#e6efff] text-[#245da9]" : ""}`}><SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />進階篩選 {activeFilterCount > 0 && <span className="ml-1.5 inline-flex min-w-5 items-center justify-center bg-[#2d70d6] px-1.5 py-0.5 font-mono text-[9px] font-bold text-white">{activeFilterCount}</span>}<ChevronDown className={`ml-1.5 h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} /></Button>
                {activeFilterCount > 0 && <Button type="button" variant="outline" onClick={resetAllFilters} className="h-9 rounded-none border-[#e8a7bf] bg-[#fff5f7] px-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-[#8b3e59] hover:bg-[#ffe8f0]">清除本次條件</Button>}
              </div>
              {contentSafetySettings.ageConfirmation === "minor" && <span className="font-mono text-[9px] font-bold tracking-[0.1em] text-[#2d70d6]">全年齡保護已啟用</span>}
            </div>
            {activeFilterChips.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="目前生效的篩選條件"><span className="font-mono text-[9px] font-bold uppercase tracking-[0.13em] text-[#75838b]">篩選中</span>{activeFilterChips.map((chip) => <button key={chip.id} type="button" onClick={chip.clear} className="inline-flex items-center gap-1 border border-[#b7c9ef] bg-[#e6efff] px-2 py-1 font-mono text-[9px] font-bold text-[#245da9] hover:border-[#2d70d6] hover:bg-white" aria-label={`移除篩選 ${chip.label}`}>{chip.label}<X className="h-3 w-3" /></button>)}</div>}
          </div>
          {desktopRuntime && sidecarState !== "ready" && <div className={`mt-3 border-t border-[#10151b]/10 pt-3 font-mono text-[10px] font-bold tracking-[0.13em] ${sidecarState === "error" ? "text-[#9b4358]" : "text-[#197b75]"}`} aria-live="polite">{sidecarState === "error" ? "搜尋引擎尚未就緒；系統會在搜尋時再次嘗試連線。" : "正在啟動搜尋引擎..."}</div>}
          {isSearchPending && <div className="mt-3 border-t border-[#10151b]/10 pt-3" aria-live="polite"><div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] font-bold tracking-[0.11em] text-[#197b75]"><Loader2 className="h-3.5 w-3.5 animate-spin" />{desktopRuntime && sidecarState === "starting" ? "正在等待搜尋引擎就緒..." : isRetryingSinglePlatform && retryingPlatformId ? `正在重試 ${platformMeta(retryingPlatformId).label} · 僅更新此來源` : `正在查詢 ${sourceProgress.total} 個來源 · ${sourceProgress.responded} 已回應 · ${sourceProgress.pending} 查詢中 · ${sourceProgress.blocked} 受阻`}<span className="text-[#75838b]">· {(elapsedMs / 1000).toFixed(1)} 秒</span></div><div className="mt-2 h-1 overflow-hidden bg-[#d6e5e1]"><div className="h-full w-2/5 animate-pulse bg-[#45b9b2]" /></div></div>}
          {showFilters && (
            <div className="mt-4 grid gap-5 border-t border-[#10151b]/10 pt-4 lg:grid-cols-[1.25fr_repeat(3,0.75fr)]">
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
              <label className="flex items-center gap-3 border border-[#b7c9ef] bg-[#f4f7ff] px-3 py-3 lg:col-span-2">
                <Checkbox checked={hideBookmarkedResults} onCheckedChange={(value) => updateHideBookmarkedResults(value === true)} aria-label="隱藏已在藏書閣作品" className="rounded-none border-[#2d70d6] data-[state=checked]:bg-[#2d70d6]" />
                <span><span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#245da9]">隱藏已在藏書閣作品</span><span className="mt-1 block text-xs text-[#69777f]">只在目前裝置即時比對 URL；不會重新搜尋。{bookmarks.length ? ` 已比對 ${bookmarks.length} 本藏書。` : ""}</span></span>
              </label>
              <BlacklistGroupManager groups={blacklistGroups} onGroupsChange={updateBlacklistGroups} />
              {contentSafetySettings.ageConfirmation === "adult" && <label className="flex items-center gap-3 border border-[#efb4c4] bg-[#fff7f9] px-3 py-3 lg:col-span-4"><Checkbox checked={contentSafetySettings.blurRestrictedSummaries} onCheckedChange={(value) => setSensitiveSummaryBlur(value === true)} aria-label="敏感內容模糊" className="rounded-none border-[#9b4358] data-[state=checked]:bg-[#9b4358]" /><span><span className="block font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#9b4358]">敏感內容模糊</span><span className="mt-1 block text-xs text-[#69777f]">限制級作品的摘要預設模糊，點擊後才會展開。</span></span></label>}
              <div className="flex items-end lg:col-span-4"><Button type="button" variant="outline" onClick={saveCurrentFilters} className="h-10 rounded-none border-[#10151b]/15 bg-white/65 font-mono text-[10px] font-bold uppercase tracking-[0.13em] hover:border-[#45b9b2] hover:bg-[#d9f8f5] hover:text-[#197b75]"><Save className="mr-2 h-3.5 w-3.5" />設為預設篩選</Button><span className="ml-3 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#8b979d]">保留字數、完結、排序與藏書閣隱藏偏好</span></div>
            </div>
          )}
        </section>

        <section className="mt-10 flex flex-col gap-3 border-b border-[color:var(--atlas-line)] pb-5 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-3xl font-extrabold sm:text-4xl">{activeView === "bookmarks" ? `藏書閣 · ${bookmarks.length.toLocaleString()} 本` : searchMutation.isPending ? "正在尋找作品" : hasSearched ? pagination.totalWorks > 0 ? `找到 ${pagination.totalWorks.toLocaleString()} 篇作品` : "暫時沒有可驗證的作品" : "開始探索"}</h2>{activeView === "search" && searchMode === "author" && <div className="mt-2 flex items-center gap-2 text-sm text-amber-700"><UserRound className="h-3.5 w-3.5" /> 搜尋作者：{activeQuery || keyword}</div>}{activeView === "search" && hasSearched && pagination.totalWorks > 0 && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[color:var(--atlas-muted)]"><span>已載入第 {pagination.loadedThroughPage} / {pagination.totalPages} 頁</span><span>顯示 {displayedResults.length} / {results.length} 筆</span>{hideBookmarkedResults && <span className="text-[color:var(--atlas-indigo)]">藏書閣隱藏：{hiddenBookmarkedResultCount} 篇</span>}{excludedKeywords.length > 0 && <span className="text-[color:var(--atlas-danger)]">避雷中：{excludedKeywords.length} 詞</span>}{completedElapsedMs !== null && <span className="text-[color:var(--atlas-success)]">{(completedElapsedMs / 1000).toFixed(1)} 秒完成</span>}</div>}</div><div className="flex flex-wrap items-center gap-2"><div className="text-xs text-[color:var(--atlas-muted)]">{activeView === "bookmarks" ? desktopRuntime ? "只保留在這台裝置" : "保留在這個瀏覽器" : `${selectedPlatforms.length} 個來源已啟用`}</div>{activeView === "search" && hasSearched && filteredResultCount > 0 && <Button type="button" variant="outline" aria-label="顯示已避雷作品" aria-pressed={showFilteredResults} onClick={() => setShowFilteredResults((current) => { const next = !current; if (!next) setRevealedFilteredUrls(new Set()); return next; })} className={`h-9 rounded-full border px-3 text-xs font-semibold ${showFilteredResults ? "border-[color:var(--atlas-amber)] bg-[color:var(--atlas-amber-soft)] text-[color:var(--atlas-amber)]" : "border-[color:var(--atlas-danger-line)] bg-white text-[color:var(--atlas-danger)] hover:bg-[color:var(--atlas-danger-soft)]"}`}>{showFilteredResults ? <EyeOff className="mr-1.5 h-3.5 w-3.5" /> : <Eye className="mr-1.5 h-3.5 w-3.5" />}{showFilteredResults ? "隱藏已避雷作品" : "顯示已避雷作品"}<span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-current px-1.5 py-0.5 text-[10px] font-bold text-white">{filteredResultCount}</span></Button>}</div></section>

        {activeView === "search" && hasSearched && platformStatuses.length > 0 && (
          <section aria-label="平台連線狀態" className="atlas-panel relative mt-5 overflow-hidden p-4 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-[#111826]/10 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="atlas-mono text-[9px] font-medium uppercase tracking-[0.18em] text-[#2d70d6]">SOURCE HEALTH / LIVE ROUTES</div><div className="mt-1 text-sm font-bold">{isSearchPending ? `${sourceProgress.total} 個來源中，${sourceProgress.responded} 已回應、${sourceProgress.pending} 查詢中、${sourceProgress.blocked} 受阻` : "每一個來源都是獨立路徑"}</div></div>
              <div className="flex items-center gap-3"><span className="atlas-mono text-[9px] font-medium tracking-[0.1em] text-[#6e7480]">點選來源查看結果；受阻來源可單獨重試</span><Button type="button" variant="ghost" size="sm" aria-pressed={!activePlatformFilter} onClick={() => setActivePlatformFilter(null)} className={`h-7 rounded-none border px-2 font-mono text-[9px] font-bold uppercase tracking-[0.1em] ${activePlatformFilter ? "border-[#111826]/15 bg-white/60 text-[#66757d] hover:border-[#2d70d6] hover:bg-[#e6efff]" : "border-[#2d70d6] bg-[#e6efff] text-[#2d70d6]"}`}>ALL / 全部</Button></div>
            </div>
            <div className="grid gap-2 lg:grid-cols-5 lg:gap-0">
              {platformStatuses.map((status) => {
                const isSuccess = status.status === "success";
                const isCooldown = status.status === "cooldown";
                const isBlocked = status.status === "blocked";
                const currentQuery = activeQuery || keyword;
                const officialSearch = status.platformId === "ao3"
                  ? {
                      href: `https://archiveofourown.org/works/search?commit=Search&work_search%5Bquery%5D=${encodeURIComponent(currentQuery)}`,
                      label: "前往 AO3 搜尋本詞",
                    }
                  : status.platformId === "penana"
                    ? {
                        href: `https://www.penana.com/search?t=story&search=${encodeURIComponent(currentQuery)}`,
                        label: "在 Penana 官網搜尋",
                      }
                    : null;
                const tone = isSuccess
                  ? "border-[#9bded1] bg-[#e9f8f4] text-[#176d61]"
                  : isCooldown
                    ? "border-[#efd59a] bg-[#fff7df] text-[#8d6b20]"
                    : isBlocked || status.status === "error"
                      ? "border-[#efb4c4] bg-[#fff0f4] text-[#9b4358]"
                      : "border-[#d5d8da] bg-[#f5f6f4] text-[#65737a]";
                const stateLabel = isSuccess ? "已連線" : isCooldown ? "冷卻限制中" : isBlocked ? status.platformId === "ao3" ? "AO3 需要安全驗證" : "需要安全驗證" : status.status === "error" ? "連線逾時" : status.warning === "本次搜尋未啟用此來源。" ? "未啟用" : "無公開結果";
                const isActiveFilter = activePlatformFilter === status.platformId;
                const isRetryingThisPlatform = isSearchPending && retryingPlatformId === status.platformId;
                return (
                  <div
                    key={status.platformId}
                    role="button"
                    tabIndex={0}
                    aria-label={`篩選 ${status.label} 平台結果`}
                    aria-pressed={isActiveFilter}
                    aria-busy={isRetryingThisPlatform}
                    onClick={() => togglePlatformQuickFilter(status.platformId as PlatformId)}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); togglePlatformQuickFilter(status.platformId as PlatformId); } }}
                    className={`atlas-status-node min-w-0 cursor-pointer border p-3 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d70d6] ${tone} ${isActiveFilter ? "z-10 border-2 border-[#2d70d6] shadow-[4px_4px_0_#2d70d6]" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="atlas-mono text-[10px] font-medium uppercase tracking-[0.12em]">{status.label}</div>
                        <div className="mt-1 font-mono text-[9px] font-bold tracking-[0.08em]">{stateLabel}{isSuccess ? ` · ${status.itemCount} 筆` : ""}{isActiveFilter ? " · FILTER ACTIVE" : ""}</div>
                      </div>
                      {isPlatformRetryable(status) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isSearchPending && !isRetryingThisPlatform}
                          aria-label={`重試 ${status.label}`}
                          onClick={(event) => retrySinglePlatform(event, status.platformId as PlatformId)}
                          className="h-7 shrink-0 rounded-none border border-current px-2 font-mono text-[9px] font-bold uppercase tracking-[0.08em] hover:bg-white/70"
                        >
                          <RotateCw className={`mr-1 h-3 w-3 ${isRetryingThisPlatform ? "animate-spin" : ""}`} />{isRetryingThisPlatform ? "重試中" : "重試"}
                        </Button>
                      )}
                    </div>
                    {isBlocked && officialSearch && currentQuery && (
                      <div className="mt-2">
                        <a
                          href={officialSearch.href}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={officialSearch.label}
                          onClick={(event) => {
                            event.stopPropagation();
                            void openExternalUrl(
                              event,
                              officialSearch.href,
                              status.platformId === "ao3"
                                ? "已開啟官方 AO3 搜尋；若完成官方驗證，請回到此處按「重試 AO3」。"
                                : undefined,
                            );
                          }}
                          className="inline-flex items-center gap-1 border border-current px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] hover:bg-white/70"
                        >
                          {officialSearch.label} <ArrowUpRight className="h-3 w-3" />
                        </a>
                        {status.platformId === "ao3" && <p className="mt-1.5 text-[10px] leading-4 opacity-80">請在官方頁依其流程完成安全驗證後，回來按「重試 AO3」。本應用程式僅提供官方搜尋與單一來源重試，不會使用背景 Webview、讀取或保存驗證 Cookie。</p>}
                      </div>
                    )}
                    <div className="mt-2 truncate atlas-mono text-[9px] opacity-70" title={status.translatedQuery}>QUERY / {status.translatedQuery}</div>
                    {status.warning && <div className="mt-1 line-clamp-2 font-mono text-[8px] leading-4 opacity-75" title={status.warning}>{status.warning}</div>}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8">
          {activeView === "bookmarks" ? (
            <BookshelfView
              bookmarks={bookmarks}
              onEdit={(bookmark) => { setBookmarkTarget(bookmark.result); setBookmarkDialogOpen(true); }}
              onRemove={removeBookmark}
              onImport={importBookmarks}
              onBatchRemove={batchRemoveBookmarks}
              onBatchUpdate={batchUpdateBookmarks}
              onProgressChange={updateBookmarkProgress}
              onExportAll={exportAllPersonalData}
              onImportAll={importAllPersonalData}
              desktopVersion={desktopRuntime ? desktopVersion : undefined}
              updateCheckPending={updateCheckPending}
              onCheckForUpdates={desktopRuntime ? () => void checkForAppUpdate("manual") : undefined}
            />
          ) : <>
          {!hasSearched && !searchMutation.isPending && <div className="atlas-panel p-8 sm:p-10"><div className="max-w-2xl"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]"><Sparkles className="h-5 w-5" /></div><h3 className="text-2xl font-extrabold">從一組關鍵字開始</h3><p className="mt-3 text-sm leading-7 text-[color:var(--atlas-muted)]">輸入角色、配對或作品名，從公開來源找到作品，並把想留下的故事收進你的書架。</p></div></div>}
          {hasSearched && results.length === 0 && !searchMutation.isPending && (
            <div className="relative overflow-hidden border border-dashed border-[#10151b]/25 bg-white/45 px-6 py-16 text-center">
              <div className="absolute right-0 top-0 h-16 w-16 border-b border-l border-[#e27d9d]/20" />
              <div className="mx-auto max-w-md">
                <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#eff8f6] text-[#197b75]">
                  <Search className="h-6 w-6" />
                </div>
                <div className="text-sm font-semibold text-[color:var(--atlas-success)]">暫時沒有可驗證的公開作品</div>
                <h3 className="mt-4 text-xl font-black tracking-tight">此查詢暫無可驗證的公開作品。</h3>
                <p className="mt-4 text-sm leading-relaxed text-[#66757d]">
                  可嘗試改用作品名、角色全名或不同 CP 別名。各來源的成功、無結果與可重試狀態會顯示在上方。
                </p>
                {platformStatuses.some(isPlatformRetryable) && <p className="mt-3 font-mono text-[10px] font-bold tracking-[0.08em] text-[#8b3e59]">受阻來源可由上方狀態卡單獨重試。</p>}
                <Button 
                  type="button"
                  variant="outline" 
                  onClick={() => setHasSearched(false)}
                  className="mt-8 h-10 border-[#10151b]/10 font-mono text-[10px] font-bold uppercase tracking-widest"
                >
                  NEW SEARCH
                </Button>
              </div>
            </div>
          )}
          {searchMutation.isPending && !isRetryingSinglePlatform && <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map((item) => <div key={item} className="h-64 animate-pulse border border-[#10151b]/10 bg-white/55" />)}</div>}
          {(!searchMutation.isPending || isRetryingSinglePlatform) && results.length > 0 && displayedResults.length === 0 && <div className="border border-dashed border-[#10151b]/25 bg-white/45 px-6 py-12 text-center"><div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#e27d9d]">NO FILTER MATCH</div><p className="mt-3 text-sm text-[#66757d]">目前沒有作品符合這組前端篩選條件；可調整分級、字數、完結狀態或排序方式。</p></div>}
          {(!searchMutation.isPending || isRetryingSinglePlatform) && results.length > 0 && (
            <div className="space-y-6">
              {searchWarning && (
                <div className="border border-[#e27d9d]/40 bg-[#fff5f7] p-4 font-mono text-xs text-[#8b3e59]">
                  <span className="font-semibold">提示：</span> {searchWarning}
                </div>
              )}
              <div className="flex flex-col gap-3 border-b border-[color:var(--atlas-line)] pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="reader-segmented flex w-fit items-center gap-1 p-1" role="group" aria-label="搜尋結果檢視模式">
                  <Button type="button" variant="ghost" aria-pressed={resultViewMode === "cards"} onClick={() => setResultViewMode("cards")} className={`h-8 rounded-lg px-3 text-xs font-semibold ${resultViewMode === "cards" ? "bg-white text-[color:var(--atlas-indigo)] shadow-sm" : "text-[color:var(--atlas-muted)]"}`}><LayoutGrid className="mr-1.5 h-3.5 w-3.5" />卡片模式</Button>
                  <Button type="button" variant="ghost" aria-pressed={resultViewMode === "list"} onClick={() => setResultViewMode("list")} className={`h-8 rounded-lg px-3 text-xs font-semibold ${resultViewMode === "list" ? "bg-white text-[color:var(--atlas-indigo)] shadow-sm" : "text-[color:var(--atlas-muted)]"}`}><List className="mr-1.5 h-3.5 w-3.5" />條列模式</Button>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[color:var(--atlas-muted)]">每頁顯示
                  <select value={resultsPerPage} onChange={(event) => setResultsPerPage(Number(event.target.value))} className="h-8 rounded-lg border border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)] px-2 text-xs font-semibold text-[color:var(--atlas-ink)] outline-none focus:border-[color:var(--atlas-indigo)]">
                    {RESULT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size} 篇</option>)}
                  </select>
                </label>
              </div>
              <div id="search-results" className={resultViewMode === "cards" ? "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3" : "space-y-3"}>
                {visibleResults.map((result, index) => {
                  const meta = platformMeta(result.platform);
                  const allTags = (result.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean);
                  const allRelationshipTags = result.relationships?.length ? result.relationships : allTags.filter((tag) => tag.includes("/") || tag.includes(" & "));
                  const allCharacterTags = result.characters || [];
                  const highlightedTags = new Set([...allRelationshipTags, ...allCharacterTags]);
                  const allCategoryTags = allTags.filter((tag) => !highlightedTags.has(tag));
                  const tagsExpanded = expandedTagUrls.has(result.url);
                  const relationshipTags = tagsExpanded ? allRelationshipTags : allRelationshipTags.slice(0, 2);
                  const characterTags = tagsExpanded ? allCharacterTags : allCharacterTags.slice(0, 1);
                  const tags = tagsExpanded ? allCategoryTags : allCategoryTags.slice(0, 2);
                  const hiddenTagCount = Math.max(0, allRelationshipTags.length - relationshipTags.length) + Math.max(0, allCharacterTags.length - characterTags.length) + Math.max(0, allCategoryTags.length - tags.length);
                  const bookmark = bookmarks.find((item) => item.url === result.url);
                  const isRestricted = isRestrictedResult(result);
                  const blacklistMatches = blacklistGroups.filter((group) => group.enabled).map((group) => ({ group, keywords: group.keywords.filter((item) => [result.title, result.summary, result.tags, ...(result.characters || []), ...(result.relationships || [])].join(" ").toLocaleLowerCase().includes(item.toLocaleLowerCase())) })).filter((item) => item.keywords.length > 0);
                  const isMaskedByBlacklist = showFilteredResults && blacklistMatches.length > 0 && !revealedFilteredUrls.has(result.url);
                  return (
                    <Card key={`${result.url}-${index}`} className={`reader-story-card group relative ${resultViewMode === "list" ? "overflow-hidden" : ""} ${isRestricted ? "border-[#efb4c4]" : ""}`}>
                      <CardContent className={`p-0 transition-[filter,opacity] duration-200 ${isMaskedByBlacklist ? "pointer-events-none select-none blur-[5px] opacity-45" : ""}`}>
                        {resultViewMode === "cards" && result.coverUrl && <BlueprintCover src={result.coverUrl} title={result.title} />}
                        <div className={`flex items-center justify-between border-b border-[#111826]/10 ${resultViewMode === "list" ? "px-4 py-2.5" : "px-5 py-3"}`}>
                          <div className="flex items-center gap-2">
                            <Badge className={`rounded-full border-0 px-2.5 py-1 text-xs font-medium ${platformToneClass(meta.tone)} `}>
                              {meta.label}
                            </Badge>
                            {isRestricted && <Badge className="rounded-full border-0 bg-[color:var(--atlas-danger-soft)] px-2.5 py-1 text-xs font-semibold text-[color:var(--atlas-danger)]">18+ / R18</Badge>}
                            {result.source && (
                              <span className="font-mono text-[9px] uppercase tracking-wider text-[#75838b]">
                                [{result.source}]
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2"><button type="button" onClick={() => bookmark ? removeBookmark(result.url) : (setBookmarkTarget(result), setBookmarkDialogOpen(true))} aria-label={bookmark ? `取消收藏 ${result.title}` : `收藏 ${result.title}`} className={`inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition-colors ${bookmark ? "bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]" : "bg-[color:var(--atlas-elevated)] text-[color:var(--atlas-muted)] hover:text-[color:var(--atlas-indigo)]"}`}>{bookmark ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}{bookmark ? "已收藏" : "收藏"}</button><span className="text-xs text-[color:var(--atlas-muted)]">{formatDate(result.scraped_at)}</span></div>
                        </div>
                        <div className={resultViewMode === "list" ? "grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)_auto] md:items-center" : "p-5 sm:p-6"}>
                          <div className={resultViewMode === "list" ? "min-w-0" : ""}>
                          <div className={resultViewMode === "list" ? "flex items-start justify-between gap-3" : "mb-4 flex items-start justify-between gap-4"}>
                            <h3 className={`line-clamp-2 font-black leading-tight tracking-[-0.045em] ${resultViewMode === "list" ? "text-base" : "text-xl"}`}>{result.title || "UNTITLED WORK"}</h3>
                            <ArrowUpRight className="mt-1 h-5 w-5 shrink-0 text-[#9ca8ad] transition-colors group-hover:text-[#2d70d6]" />
                          </div>
                          {isNavigableAuthor(result.author) ? <button type="button" onClick={() => navigateToAuthor(result.author)} className="group/author inline-flex items-center gap-1.5 text-sm font-medium text-[color:var(--atlas-muted)] transition-colors hover:text-[color:var(--atlas-indigo)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-indigo)]" aria-label={`搜尋作者 ${result.author}`}><UserRound className="h-3.5 w-3.5" /><span className="border-b border-transparent group-hover/author:border-current">{result.author}</span></button> : <div className="text-sm font-medium text-[color:var(--atlas-muted)]">{result.author || "未知創作者"}</div>}
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[color:var(--atlas-muted)]"><span>{result.wordCount ? `${result.wordCount} 字` : "字數以原站為準"}</span>{result.isComplete !== null && result.isComplete !== undefined && <span className={result.isComplete ? "text-[color:var(--atlas-success)]" : "text-[color:var(--atlas-amber)]"}>{result.isComplete ? "已完結" : "連載中"}</span>}{typeof result.relevanceScore === "number" && <span>相關度 {result.relevanceScore}</span>}</div>
                          <div className={`${resultViewMode === "list" ? "mt-3" : "mt-6"} flex flex-wrap gap-1.5`} aria-label={`${result.title} 的標籤`}>
                            {relationshipTags.map((tag) => <span key={`relationship-${tag}`} className="border border-[#e8a7bf] bg-[#ffe8f0] px-2 py-1 font-mono text-[9px] font-semibold text-[#8b3e59]">♡ {tag}</span>)}
                            {characterTags.map((tag) => <span key={`character-${tag}`} className="border border-[#c9bcf2] bg-[#f0ecff] px-2 py-1 font-mono text-[9px] font-semibold text-[#5c4e87]">◇ {tag}</span>)}
                            {tags.map((tag) => <span key={`tag-${tag}`} className="border border-[#10151b]/10 bg-[#f3f6f5] px-2 py-1 font-mono text-[9px] font-semibold text-[#6a777e]">#{tag}</span>)}
                            {hiddenTagCount > 0 && <button type="button" onClick={() => setExpandedTagUrls((current) => { const next = new Set(current); next.add(result.url); return next; })} title="展開完整標籤" className="border border-dashed border-[#61707a]/45 bg-white px-2 py-1 font-mono text-[9px] font-bold text-[#56646d] hover:border-[#2d70d6] hover:text-[#2d70d6]">+{hiddenTagCount} 標籤</button>}
                            {tagsExpanded && hiddenTagCount === 0 && (allRelationshipTags.length + allCharacterTags.length + allCategoryTags.length) > 0 && <button type="button" onClick={() => setExpandedTagUrls((current) => { const next = new Set(current); next.delete(result.url); return next; })} className="border border-dashed border-[#61707a]/45 bg-white px-2 py-1 font-mono text-[9px] font-bold text-[#56646d] hover:border-[#2d70d6] hover:text-[#2d70d6]">收合標籤</button>}
                          </div>
                          {resultViewMode === "cards" && <RestrictedSummary summary={result.summary || "No summary available."} shouldBlur={isRestricted && contentSafetySettings.blurRestrictedSummaries} />}
                          </div>
                          <a href={result.url} target="_blank" rel="noreferrer" onClick={(event) => void openExternalUrl(event, result.url)} className={`${resultViewMode === "list" ? "md:justify-self-end" : "mt-6"} inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--atlas-indigo)] hover:text-[#4338ca]`}>
                            前往原始作品 <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </CardContent>
                      {isMaskedByBlacklist && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 border border-[#e27d9d] bg-[#fff7f9]/75 p-6 text-center backdrop-blur-sm"><div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-[#9b4358]">⚠️ 此作品命中避雷設定</div><div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[#8b3e59]">{blacklistMatches.map((item) => item.group.name).join(" · ")}</div><div className="flex flex-wrap justify-center gap-1.5">{blacklistMatches.flatMap((item) => item.keywords.map((keyword) => <span key={`${item.group.id}-${keyword}`} className="border border-[#e8a7bf] bg-[#fff0f4] px-2 py-1 font-mono text-[9px] font-bold text-[#8b3e59]">{keyword}</span>))}</div><Button type="button" onClick={() => setRevealedFilteredUrls((current) => { const next = new Set(current); next.add(result.url); return next; })} className="h-9 rounded-none bg-[#8b3e59] font-mono text-[9px] font-bold uppercase tracking-[0.12em]">⚠️ 暫時查看這一篇</Button><span className="font-mono text-[8px] font-medium tracking-[0.08em] text-[#75838b]">不會修改全局避雷設定</span></div>}
                    </Card>
                  );
                })}
              </div>
              {(localResultPageCount > 1 || pagination.totalPages > 1) && <div className="flex flex-col gap-3 border-t border-[color:var(--atlas-line)] pt-6 sm:flex-row sm:items-center sm:justify-between" aria-label="搜尋結果分頁"><div><div className="text-sm font-semibold text-[color:var(--atlas-ink)]">第 {unifiedCurrentPage} / {unifiedPageCount} 頁{usesSourcePagination && localResultPageCount > 1 ? <span className="ml-2 text-xs font-medium text-[color:var(--atlas-muted)]">· 本頁區段 {localResultPage} / {localResultPageCount}</span> : null}</div><div className="mt-1 text-xs text-[color:var(--atlas-muted)]">顯示 {Math.min((localResultPage - 1) * resultsPerPage + 1, displayedResults.length)}–{Math.min(localResultPage * resultsPerPage, displayedResults.length)} / {displayedResults.length} 筆{usesSourcePagination ? " · 切換來源頁時會優先使用本機快取" : ""}</div></div><div className="flex flex-wrap items-center gap-1"><Button type="button" variant="outline" size="icon" aria-label="上一頁" disabled={(localResultPage === 1 && (!usesSourcePagination || pagination.page === 1)) || isSearchPending} onClick={goToPreviousUnifiedPage} className="h-9 w-9 rounded-lg border-[color:var(--atlas-line)] bg-white/70"><ChevronLeft className="h-4 w-4" /></Button>{resultPageWindow(unifiedCurrentPage, unifiedPageCount).map((page, index, pages) => <React.Fragment key={page}>{index > 0 && page - pages[index - 1] > 1 && <span className="px-1 text-xs text-[color:var(--atlas-muted)]">…</span>}<Button type="button" variant={page === unifiedCurrentPage ? "default" : "outline"} size="icon" aria-current={page === unifiedCurrentPage ? "page" : undefined} disabled={isSearchPending} onClick={() => goToUnifiedPage(page)} className={`h-9 w-9 rounded-lg ${page === unifiedCurrentPage ? "bg-[color:var(--atlas-indigo)] text-white hover:bg-[#4338ca]" : "border-[color:var(--atlas-line)] bg-white/70"}`}>{page}</Button></React.Fragment>)}<Button type="button" variant="outline" size="icon" aria-label="下一頁" disabled={(localResultPage === localResultPageCount && (!usesSourcePagination || pagination.page === pagination.totalPages)) || isSearchPending} onClick={goToNextUnifiedPage} className="h-9 w-9 rounded-lg border-[color:var(--atlas-line)] bg-white/70"><ChevronRight className="h-4 w-4" /></Button></div></div>}
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
        <AgeConfirmationDialog open={contentSafetySettings.ageConfirmation === "unknown"} onConfirm={confirmAge} />
        <CpMappingManagerDialog open={cpManagerOpen} mappings={cpMappings} customMappings={customCpMappings} onOpenChange={setCpManagerOpen} onChange={updateCpMappings} />
        <Dialog open={updateDialogOpen} onOpenChange={(open) => { if (!updateInstallPending) setUpdateDialogOpen(open); }}>
          <DialogContent showCloseButton={!updateInstallPending} overlayClassName="bg-[color:var(--atlas-ink)]/32 backdrop-blur-md" className="max-w-lg rounded-3xl border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)] p-0 shadow-[0_28px_80px_rgba(34,31,57,0.26)]">
            <DialogHeader className="border-b border-[color:var(--atlas-line)] px-6 pb-5 pt-6 sm:px-8">
              <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--atlas-indigo-soft)] text-[color:var(--atlas-indigo)]"><RotateCw className={`h-5 w-5 ${updateInstallPending ? "animate-spin" : ""}`} /></div>
              <DialogTitle className="text-2xl font-extrabold tracking-[-0.035em]">發現新版本 v{availableUpdate?.version}</DialogTitle>
              <DialogDescription className="mt-2 text-sm leading-6 text-[color:var(--atlas-muted)]">目前使用 v{desktopVersion}。更新會在下載與驗證完成後自動重新啟動應用程式。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 px-6 py-5 sm:px-8">
              <div className="rounded-2xl bg-[color:var(--atlas-elevated)] p-4">
                <div className="text-sm font-semibold text-[color:var(--atlas-ink)]">這次更新內容</div>
                <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-[color:var(--atlas-muted)]">{availableUpdate?.body?.trim() || "本次版本包含穩定性修正與體驗改善。"}</p>
              </div>
              {updateInstallPending && <div aria-live="polite"><div className="mb-2 flex items-center justify-between text-xs font-semibold text-[color:var(--atlas-indigo)]"><span>{updateDownloadPercent >= 100 ? "正在安裝更新…" : "正在下載並驗證更新…"}</span><span>{updateDownloadPercent}%</span></div><Progress value={updateDownloadPercent} className="h-2 bg-[color:var(--atlas-indigo-soft)] [&>div]:bg-[color:var(--atlas-indigo)]" /></div>}
            </div>
            <DialogFooter className="border-t border-[color:var(--atlas-line)] px-6 py-5 sm:px-8">
              {!updateInstallPending && <Button type="button" variant="outline" onClick={() => setUpdateDialogOpen(false)} className="rounded-xl border-[color:var(--atlas-line)] bg-white/70">稍後再說</Button>}
              <Button type="button" onClick={() => void installAvailableUpdate()} disabled={updateInstallPending} className="min-w-40 rounded-xl bg-[color:var(--atlas-indigo)] text-white shadow-[0_10px_22px_rgba(79,70,229,0.24)] hover:bg-[#4338ca]">{updateInstallPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}{updateInstallPending ? "準備重新啟動" : "立即更新並重啟"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>

      {showScrollToTop && <Button type="button" onClick={scrollToTop} aria-label="回到頂部搜尋列" className="fixed bottom-6 right-5 z-40 h-12 rounded-full bg-[color:var(--atlas-indigo)] px-4 text-sm font-semibold text-white shadow-[0_14px_34px_rgba(79,70,229,0.28)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:bg-[#4338ca] focus-visible:ring-2 focus-visible:ring-[color:var(--atlas-indigo)] focus-visible:ring-offset-2 sm:bottom-8 sm:right-8"><ArrowUp className="mr-1.5 h-4 w-4" />回頂部</Button>}
      <footer className="relative z-10 border-t border-[color:var(--atlas-line)] bg-[color:var(--atlas-surface)]"><div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 text-xs text-[color:var(--atlas-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><span>Fanfic Atlas · 為你的閱讀清單留一個安靜的位置</span><span>{PLATFORMS.length} 個公開來源 · 本機保存個人資料</span></div></footer>
    </div>
  );
}
