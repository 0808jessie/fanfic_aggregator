import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
beforeEach(() => window.sessionStorage.clear());

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

    expect(onProgress).toHaveBeenCalledWith({ percent: 50, chapter: "第一章", chapterUrl: "https://archiveofourown.org/works/42" });
  });

  it("opens a chapter drawer and requests the selected chapter URL", async () => {
    const firstUrl = "https://www.pixiv.net/novel/show.php?id=1";
    const secondUrl = "https://www.pixiv.net/novel/show.php?id=2";
    const loadDocument = vi.fn()
      .mockResolvedValueOnce({
        ...document,
        source: "Pixiv",
        url: firstUrl,
        tableOfContents: [
          { id: "chapter-1", index: 1, title: "第一章", url: firstUrl, paragraphs: [] },
          { id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: [] },
        ],
      })
      .mockResolvedValueOnce({
        ...document,
        source: "Pixiv",
        url: secondUrl,
        currentChapterIndex: 1,
        tableOfContents: [
          { id: "chapter-1", index: 1, title: "第一章", url: firstUrl, paragraphs: [] },
          { id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: [] },
        ],
        chapters: [{ id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: ["第二章正文。"] }],
      });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("開啟章節目錄"));
    expect(screen.getByLabelText("章節目錄抽屜")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /第二章/ }));

    await waitFor(() => expect(screen.getByText("第二章正文。")).toBeTruthy());
    expect(loadDocument).toHaveBeenLastCalledWith(work.url, secondUrl);
  });

  it("prefetches the next chapter after the current public chapter becomes readable", async () => {
    const firstUrl = "https://www.pixiv.net/novel/show.php?id=11";
    const nextUrl = "https://www.pixiv.net/novel/show.php?id=12";
    const loadDocument = vi.fn().mockResolvedValue({
      ...document,
      source: "Pixiv",
      url: firstUrl,
      tableOfContents: [
        { id: "chapter-1", index: 1, title: "第一章", url: firstUrl, paragraphs: [] },
        { id: "chapter-2", index: 2, title: "第二章", url: nextUrl, paragraphs: [] },
      ],
    });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);
    await waitFor(() => expect(loadDocument).toHaveBeenCalledWith(work.url, nextUrl));
  });

  it("reopens a successfully read chapter from the current-session local cache without another source request", async () => {
    const firstLoad = vi.fn().mockResolvedValue(document);
    const initial = render(<ReaderView work={work} loadDocument={firstLoad} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    expect(firstLoad).toHaveBeenCalledTimes(1);
    initial.unmount();

    const secondLoad = vi.fn().mockRejectedValue(new Error("不應重新請求來源"));
    render(<ReaderView work={work} loadDocument={secondLoad} onClose={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    expect(secondLoad).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("本機快取");
  });
});
