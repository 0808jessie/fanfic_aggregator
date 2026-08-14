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
  const createObjectURL = vi.fn(() => "blob:reading-library");

  beforeEach(() => {
    window.localStorage.clear();
    createObjectURL.mockClear();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL: vi.fn() });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

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
    expect(screen.getByRole("button", { name: "#神作" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "#重讀" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "#神作" }));
    expect(screen.getByText("義忍閱讀測試")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "篩選 5 星" }));
    expect(screen.getByText("想在夏天重讀。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("全文搜尋閱讀清單"), { target: { value: "夏天" } });
    expect(screen.getByText("義忍閱讀測試")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("閱讀清單排序方式"), { target: { value: "rating_desc" } });
    fireEvent.click(screen.getByRole("button", { name: "匯出備份 JSON" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    const backup = new File([JSON.stringify({
      version: 1,
      exportedAt: "2026-08-14T00:00:00.000Z",
      bookmarks: [
        { url: "https://archiveofourown.org/works/4242", result: { title: "備份預覽 A", author: "預覽作者", platform: "AO3", url: "https://archiveofourown.org/works/4242", tags: "義忍", summary: "", scraped_at: "2026-08-14T00:00:00.000Z" }, rating: 5, notes: "備份筆記", tags: ["神作"], savedAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z" },
        { url: "https://www.penana.com/story/4243", result: { title: "備份預覽 B", author: "另一位作者", platform: "Penana", url: "https://www.penana.com/story/4243", tags: "同人", summary: "", scraped_at: "2026-08-14T00:00:00.000Z" }, rating: 3, notes: "", tags: ["待讀"], savedAt: "2026-08-14T00:00:00.000Z", updatedAt: "2026-08-14T00:00:00.000Z" },
      ],
    })], "reading-library-preview.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("匯入閱讀清單備份"), { target: { files: [backup] } });
    expect(await screen.findByText("確認匯入閱讀清單")).toBeTruthy();
    expect(screen.getByText("收藏作品")).toBeTruthy();
    expect(screen.getByText("備份預覽 A")).toBeTruthy();
    expect(screen.getByText("備份預覽 B")).toBeTruthy();
    expect(screen.getByRole("button", { name: "合併資料" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "完整覆蓋" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    fireEvent.click(screen.getAllByRole("button", { name: /CP 詞庫管理/ })[0]);
    fireEvent.change(screen.getByLabelText("中文縮寫"), { target: { value: "黑邪" } });
    fireEvent.change(screen.getByLabelText("AO3 標準 Tag／Query"), { target: { value: "Heiyan/Wu Xie" } });
    fireEvent.change(screen.getByLabelText("中文全名／本地 Query"), { target: { value: "黑邪 黑眼鏡 吳邪" } });
    fireEvent.click(screen.getByRole("button", { name: "新增" }));
    expect(screen.getByText("黑邪")).toBeTruthy();
    expect(screen.getByText("Heiyan/Wu Xie")).toBeTruthy();
    expect(screen.getByText("黑邪 黑眼鏡 吳邪")).toBeTruthy();
    expect(window.localStorage.getItem("sui-read-custom-cp-map")).toContain("黑邪");
  });
});
