// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const mockState = vi.hoisted(() => ({
  nextHookId: 0,
  lastVariables: null as unknown,
  responseWarning: null as string | null,
  responsePlatformStatuses: [] as unknown[],
  retryPayload: null as Record<string, unknown> | null,
  primaryPayload: null as Record<string, unknown> | null,
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
          useMutation: (options: { onSuccess?: (payload: unknown) => void; onError?: (error: Error) => void }) => {
            const [hookId] = React.useState(() => mockState.nextHookId++);
            const [isPending, setIsPending] = React.useState(false);
            const mutate = (variables?: unknown) => {
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
                options.onSuccess?.(payload);
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
  mockState.nextHookId = 0;
  mockState.lastVariables = null;
  mockState.responseWarning = null;
  mockState.responsePlatformStatuses = [];
  mockState.retryPayload = null;
  mockState.primaryPayload = null;
});

describe("Home pagination interactions", () => {
  it("renders the story cartography search workspace before a query", () => {
    render(<Home />);

    expect(screen.getByText("QUERY TRAJECTORY")).toBeTruthy();
    expect(screen.getByText("READY FOR A QUERY")).toBeTruthy();
    expect(screen.getByText("FIRST COORDINATE")).toBeTruthy();
    expect(screen.getByText("VERIFIED LINKS")).toBeTruthy();
    expect(screen.getByRole("button", { name: "RUN SEARCH" })).toBeTruthy();
  });

  it("shows totalWorks and appends a page while displaying the loading label", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("60 STORIES FOUND")).toBeTruthy());
    expect(screen.getByText("PAGE ONE")).toBeTruthy();
    const relationshipTag = screen.getByText("♡ 富岡義勇/胡蝶忍");
    expect(relationshipTag.className).toContain("bg-[#ffe8f0]");
    expect(screen.getByText("◇ 富岡義勇")).toBeTruthy();
    expect(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" }));
    expect((screen.getByRole("button", { name: "正在翻頁載入中..." }) as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(screen.getByText("PAGE THREE")).toBeTruthy());
    expect(screen.getAllByText("PAGE ONE", { exact: true })).toHaveLength(1);
    expect(screen.getByText("LOADED THROUGH PAGE 3 / 3")).toBeTruthy();
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

    await waitFor(() => expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
    await waitFor(() => expect(screen.getByLabelText("平台連線狀態")).toBeTruthy());
    expect(screen.getByText("冷卻限制中")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重試 在水裡寫字" }));
    expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["waterwriter"], page: 1, forceRefresh: true, customCpMappings: [] },
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
    expect(screen.getByRole("link", { name: "在 AO3 官網搜尋" }).getAttribute("href")).toBe(
      "https://archiveofourown.org/works/search?commit=Search&work_search%5Bquery%5D=%E7%BE%A9%E5%BF%8D",
    );
    expect(screen.getByRole("link", { name: "在 Penana 官網搜尋" }).getAttribute("href")).toBe(
      "https://www.penana.com/search?t=story&search=%E7%BE%A9%E5%BF%8D",
    );

    fireEvent.click(screen.getByRole("button", { name: "重試 AO3" }));
    expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["ao3"], page: 1, forceRefresh: true, customCpMappings: [] },
    });

    await waitFor(() => expect((screen.getByRole("button", { name: "重試 Penana" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "重試 Penana" }));
    expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["penana"], page: 1, forceRefresh: true, customCpMappings: [] },
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

    await waitFor(() => expect(screen.getByText("NO VERIFIED STORIES")).toBeTruthy());
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

    fireEvent.click(screen.getByRole("button", { name: /FILTERS/ }));
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

    await waitFor(() => expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "花", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc"], page: 1, forceRefresh: false, customCpMappings: [] },
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
    await waitFor(() => expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "Atlas Creator", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc"], page: 1, forceRefresh: false, customCpMappings: [] },
    }));
    expect(screen.getByText(/AUTHOR MODE \/ 搜尋作者：Atlas Creator/)).toBeTruthy();
  });
