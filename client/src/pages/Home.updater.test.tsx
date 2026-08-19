import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterState = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  relaunch: vi.fn(),
  openUrl: vi.fn(),
  postSidecarSearch: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: updaterState.toastError, success: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/desktopApi", () => ({
  isTauriDesktopRuntime: () => true,
  waitForSidecarReady: vi.fn().mockResolvedValue(undefined),
  postSidecarSearch: updaterState.postSidecarSearch,
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: updaterState.check,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: updaterState.relaunch,
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: updaterState.openUrl,
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown, request?: unknown) => void }) => {
            const [isPending] = React.useState(false);
            return {
              mutate: vi.fn((request) => {
                const response = {
                  items: [{
                    title: "AO3 外連測試作品",
                    author: "Test Author",
                    platform: "AO3",
                    url: "https://archiveofourown.org/works/9001",
                    tags: "General",
                    summary: "",
                    scraped_at: "2026-01-01T00:00:00Z",
                  }],
                  totalWorks: 1,
                  totalPages: 1,
                  page: 1,
                  loadedThroughPage: 1,
                  nextPage: null,
                  hasMore: false,
                };
                options.onSuccess?.(response, request);
                return response;
              }),
              isPending,
            };
          },
        },
      },
    },
  };
});

import Home from "./Home";

describe("Tauri updater interaction", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("sui-read-content-safety-settings", JSON.stringify({ ageConfirmation: "adult", blurRestrictedSummaries: true }));
    updaterState.check.mockReset();
    updaterState.download.mockReset();
    updaterState.install.mockReset();
    updaterState.relaunch.mockReset();
    updaterState.openUrl.mockReset();
    updaterState.postSidecarSearch.mockReset();
    updaterState.toastError.mockReset();
  });

  afterEach(() => cleanup());

  it("opens an update dialog at startup and downloads, installs, then relaunches", async () => {
    updaterState.download.mockImplementation(async (onEvent) => {
      onEvent?.({ event: "Started", data: { contentLength: 100 } });
      onEvent?.({ event: "Progress", data: { chunkLength: 60 } });
      onEvent?.({ event: "Finished" });
    });
    updaterState.install.mockResolvedValue(undefined);
    updaterState.relaunch.mockResolvedValue(undefined);
    updaterState.check.mockResolvedValue({ version: "1.2.1", body: "修正公開來源連線診斷", download: updaterState.download, install: updaterState.install });

    render(<Home />);

    await waitFor(() => expect(screen.getByText("發現新版本 v1.2.1")).toBeTruthy());
    expect(screen.getByText("修正公開來源連線診斷")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "立即更新並重啟" }));

    await waitFor(() => expect(updaterState.relaunch).toHaveBeenCalledOnce());
    expect(updaterState.download).toHaveBeenCalledOnce();
    expect(updaterState.install).toHaveBeenCalledOnce();
  });

  it("exposes a manual update check and current desktop version in the bookshelf tools", async () => {
    updaterState.check.mockResolvedValue(null);
    render(<Home />);
    await waitFor(() => expect(updaterState.check).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: /藏書閣 \/ 收藏夾/ }));
    expect(screen.getByText("v1.2.1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "檢查更新" }));

    await waitFor(() => expect(updaterState.check).toHaveBeenCalledTimes(2));
  });

  it("explains a network failure when a manual update check cannot reach the manifest", async () => {
    updaterState.check.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("network fetch failed"));
    render(<Home />);
    await waitFor(() => expect(updaterState.check).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: /藏書閣 \/ 收藏夾/ }));
    fireEvent.click(screen.getByRole("button", { name: "檢查更新" }));

    await waitFor(() => expect(updaterState.toastError).toHaveBeenCalledWith("無法連線至更新服務", expect.objectContaining({ description: expect.stringContaining("GitHub Releases") })));
  });

  it("logs the updater manifest URL and HTTP status for a failed manual check", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    updaterState.check.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("HTTP 404 latest.json"));
    render(<Home />);
    await waitFor(() => expect(updaterState.check).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole("button", { name: /藏書閣 \/ 收藏夾/ }));
    fireEvent.click(screen.getByRole("button", { name: "檢查更新" }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "[Updater] Update check failed",
      expect.objectContaining({
        endpoint: "https://github.com/0808jessie/fanfic_aggregator/releases/latest/download/latest.json",
        statusCode: 404,
      }),
    ));
    consoleError.mockRestore();
  });

  it("opens a work source in the system browser when running as a desktop app", async () => {
    updaterState.check.mockResolvedValue(null);
    updaterState.openUrl.mockResolvedValue(undefined);
    updaterState.postSidecarSearch.mockResolvedValue({
      items: [{
        title: "AO3 外連測試作品",
        author: "Test Author",
        platform: "AO3",
        url: "https://archiveofourown.org/works/9001",
        tags: "General",
        summary: "",
        scraped_at: "2026-01-01T00:00:00Z",
      }],
      totalWorks: 1,
      totalPages: 1,
      page: 1,
      loadedThroughPage: 1,
      nextPage: null,
      hasMore: false,
    });
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    const sourceLink = await screen.findByRole("link", { name: /前往原始作品/ });
    fireEvent.click(sourceLink);

    await waitFor(() => expect(updaterState.openUrl).toHaveBeenCalledWith("https://archiveofourown.org/works/9001"));
  });
});
