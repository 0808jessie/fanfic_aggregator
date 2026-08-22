// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const mockState = vi.hoisted(() => ({ lastVariables: null as unknown }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown) => void }) => {
            const [isPending, setIsPending] = React.useState(false);
            const mutate = (variables?: unknown) => {
              mockState.lastVariables = variables;
              setIsPending(true);
              window.setTimeout(() => {
                const payload = {
                  items: [
                    {
                      title: "【義忍】無題",
                      author: "mitsuhane",
                      platform: "AO3",
                      url: "https://archiveofourown.org/works/27025444",
                      tags: "富岡義勇/胡蝶忍",
                      relationships: ["富岡義勇/胡蝶忍"],
                      characters: ["富岡義勇", "胡蝶忍"],
                      summary: "測試摘要",
                      wordCount: "4,200",
                      isComplete: true,
                      relevanceScore: 100,
                      scraped_at: "2026-01-01T00:00:00Z",
                    },
                  ],
                  totalWorks: 40,
                  totalPages: 2,
                  page: 1,
                  loadedThroughPage: 2,
                  nextPage: 2,
                  hasMore: true,
                };
                options.onSuccess?.(payload);
                setIsPending(false);
              }, 10);
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
  mockState.lastVariables = null;
});

describe("Home Page Traditional Chinese '義忍' Search", () => {
  it("successfully searches and renders results for traditional '義忍'", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    expect(screen.getByText(/正在查詢 8 個來源/)).toBeTruthy();

    await waitFor(() => expect(screen.getByText("找到 40 篇作品")).toBeTruthy());
    expect(screen.getByText("【義忍】無題")).toBeTruthy();
    expect(screen.getByText(/mitsuhane/i)).toBeTruthy();
    expect(screen.getByText("相關度 100")).toBeTruthy();
    expect(screen.getByText("已完結")).toBeTruthy();
    expect(screen.getByText(/.* 秒完成/)).toBeTruthy();
    expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv", "bahamut", "kadokado"], page: 1, forceRefresh: false, customCpMappings: [] },
    });

    fireEvent.click(screen.getByRole("button", { name: /進階篩選/ }));
    expect(screen.getByLabelText("字數區間")).toBeTruthy();
    expect(screen.getByLabelText("完結狀態")).toBeTruthy();
    expect(screen.getByLabelText("排序方式")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "強制重新抓取" }));
    await waitFor(() => expect(mockState.lastVariables).toMatchObject({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", mode: "keyword", platforms: ["ao3", "doujin", "waterwriter", "penana", "cxc", "pixiv", "bahamut", "kadokado"], page: 1, forceRefresh: true, customCpMappings: [] },
    }));
  });
});
