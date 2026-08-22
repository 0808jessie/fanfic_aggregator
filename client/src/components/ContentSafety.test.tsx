import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { AgeConfirmationDialog, ReadingPreferencesDialog } from "@/components/ContentSafety";
import { DEFAULT_CONTENT_SAFETY_SETTINGS } from "@/lib/personalLibrary";

describe("content safety and reader cache preferences", () => {
  afterEach(cleanup);

  it("presents a responsive modern age confirmation and returns the selected protection mode", () => {
    const onConfirm = vi.fn();
    render(<AgeConfirmationDialog open onConfirm={onConfirm} />);

    const dialog = screen.getByRole("dialog", { name: "年齡確認" });
    expect(dialog.className).toContain("rounded-3xl");
    expect(dialog.className).toContain("backdrop-blur-md");
    fireEvent.click(screen.getByRole("button", { name: /未滿 18 歲啟用全年齡保護/ }));
    expect(onConfirm).toHaveBeenCalledWith("minor");
  });

  it("requires an adult confirmation before unlocking free rating selection and keeps preference buttons horizontally aligned", () => {
    const onConfirmAge = vi.fn();
    const onClearCache = vi.fn();
    render(<ReadingPreferencesDialog open onOpenChange={vi.fn()} settings={{ ...DEFAULT_CONTENT_SAFETY_SETTINGS, ageConfirmation: "minor" }} cacheStats={{ entryCount: 3, byteSize: 1_572_864 }} onConfirmAge={onConfirmAge} onClearCache={onClearCache} />);

    expect(screen.getByText(/目前已快取 3 篇作品，約 1.5 MB/)).toBeTruthy();
    expect(screen.getByText("全年齡保護").parentElement?.parentElement?.className).toContain("flex items-center gap-3");
    fireEvent.click(screen.getByRole("button", { name: /自由選擇分級可使用 R18 篩選/ }));
    expect(onConfirmAge).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "確認成人分級" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "已滿 18 歲，解鎖分級" }));
    expect(onConfirmAge).toHaveBeenCalledWith("adult");
  });

  it("shows cache size and requires a second confirmation before clearing all reader documents", () => {
    const onClearCache = vi.fn();
    render(<ReadingPreferencesDialog open onOpenChange={vi.fn()} settings={{ ...DEFAULT_CONTENT_SAFETY_SETTINGS, ageConfirmation: "adult" }} cacheStats={{ entryCount: 3, byteSize: 1_572_864 }} onConfirmAge={vi.fn()} onClearCache={onClearCache} />);

    fireEvent.click(screen.getByRole("button", { name: /清空所有閱讀快取/ }));
    expect(screen.getByRole("heading", { name: "確認清空閱讀快取？" })).toBeTruthy();
    expect(screen.getByText(/將刪除目前已快取的 3 篇離線正文（1.5 MB）/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "確認清空" }));
    expect(onClearCache).toHaveBeenCalledTimes(1);
  });

  it("surfaces system version status and keeps manual update actions inside settings", () => {
    const onCheckForUpdates = vi.fn();
    const onApplyUpdate = vi.fn();
    render(<ReadingPreferencesDialog open onOpenChange={vi.fn()} settings={{ ...DEFAULT_CONTENT_SAFETY_SETTINGS, ageConfirmation: "adult" }} cacheStats={{ entryCount: 0, byteSize: 0 }} onConfirmAge={vi.fn()} onClearCache={vi.fn()} appVersion="v1.2.12" updateAvailable updateCheckPending={false} onCheckForUpdates={onCheckForUpdates} onApplyUpdate={onApplyUpdate} />);

    expect(screen.getByText("系統版本與更新")).toBeTruthy();
    expect(screen.getByText(/目前版本 v1.2.12/)).toBeTruthy();
    expect(screen.getByText("有可用更新")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "檢查更新" }));
    fireEvent.click(screen.getByRole("button", { name: "立即更新至最新版" }));
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
    expect(onApplyUpdate).toHaveBeenCalledTimes(1);
  });
});
