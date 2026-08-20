// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookshelfView } from "./BookshelfView";
import type { BookmarkRecord } from "@/lib/personalLibrary";

const bookmark: BookmarkRecord = {
  url: "https://archiveofourown.org/works/123",
  result: {
    title: "批次操作測試作品",
    author: "測試作者",
    platform: "AO3",
    url: "https://archiveofourown.org/works/123",
    tags: "測試",
    summary: "測試摘要",
    scraped_at: "2026-08-18T00:00:00Z",
  },
  rating: 0,
  notes: "",
  tags: [],
  shelf: "to-read",
  savedAt: "2026-08-18T00:00:00Z",
  updatedAt: "2026-08-18T00:00:00Z",
  progress: { status: "unread", percent: 0, chapter: "" },
};

afterEach(() => cleanup());

describe("BookshelfView interaction polish", () => {
  it("requires confirmation before removing selected bookshelf records", () => {
    const onBatchRemove = vi.fn();
    render(<BookshelfView bookmarks={[bookmark]} onEdit={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} onBatchRemove={onBatchRemove} onBatchUpdate={vi.fn()} onProgressChange={vi.fn()} onExportAll={vi.fn()} onImportAll={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批次多選" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "選取 批次操作測試作品" }));
    fireEvent.click(screen.getByRole("button", { name: "批次刪除" }));

    expect(screen.getByText("即將從藏書閣移除 1 篇作品，此動作無法復原。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "確認移除 1 筆" }));
    expect(onBatchRemove).toHaveBeenCalledWith([bookmark.url]);
  });

  it("cycles reading status with one card-level click", () => {
    const onProgressChange = vi.fn();
    render(<BookshelfView bookmarks={[bookmark]} onEdit={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} onBatchRemove={vi.fn()} onBatchUpdate={vi.fn()} onProgressChange={onProgressChange} onExportAll={vi.fn()} onImportAll={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /閱讀狀態：未讀/ }));
    expect(onProgressChange).toHaveBeenCalledWith(bookmark.url, { status: "reading", percent: 1, chapter: "" });
  });

  it("opens a saved work in the in-app reader through the dedicated reading action", () => {
    const onRead = vi.fn();
    render(<BookshelfView bookmarks={[bookmark]} onEdit={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} onBatchRemove={vi.fn()} onBatchUpdate={vi.fn()} onProgressChange={vi.fn()} onRead={onRead} onExportAll={vi.fn()} onImportAll={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "閱讀 批次操作測試作品" }));
    expect(onRead).toHaveBeenCalledWith(bookmark);
  });

  it("exports selected readable works as a Reader-backed UTF-8 TXT anthology", async () => {
    const loadReaderDocument = vi.fn().mockResolvedValue({
      url: bookmark.url, title: bookmark.result.title, author: bookmark.result.author, source: "AO3", coverUrl: null,
      chapters: [{ id: "chapter-1", title: "第一章", paragraphs: ["可公開匯出的正文。"] }],
    });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:reader-export") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    render(<BookshelfView bookmarks={[bookmark]} onEdit={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} onBatchRemove={vi.fn()} onBatchUpdate={vi.fn()} onProgressChange={vi.fn()} loadReaderDocument={loadReaderDocument} onExportAll={vi.fn()} onImportAll={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "批次多選" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "選取 批次操作測試作品" }));
    fireEvent.click(screen.getByRole("button", { name: "匯出 TXT" }));

    await waitFor(() => expect(loadReaderDocument).toHaveBeenCalledWith(bookmark.url));
    expect(screen.getByRole("status").textContent).toContain("已匯出 1 篇 UTF-8 TXT");
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it("switches the bookshelf between three-column cards and compact list view with a persisted preference", () => {
    render(<BookshelfView bookmarks={[bookmark]} onEdit={vi.fn()} onRemove={vi.fn()} onImport={vi.fn()} onBatchRemove={vi.fn()} onBatchUpdate={vi.fn()} onProgressChange={vi.fn()} onExportAll={vi.fn()} onImportAll={vi.fn()} />);

    expect(screen.getByRole("button", { name: "藏書閣卡片模式" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "藏書閣條列模式" }));

    expect(screen.getByRole("button", { name: "藏書閣條列模式" }).getAttribute("aria-pressed")).toBe("true");
    expect(window.localStorage.getItem("fanfic-atlas-bookshelf-view")).toBe("list");
  });
});
