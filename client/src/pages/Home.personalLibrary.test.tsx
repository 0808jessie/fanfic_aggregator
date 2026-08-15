// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

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
  beforeEach(() => window.localStorage.clear());
  afterEach(() => cleanup());

  it("saves a reading card, shows it in the private shelf, and manages a CP mapping", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));
    await waitFor(() => expect(screen.getByText("義忍閱讀測試")).toBeTruthy());
    expect(screen.getByText("最近搜尋")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /收藏 義忍閱讀測試/ }));
    fireEvent.click(screen.getByRole("button", { name: "5 星" }));
    fireEvent.change(screen.getByLabelText("個人筆記"), { target: { value: "想在夏天重讀。" } });
    fireEvent.change(screen.getByLabelText("自訂標籤"), { target: { value: "神作, 重讀" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存閱讀卡" }));

    fireEvent.click(screen.getByRole("button", { name: /我的閱讀清單/ }));
    expect(await screen.findByText("想在夏天重讀。")).toBeTruthy();
    expect(screen.getByText("#神作")).toBeTruthy();
    expect(screen.getByText("#重讀")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /CP 詞庫管理/ })[0]);
    fireEvent.change(screen.getByLabelText("中文縮寫"), { target: { value: "黑邪" } });
    fireEvent.change(screen.getByLabelText("AO3 關係標籤"), { target: { value: "Heiyan/Wu Xie" } });
    fireEvent.change(screen.getByLabelText("繁中本地關鍵字"), { target: { value: "黑邪 吳邪" } });
    fireEvent.click(screen.getByRole("button", { name: "新增自訂對照" }));
    expect(screen.getByText("黑邪")).toBeTruthy();
    expect(screen.getByText("Heiyan/Wu Xie")).toBeTruthy();
    expect(screen.getByText("黑邪 吳邪")).toBeTruthy();
    expect(window.localStorage.getItem("sui-read-custom-cp-map")).toContain("黑邪");
    expect(screen.getByText("TROPE / WORLD INDEX")).toBeTruthy();
    expect(screen.getByText("ABO / 歐米茄")).toBeTruthy();
    expect(screen.getByText("Alpha/Beta/Omega Dynamics")).toBeTruthy();
  });
});
