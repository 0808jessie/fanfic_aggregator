// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { clearSearchRequestCache } from "@/lib/searchRequestCache";

const mockState = vi.hoisted(() => ({
  nextHookId: 0,
  lastVariables: null as unknown,
  responseWarning: null as string | null,
  responsePlatformStatuses: [] as unknown[],
  retryPayload: null as Record<string, unknown> | null,
  primaryPayload: null as Record<string, unknown> | null,
  mutationCalls: 0,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown, variables?: unknown) => void; onError?: (error: Error, variables?: unknown) => void }) => {
            const [hookId] = React.useState(() => mockState.nextHookId++);
            const [isPending, setIsPending] = React.useState(false);
            const mutate = (variables?: unknown) => {
              mockState.mutationCalls += 1;
              mockState.lastVariables = variables;
              setIsPending(true);
              window.setTimeout(() => {
                const retryingWaterwriter = hookId === 0
                  && Array.isArray((variables as { data?: { platforms?: unknown } } | undefined)?.data?.platforms)
                  && (variables as { data?: { platforms?: string[] } }).data?.platforms?.length === 1
                  && (variables as { data?: { platforms?: string[] } }).data?.platforms?.[0] === "waterwriter";
                const payload = retryingWaterwriter && mockState.retryPayload
                  ? mockState.retryPayload
                  : hookId === 0
                  ? mockState.primaryPayload ?? {
                      items: [{ title: "PAGE ONE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9001", tags: "富岡義勇/胡蝶忍, Post-Canon", relationships: ["富岡義勇/胡蝶忍"], characters: ["富岡義勇", "胡蝶忍"], summary: "", scraped_at: "2026-01-01T00:00:00Z" }],
                      totalWorks: 60,
                      totalPages: 3,
                      page: 1,
                      loadedThroughPage: 2,
                      nextPage: 3,
                      hasMore: true,
                      warning: mockState.responseWarning,
                      platformStatuses: mockState.responsePlatformStatuses,
                    }
                  : {
                      items: [
                        { title: "PAGE ONE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9001", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
                        { title: "PAGE THREE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9003", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
                      ],
                      totalWorks: 60,
                      totalPages: 3,
                      page: 3,
                      loadedThroughPage: 3,
                      nextPage: null,
                      hasMore: false,
                    };
                options.onSuccess?.(payload, variables);
                setIsPending(false);
              }, 20);
            };
            return { mutate, isPending };
          },
        },
      },
    },
  };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  window.localStorage.setItem("sui-read-content-safety-settings", JSON.stringify({ ageConfirmation: "adult", blurRestrictedSummaries: true }));
  clearSearchRequestCache();
  mockState.nextHookId = 0;
  mockState.lastVariables = null;
  mockState.responseWarning = null;
  mockState.responsePlatformStatuses = [];
  mockState.retryPayload = null;
  mockState.primaryPayload = null;
  mockState.mutationCalls = 0;
});

