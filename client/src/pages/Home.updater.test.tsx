import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const updaterState = vi.hoisted(() => ({
  check: vi.fn(),
  download: vi.fn(),
  install: vi.fn(),
  relaunch: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), message: vi.fn() },
}));

vi.mock("@/lib/desktopApi", () => ({
  isTauriDesktopRuntime: () => true,
  waitForSidecarReady: vi.fn().mockResolvedValue(undefined),
  postSidecarSearch: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: updaterState.check,
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: updaterState.relaunch,
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: () => {
            const [isPending] = React.useState(false);
            return { mutate: vi.fn(), isPending };
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
    updaterState.check.mockResolvedValue({ version: "1.2.0", body: "修正桌面更新提示", download: updaterState.download, install: updaterState.install });

    render(<Home />);

    await waitFor(() => expect(screen.getByText("發現新版本 v1.2.0")).toBeTruthy());
    expect(screen.getByText("修正桌面更新提示")).toBeTruthy();
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
    expect(screen.getByText("v1.1.10")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "檢查更新" }));

    await waitFor(() => expect(updaterState.check).toHaveBeenCalledTimes(2));
  });
});
