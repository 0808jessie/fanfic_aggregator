import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    fireEvent.click(screen.getByLabelText("開啟排版設定"));
    const settings = screen.getByLabelText("排版與主題設定");
    fireEvent.click(within(settings).getByLabelText("放大字級"));
    fireEvent.click(within(settings).getByRole("button", { name: "字型 · 黑體" }));
    fireEvent.click(within(settings).getByRole("button", { name: "橫排" }));
    expect(within(settings).getByRole("button", { name: "直排" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByLabelText("關閉閱讀器"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("formats a series title with the active chapter position", async () => {
    const chapters = Array.from({ length: 8 }, (_, index) => ({ id: `chapter-${index + 1}`, title: `第 ${index + 1} 章`, index: index + 1, url: `https://example.test/series/${index + 1}`, paragraphs: [] }));
    const loadDocument = vi.fn().mockResolvedValue({ ...document, title: "第五章標題", seriesTitle: "長篇系列", currentChapterIndex: 4, tableOfContents: chapters, chapters: [{ ...document.chapters[0], title: "第五章標題", url: chapters[4].url }] });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);

    expect((await screen.findAllByText("《長篇系列》 #5 第五章標題")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByLabelText("開啟章節目錄").textContent).toContain("(5/8)");
  });

  it("keeps a clear recovery path when a public source cannot provide readable content", async () => {
    render(<ReaderView work={work} loadDocument={vi.fn().mockRejectedValue(new Error("原始網站顯示安全驗證頁"))} onClose={vi.fn()} onOpenSource={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("目前無法整理這篇內文")).toBeTruthy());
    expect(screen.getByText("原始網站顯示安全驗證頁")).toBeTruthy();
    expect(screen.getByRole("button", { name: /前往原始頁面/ })).toBeTruthy();
  });

  it("guides CxC works to their original reading surface without requesting protected text", async () => {
    const loadDocument = vi.fn();
    const onOpenSource = vi.fn();
    render(<ReaderView work={{ ...work, platform: "CxC 創利市集", url: "https://cxc.today/@writer/work/42" }} loadDocument={loadDocument} onClose={vi.fn()} onOpenSource={onOpenSource} />);

    expect(await screen.findByText("請在 CxC 原站閱讀")).toBeTruthy();
    expect(loadDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /前往 CxC 原站享受最佳排版閱讀/ }));
    expect(onOpenSource).toHaveBeenCalledWith("https://cxc.today/@writer/work/42");
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

  it("keeps a long bottom chapter label and reading percentage on one responsive line", async () => {
    const longChapterTitle = "這是一個非常非常長的章節名稱，用來驗證閱讀器底部進度列不會把正文或百分比擠成多行";
    render(<ReaderView work={work} loadDocument={vi.fn().mockResolvedValue({ ...document, chapters: [{ ...document.chapters[0], title: longChapterTitle }] })} onClose={vi.fn()} />);

    const label = await screen.findByText(longChapterTitle, { selector: "span" });
    expect(label.className).toContain("truncate");
    expect(label.className).toContain("whitespace-nowrap");
    const progressLine = label.parentElement;
    expect(progressLine?.lastElementChild?.className).toContain("whitespace-nowrap");
  });

  it("uses mobile overscroll protection and advances a chapter with a horizontal touch swipe", async () => {
    const nextUrl = "https://example.com/work/42/chapter/2";
    const tableOfContents = [
      { id: "chapter-1", index: 1, title: "第一章", url: work.url, paragraphs: [] },
      { id: "chapter-2", index: 2, title: "第二章", url: nextUrl, paragraphs: [] },
    ];
    const nextDocument = { ...document, url: nextUrl, title: "第二章", currentChapterIndex: 1, tableOfContents, chapters: [{ id: "chapter-2", title: "第二章", url: nextUrl, paragraphs: ["第二章正文。"] }] };
    const loadDocument = vi.fn((_sourceUrl: string, chapterUrl?: string) => Promise.resolve(chapterUrl === nextUrl ? nextDocument : { ...document, tableOfContents }));
    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);

    const viewport = await screen.findByLabelText("閱讀內容");
    expect(viewport.className).toContain("overscroll-contain");
    expect(viewport.className).toContain("touch-pan-y");
    fireEvent.touchStart(viewport, { touches: [{ clientX: 240, clientY: 240 }] });
    fireEvent.touchEnd(viewport, { changedTouches: [{ clientX: 120, clientY: 240 }] });

    expect(await screen.findByText("第二章正文。")).toBeTruthy();
  });

  it("marks a newly opened first chapter as reading before the reader is scrolled", async () => {
    const onProgress = vi.fn();
    render(<ReaderView work={work} loadDocument={vi.fn().mockResolvedValue(document)} onClose={vi.fn()} onProgress={onProgress} />);

    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());

    await waitFor(() => expect(onProgress).toHaveBeenCalledWith({ percent: 1, chapter: "第一章", chapterUrl: work.url }));
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

  it("keeps the original chapter table of contents when a later Penana issue only returns its own chapter", async () => {
    const firstUrl = "https://www.penana.com/story/195625/issue/1";
    const secondUrl = "https://www.penana.com/story/195625/issue/2";
    const tableOfContents = [
      { id: "chapter-1", index: 1, title: "第一章", url: firstUrl, paragraphs: [] },
      { id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: [] },
    ];
    const loadDocument = vi.fn()
      .mockResolvedValueOnce({ ...document, source: "Penana", url: firstUrl, tableOfContents })
      .mockResolvedValueOnce({ ...document, source: "Penana", url: secondUrl, currentChapterIndex: 0, tableOfContents: [{ id: "chapter-2", index: 1, title: "第二章", url: secondUrl, paragraphs: [] }], chapters: [{ id: "chapter-2", title: "第二章", url: secondUrl, paragraphs: ["第二章正文。"] }] });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "下一章" }));
    await waitFor(() => expect(screen.getByText("第二章正文。")).toBeTruthy());

    expect(screen.getByLabelText("開啟章節目錄").textContent).toContain("(2/2)");
    fireEvent.click(screen.getByLabelText("開啟章節目錄"));
    expect(screen.getByRole("button", { name: /第一章/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /第二章/ })).toBeTruthy();
  });

  it("resets the reading viewport to the top after moving to another chapter", async () => {
    const firstUrl = "https://www.pixiv.net/novel/show.php?id=21";
    const secondUrl = "https://www.pixiv.net/novel/show.php?id=22";
    const toc = [
      { id: "chapter-1", index: 1, title: "第一章", url: firstUrl, paragraphs: [] },
      { id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: [] },
    ];
    const loadDocument = vi.fn()
      .mockResolvedValueOnce({ ...document, source: "Pixiv", url: firstUrl, tableOfContents: toc })
      .mockResolvedValueOnce({ ...document, source: "Pixiv", url: secondUrl, currentChapterIndex: 1, tableOfContents: toc, chapters: [{ id: "chapter-2", index: 2, title: "第二章", url: secondUrl, paragraphs: ["第二章正文。"] }] });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("第一段公開正文。")).toBeTruthy());
    const viewport = screen.getByLabelText("閱讀內容");
    Object.defineProperty(viewport, "scrollTop", { configurable: true, writable: true, value: 320 });

    fireEvent.click(screen.getByRole("button", { name: "下一章" }));

    await waitFor(() => expect(screen.getByText("第二章正文。")).toBeTruthy());
    await waitFor(() => expect((viewport as HTMLDivElement).scrollTop).toBe(0));
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

  it("switches any preloaded AO3 full-work chapter without another source request", async () => {
    const chapters = Array.from({ length: 44 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      index: index + 1,
      title: `第 ${index + 1} 章`,
      url: `https://archiveofourown.org/chapters/${index + 1}`,
      paragraphs: [`第 ${index + 1} 章正文。`],
    }));
    const loadDocument = vi.fn().mockResolvedValue({
      ...document,
      source: "AO3",
      url: chapters[0].url,
      title: "44 章 AO3 作品",
      tableOfContents: chapters,
      chapters,
    });

    render(<ReaderView work={work} loadDocument={loadDocument} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("第 1 章正文。")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("開啟章節目錄"));
    fireEvent.click(screen.getByRole("button", { name: /第 44 章/ }));

    expect(await screen.findByText("第 44 章正文。")).toBeTruthy();
    expect(loadDocument).toHaveBeenCalledTimes(1);
  });
});
