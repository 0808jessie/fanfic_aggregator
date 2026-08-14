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
                  ? {
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
});

describe("Home pagination interactions", () => {
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
      data: { keyword: "義忍", platforms: ["ao3", "lofter", "doujin", "waterwriter", "penana", "cxc"], page: 1, forceRefresh: false },
    }));
    await waitFor(() => expect(screen.getByLabelText("平台連線狀態")).toBeTruthy());
    expect(screen.getByText("冷卻限制中")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重試 在水裡寫字" }));
    expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["waterwriter"], page: 1, forceRefresh: true },
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
    const lofterCheckbox = screen.getByRole("checkbox", { name: "搜尋 LOFTER" });
    const doujinCheckbox = screen.getByRole("checkbox", { name: "搜尋 同人誌中心" });
    const waterwriterCheckbox = screen.getByRole("checkbox", { name: "搜尋 在水裡寫字" });
    const penanaCheckbox = screen.getByRole("checkbox", { name: "搜尋 PENANA" });
    const cxcCheckbox = screen.getByRole("checkbox", { name: "搜尋 CxC 創利市集" });
    expect(lofterCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(doujinCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(waterwriterCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(penanaCheckbox.getAttribute("aria-checked")).toBe("true");
    expect(cxcCheckbox.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(lofterCheckbox);
    expect(lofterCheckbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "花" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "花", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc"], page: 1, forceRefresh: false },
    }));
  });
