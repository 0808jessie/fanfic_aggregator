import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReaderView, type ReaderDocument } from "./ReaderView";

const work = {
  id: "ao3:https://archiveofourown.org/works/42",
  title: "測試作品",
  author: "測試作者",
  platform: "AO3",
  url: "https://archiveofourown.org/works/42",
  tags: "同人",
  summary: "摘要",
  scraped_at: "2026-08-20T00:00:00Z",
};
const document: ReaderDocument = {
  url: work.url,
  title: work.title,
  author: work.author,
  source: "AO3",
  chapters: [{ id: "chapter-1", title: "第一章", paragraphs: ["第一段公開正文。", "第二段公開正文。"] }],
};

afterEach(() => cleanup());

describe("ReaderView", () => {
  it("loads one clean document and exposes reading presentation controls", async () => {
    const onClose = vi.fn();
    render(<ReaderView work={work} loadDocument={vi.fn().mockResolvedValue(document)} onClose={onClose} />);

    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    expect(screen.getAllByText("第一章")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("放大字級"));
    fireEvent.click(screen.getByLabelText("切換行距"));
    fireEvent.click(screen.getByLabelText("切換字型"));
    fireEvent.click(screen.getByLabelText("切換橫排或直排"));
    expect(screen.getByRole("button", { name: "切換橫排或直排" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("關閉閱讀器"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a clear recovery path when a public source cannot provide readable content", async () => {
    render(<ReaderView work={work} loadDocument={vi.fn().mockRejectedValue(new Error("原始網站顯示安全驗證頁"))} onClose={vi.fn()} onOpenSource={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("目前無法整理這篇內文")).toBeTruthy());
    expect(screen.getByText("原始網站顯示安全驗證頁")).toBeTruthy();
    expect(screen.getByRole("button", { name: /前往原始頁面/ })).toBeTruthy();
  });

  it("reports a bounded scroll percentage together with the visible chapter", async () => {
    const onProgress = vi.fn();
    render(<ReaderView work={work} loadDocument={vi.fn().mockResolvedValue(document)} onClose={vi.fn()} onProgress={onProgress} />);

    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    const viewport = screen.getByLabelText("閱讀內容");
    Object.defineProperties(viewport, {
      scrollHeight: { configurable: true, value: 1_000 },
      clientHeight: { configurable: true, value: 500 },
      scrollTop: { configurable: true, value: 250, writable: true },
    });
    fireEvent.scroll(viewport);

    expect(onProgress).toHaveBeenCalledWith({ percent: 50, chapter: "第一章" });
  });
});