describe("Home pagination interactions", () => {
  it("asks for age confirmation on first launch and forces the safe rating mode for minors", async () => {
    window.localStorage.clear();
    mockState.primaryPayload = {
      items: [{ title: "限制級測試作品", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/801", tags: "R-18", rating: "Explicit", summary: "測試摘要", scraped_at: "2026-01-01T00:00:00Z" }],
      totalWorks: 1, totalPages: 1, page: 1, loadedThroughPage: 1, nextPage: null, hasMore: false,
    };
    render(<Home />);

    expect(screen.getByText("年齡確認")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /未滿 18 歲/ }));
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "測試" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.queryByText("限制級測試作品")).toBeNull());

    expect(screen.getByText("全年齡保護已啟用")).toBeTruthy();
    expect(screen.getByRole("button", { name: "R18" }).getAttribute("disabled")).not.toBeNull();
  });

  it("lets an adult select R18 locally and marks restricted cards", async () => {
    mockState.primaryPayload = {
      items: [
        { title: "全年齡作品", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/811", tags: "General", rating: "General Audiences", summary: "安全摘要", scraped_at: "2026-01-01T00:00:00Z" },
        { title: "限制級作品", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/812", tags: "Explicit", rating: "Explicit", summary: "敏感摘要", scraped_at: "2026-01-01T00:00:00Z" },
      ], totalWorks: 2, totalPages: 1, page: 1, loadedThroughPage: 1, nextPage: null, hasMore: false,
    };
    render(<Home />);
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "作品" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("限制級作品")).toBeTruthy());
    expect(screen.getByText("18+ / R18")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "R18" }));
    expect(screen.getByText("限制級作品")).toBeTruthy();
    expect(screen.queryByText("全年齡作品")).toBeNull();
  });

  it("switches language and rating only against the loaded result array without another crawler request", async () => {
    mockState.primaryPayload = {
      items: [
        { title: "這是繁體作品", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/813", tags: "General", summary: "繁體摘要", scraped_at: "2026-01-01T00:00:00Z" },
        { title: "これはR18作品", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/814", tags: "NSFW", summary: "成人向摘要", scraped_at: "2026-01-01T00:00:00Z" },
      ], totalWorks: 2, totalPages: 1, page: 1, loadedThroughPage: 1, nextPage: null, hasMore: false,
    };
    render(<Home />);
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "作品" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("這是繁體作品")).toBeTruthy());
    const callsAfterSearch = mockState.mutationCalls;

    fireEvent.click(screen.getByRole("button", { name: "繁體" }));
    expect(screen.getByText("這是繁體作品")).toBeTruthy();
    expect(screen.queryByText("これはR18作品")).toBeNull();
    expect(mockState.mutationCalls).toBe(callsAfterSearch);

    fireEvent.click(within(screen.getByLabelText("語言快速篩選")).getByRole("button", { name: "全部" }));
    fireEvent.click(screen.getByRole("button", { name: "R18" }));
    expect(screen.getByText("これはR18作品")).toBeTruthy();
    expect(screen.queryByText("這是繁體作品")).toBeNull();
    expect(mockState.mutationCalls).toBe(callsAfterSearch);
  });

  it("reuses an identical successful search from the fifteen-minute browser cache without another mutation", async () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "快取測試" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("PAGE ONE")).toBeTruthy());
    const callsAfterFirstSearch = mockState.mutationCalls;

    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    expect(screen.getByText("PAGE ONE")).toBeTruthy();
    expect(mockState.mutationCalls).toBe(callsAfterFirstSearch);
  });

  it("renders the crafted reading workspace before a query", () => {
    render(<Home />);

    expect(screen.getByText("你的私人閱讀空間")).toBeTruthy();
    expect(screen.getByText("準備好開始搜尋")).toBeTruthy();
    expect(screen.getByText("把想讀的故事")).toBeTruthy();
    expect(screen.getByText("跨平台同人閱讀")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RUN SEARCH" })).toBeTruthy();
  });

  it("shows totalWorks and appends a page while displaying the loading label", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("找到 60 篇作品")).toBeTruthy());
    expect(screen.getByText("PAGE ONE")).toBeTruthy();
    const relationshipTag = screen.getByText("♡ 富岡義勇/胡蝶忍");
    expect(relationshipTag.className).toContain("bg-[#ffe8f0]");
    expect(screen.getByText("◇ 富岡義勇")).toBeTruthy();
    expect(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" }));
    expect((screen.getByRole("button", { name: "正在翻頁載入中..." }) as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(screen.getByText("PAGE THREE")).toBeTruthy());
    expect(screen.getAllByText("PAGE ONE", { exact: true })).toHaveLength(1);
    expect(screen.getByText("已載入第 3 / 3 頁")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "LOAD MORE / PAGE 3" })).toBeNull();
  });

  it("keeps verified results clear of a single platform diagnostic", async () => {
    mockState.responseWarning = "[水裡寫字] Triggered Challenge, skipping cleanly";
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "花" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("PAGE ONE")).toBeTruthy());
    expect(screen.queryByText("[NOTICE]")).toBeNull();
    expect(screen.queryByText(/Triggered Challenge/)).toBeNull();
  });

  it("keeps a CP alias intact for the backend and retries only a failed source", async () => {
    mockState.responsePlatformStatuses = [
      { platformId: "ao3", label: "AO3", status: "success", itemCount: 40, translatedQuery: '"Tomioka Giyuu/Kochou Shinobu" OR "義忍"' },
      { platformId: "waterwriter", label: "在水裡寫字", status: "cooldown", itemCount: 0, warning: "20 秒冷卻", translatedQuery: "義忍 富岡義勇 胡蝶忍" },
    ];
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
    await waitFor(() => expect(screen.getByLabelText("平台連線狀態")).toBeTruthy());
    expect(screen.getByText("冷卻限制中")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重試 在水裡寫字" }));
    expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["waterwriter"], page: 1, forceRefresh: true, customCpMappings: [] },
    });
  });

  it("retries AO3 and Penana as independent force-refresh requests", async () => {
    mockState.responsePlatformStatuses = [
      { platformId: "ao3", label: "AO3", status: "blocked", itemCount: 0, warning: "HTTP 525", translatedQuery: "義忍" },
      { platformId: "penana", label: "Penana", status: "blocked", itemCount: 0, warning: "觸發人機保護", translatedQuery: "義忍" },
    ];
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重試 AO3" })).toBeTruthy());
    expect(screen.getByRole("link", { name: "前往 AO3 搜尋本詞" }).getAttribute("href")).toBe(
      "https://archiveofourown.org/works/search?commit=Search&work_search%5Bquery%5D=%E7%BE%A9%E5%BF%8D",
    );
    expect(screen.getByRole("link", { name: "在 Penana 官網搜尋" }).getAttribute("href")).toBe(
      "https://www.penana.com/search?t=story&search=%E7%BE%A9%E5%BF%8D",
    );

    fireEvent.click(screen.getByRole("button", { name: "重試 AO3" }));
    expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["ao3"], page: 1, forceRefresh: true, customCpMappings: [] },
    });

    await waitFor(() => expect((screen.getByRole("button", { name: "重試 Penana" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "重試 Penana" }));
    expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["penana"], page: 1, forceRefresh: true, customCpMappings: [] },
    });
  });

  it("keeps the CxC card visible and retryable when the API omits its status", async () => {
    mockState.responsePlatformStatuses = [
      { platformId: "ao3", label: "AO3", status: "success", itemCount: 60, translatedQuery: "義忍" },
    ];
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByLabelText("平台連線狀態")).toBeTruthy());
    expect(screen.getByText("CxC 創利市集")).toBeTruthy();
    expect(screen.getAllByText("連線逾時").length).toBeGreaterThan(0);
    expect(screen.getAllByText("本次未收到來源回應，請單獨重試。").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "重試 CxC 創利市集" })).toBeTruthy();
  });

  it("switches to author mode and sends the author search contract", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: "作者" }));
    expect(screen.getByLabelText("搜尋同人作品").getAttribute("placeholder")).toBe("輸入作者暱稱、繪師或社團名...");

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "Mizuki Studio" } });
    expect(screen.getByText("正在搜尋作者：Mizuki Studio")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "Mizuki Studio", mode: "author", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
  });

  it("renders a completed CxC zero-result search as source-specific empty state, not a global failure", async () => {
    mockState.primaryPayload = {
      items: [],
      totalWorks: 0,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
      warning: null,
      platformStatuses: [{ platformId: "cxc", label: "CxC 創利市集", status: "empty", itemCount: 0, translatedQuery: "佐櫻不存在測試CP" }],
    };
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "佐櫻不存在測試CP" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("暫時沒有可驗證的公開作品")).toBeTruthy());
    expect(screen.getByText("CxC 創利市集")).toBeTruthy();
    expect(screen.getByText("無公開結果")).toBeTruthy();
    expect(screen.queryByText("DISCOVERY HALTED")).toBeNull();
    expect(screen.queryByText("目前無法取得外部作品索引。")).toBeNull();
  });

  it("merges a successfully retried platform without discarding other platform results", async () => {
    mockState.responsePlatformStatuses = [
      { platformId: "ao3", label: "AO3", status: "success", itemCount: 60, translatedQuery: "義忍" },
      { platformId: "waterwriter", label: "在水裡寫字", status: "blocked", itemCount: 0, warning: "HTTP 525", translatedQuery: "義忍 富岡義勇 胡蝶忍" },
    ];
    mockState.retryPayload = {
      items: [{ title: "WATERWRITER UPDATE", author: "Author", platform: "在水裡寫字", url: "https://slashtw.space/forum.php?mod=viewthread&tid=9001", tags: "義忍", summary: "Verified result", scraped_at: "2026-01-02T00:00:00Z" }],
      totalWorks: 25,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
      platformStatuses: [{ platformId: "waterwriter", label: "在水裡寫字", status: "success", itemCount: 25, translatedQuery: "義忍 富岡義勇 胡蝶忍" }],
    };
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "重試 在水裡寫字" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "重試 在水裡寫字" }));
    await waitFor(() => expect(screen.getByText("WATERWRITER UPDATE")).toBeTruthy());
    expect(screen.getByText("PAGE ONE")).toBeTruthy();
    expect(screen.getByText("已連線 · 25 筆")).toBeTruthy();
  });
});

  it("renders platform checkboxes and sends the selected platform list", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /進階篩選/ }));
    const doujinCheckbox = screen.getByRole("checkbox", { name: "搜尋 同人誌中心" });
    const waterwriterCheckbox = screen.getByRole("checkbox", { name: "搜尋 在水裡寫字" });
    const penanaCheckbox = screen.getByRole("checkbox", { name: "搜尋 PENANA" });
    const cxcCheckbox = screen.getByRole("checkbox", { name: "搜尋 CxC 創利市集" });
    expect(screen.queryByRole("checkbox", { name: "搜尋 LOFTER" })).toBeNull();
    expect(doujinCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(waterwriterCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(penanaCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(cxcCheckbox.getAttribute("aria-checked")).toBe("true");
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "花" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "花", mode: "keyword", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
  });

  it("filters by an adapter card, shows active state, and restores all results on a second click", async () => {
    mockState.primaryPayload = {
      items: [
        { title: "AO3 ONLY", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/8123", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
        { title: "WATER ONLY", author: "Author", platform: "在水裡寫字", url: "https://slashtw.space/forum.php?mod=viewthread&tid=8123", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
      ],
      totalWorks: 2,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
      platformStatuses: [
        { platformId: "ao3", label: "AO3", status: "success", itemCount: 1, translatedQuery: "花" },
        { platformId: "waterwriter", label: "在水裡寫字", status: "success", itemCount: 1, translatedQuery: "花" },
      ],
    };
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "花" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("WATER ONLY")).toBeTruthy());

    const ao3Card = screen.getByRole("button", { name: "篩選 AO3 平台結果" });
    fireEvent.click(ao3Card);
    expect(ao3Card.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("AO3 ONLY")).toBeTruthy();
    expect(screen.queryByText("WATER ONLY")).toBeNull();

    fireEvent.click(ao3Card);
    expect(ao3Card.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByText("WATER ONLY")).toBeTruthy();
  });

  it("navigates from a verified author to an author-mode cross-platform search", async () => {
    mockState.primaryPayload = {
      items: [{ title: "AUTHOR ROUTE", author: "Atlas Creator", platform: "AO3", url: "https://archiveofourown.org/works/2026", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" }],
      totalWorks: 1,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
      platformStatuses: [],
    };
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "作品名" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "搜尋作者 Atlas Creator" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "搜尋作者 Atlas Creator" }));
    await waitFor(() => expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "Atlas Creator", mode: "author", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
    expect(screen.getByText(/正在搜尋作者：Atlas Creator/)).toBeTruthy();
  });
