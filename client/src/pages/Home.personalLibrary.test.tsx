// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";
import { clearSearchRequestCache } from "@/lib/searchRequestCache";

const mockState = vi.hoisted(() => ({ mutationCalls: 0 }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown) => void }) => {
            const [isPending, setIsPending] = React.useState(false);
            return {
              isPending,
              mutate: () => {
                mockState.mutationCalls += 1;
                setIsPending(true);
                window.setTimeout(() => {
                  options.onSuccess?.({
                    items: [{
                      title: "義忍閱讀測試",
                      author: "測試作者",
                      platform: "AO3",
                      url: "https://archiveofourown.org/works/13579",
                      tags: "義忍",
                      summary: "這是可收藏的真實格式搜尋結果。",
                      scraped_at: "2026-08-01T00:00:00Z",
                    }],
                    totalWorks: 1,
                    totalPages: 1,
                    page: 1,
                    loadedThroughPage: 1,
                    nextPage: null,
                    hasMore: false,
                  });
                  setIsPending(false);
                }, 5);
              },
            };
          },
        },
      },
    },
  };
});

describe("Home personal reading tools", () => {
  beforeEach(() => {
    window.localStorage.clear();
    clearSearchRequestCache();
    mockState.mutationCalls = 0;
    window.localStorage.setItem("sui-read-content-safety-settings", JSON.stringify({ ageConfirmation: "adult", blurRestrictedSummaries: true }));
  });
  afterEach(() => cleanup());

  it("saves a reading card, shows it in the private shelf, and manages a CP mapping", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
    const searchInput = screen.getByLabelText("搜尋同人作品");
    fireEvent.blur(searchInput);
    fireEvent.focus(searchInput);
    await waitFor(() => expect(screen.getByText("最近搜尋")).toBeTruthy());
    fireEvent.change(searchInput, { target: { value: "新輸入的關鍵字" } });
    expect(screen.queryByText("最近搜尋")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /收藏 義忍閱讀測試/ }));
    fireEvent.click(screen.getByRole("button", { name: "5 星" }));
    fireEvent.change(screen.getByLabelText("個人筆記"), { target: { value: "想在夏天重讀。" } });
    fireEvent.change(screen.getByLabelText("自訂標籤"), { target: { value: "神作, 重讀" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存閱讀卡" }));

    fireEvent.click(screen.getByRole("button", { name: /藏書閣 \/ 收藏夾/ }));
    expect(await screen.findByText("想在夏天重讀。")).toBeTruthy();
    expect(screen.getAllByText("#神作").length).toBeGreaterThan(0);
    expect(screen.getAllByText("#重讀").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /CP 詞庫與世界觀/ }));
    expect(screen.getByRole("heading", { name: "CP 詞庫與世界觀" })).toBeTruthy();
    expect(document.querySelector("[data-slot='dialog-content']")).toBeNull();
    expect(screen.getByLabelText("搜尋 CP 詞庫")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "新增自訂 CP 對照" }));
    fireEvent.change(screen.getByLabelText("中文縮寫"), { target: { value: "黑邪" } });
    fireEvent.change(screen.getByLabelText("AO3 關係標籤"), { target: { value: "Heiyan/Wu Xie" } });
    fireEvent.change(screen.getByLabelText("繁中本地關鍵字"), { target: { value: "黑邪 吳邪" } });
    fireEvent.change(screen.getByLabelText("日文關係標籤"), { target: { value: "黒邪" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存" }));
    expect(screen.getByText("黑邪")).toBeTruthy();
    expect(screen.getByText("Heiyan/Wu Xie")).toBeTruthy();
    expect(screen.getByText("黑邪 吳邪")).toBeTruthy();
    expect(screen.getByText("黒邪")).toBeTruthy();
    expect(window.localStorage.getItem("sui-read-custom-cp-map")).toContain("黑邪");
    expect(screen.getByText("題材與世界觀詞庫")).toBeTruthy();
    expect(screen.getByText("ABO / 歐米茄")).toBeTruthy();
    expect(screen.getByText("Alpha/Beta/Omega Dynamics")).toBeTruthy();
    expect(screen.getAllByText("中文／通用").length).toBeGreaterThan(0);
    expect(screen.queryByText(/別名：/)).toBeNull();

    fireEvent.change(screen.getByLabelText("搜尋 CP 詞庫"), { target: { value: "黑邪" } });
    expect(screen.getByText("黑邪")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜尋 CP 詞庫"), { target: { value: "不存在" } });
    expect(screen.getByText("沒有符合的 CP 對照。")).toBeTruthy();
  });

  it("confirms whether to retain or clear reader cache before removing a saved work", async () => {
    render(<Home />);

    expect(screen.queryByRole("button", { name: "CP 詞庫" })).toBeNull();
    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /收藏 義忍閱讀測試/ }));
    fireEvent.click(screen.getByRole("button", { name: "儲存閱讀卡" }));
    fireEvent.click(screen.getByRole("button", { name: /藏書閣 \/ 收藏夾/ }));

    fireEvent.click(screen.getByRole("button", { name: /取消收藏 義忍閱讀測試/ }));
    expect(screen.getByRole("heading", { name: "移出藏書閣" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "僅移出書架" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "完整刪除（含快取）" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "僅移出書架" }));
    await waitFor(() => expect(screen.queryByText("義忍閱讀測試")).toBeNull());
  });

  it("adds an exclusion keyword and immediately hides matching loaded works", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /進階篩選/ }));
    fireEvent.change(screen.getByLabelText("避雷分組名稱"), { target: { value: "通用避雷" } });
    fireEvent.change(screen.getByLabelText("避雷分組關鍵字"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "新增分組" }));

    expect(screen.getByText("通用避雷")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("義忍閱讀測試")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "警示遮罩" }));
    expect(JSON.parse(window.localStorage.getItem("sui-read-content-safety-settings") || "{}")).toMatchObject({ blacklistDisplayMode: "mask" });
    await waitFor(() => expect(screen.getByText("⚠️ 此作品命中避雷設定")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "⚠️ 暫時查看這一篇" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
  });

  it("hides saved works locally without issuing another crawler request and persists the preference", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
    const requestsAfterSearch = mockState.mutationCalls;

    fireEvent.click(screen.getByRole("button", { name: /收藏 義忍閱讀測試/ }));
    fireEvent.click(screen.getByRole("button", { name: "儲存閱讀卡" }));
    fireEvent.click(screen.getByRole("button", { name: /進階篩選/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "隱藏已在藏書閣作品" }));

    await waitFor(() => expect(screen.queryByText("義忍閱讀測試")).toBeNull());
    expect(screen.getByText("藏書閣隱藏：1 篇")).toBeTruthy();
    expect(mockState.mutationCalls).toBe(requestsAfterSearch);
    expect(JSON.parse(window.localStorage.getItem("sui-read-filter-preset") || "{}")).toMatchObject({ hideBookmarked: true });

    fireEvent.click(screen.getByRole("checkbox", { name: "隱藏已在藏書閣作品" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
    expect(mockState.mutationCalls).toBe(requestsAfterSearch);
  });
});
