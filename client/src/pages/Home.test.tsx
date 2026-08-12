// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const mockState = vi.hoisted(() => ({ nextHookId: 0, lastVariables: null as unknown }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown) => void; onError?: (error: Error) => void }) => {
            const [hookId] = React.useState(() => mockState.nextHookId++);
            const [isPending, setIsPending] = React.useState(false);
            const mutate = (variables?: unknown) => {
              mockState.lastVariables = variables;
              setIsPending(true);
              window.setTimeout(() => {
                const payload = hookId === 0
                  ? {
                      items: [{ title: "PAGE ONE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9001", tags: "富岡義勇/胡蝶忍, Post-Canon", relationships: ["富岡義勇/胡蝶忍"], characters: ["富岡義勇", "胡蝶忍"], summary: "", scraped_at: "2026-01-01T00:00:00Z" }],
                      totalWorks: 60,
                      totalPages: 3,
                      page: 1,
                      loadedThroughPage: 2,
                      nextPage: 3,
                      hasMore: true,
                    }
                  : {
                      items: [
                        { title: "PAGE ONE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9001", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
                        { title: "PAGE THREE", author: "Author", platform: "AO3", url: "https://archiveofourown.org/works/9003", tags: "", summary: "", scraped_at: "2026-01-01T00:00:00Z" },
                      ],
                      totalWorks: 60,
                      totalPages: 3,
                      page: 3,
                      loadedThroughPage: 3,
                      nextPage: null,
                      hasMore: false,
                    };
                options.onSuccess?.(payload);
                setIsPending(false);
              }, 20);
            };
            return { mutate, isPending };
          },
        },
      },
    },
  };
});

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mockState.nextHookId = 0;
  mockState.lastVariables = null;
});

describe("Home pagination interactions", () => {
  it("shows totalWorks and appends a page while displaying the loading label", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "月光" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("60 STORIES FOUND")).toBeTruthy());
    expect(screen.getByText("PAGE ONE")).toBeTruthy();
    const relationshipTag = screen.getByText("♡ 富岡義勇/胡蝶忍");
    expect(relationshipTag.className).toContain("bg-[#ffe8f0]");
    expect(screen.getByText("◇ 富岡義勇")).toBeTruthy();
    expect(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "LOAD MORE / PAGE 3" }));
    expect((screen.getByRole("button", { name: "正在翻頁載入中..." }) as HTMLButtonElement).disabled).toBe(true);

    await waitFor(() => expect(screen.getByText("PAGE THREE")).toBeTruthy());
    expect(screen.getAllByText("PAGE ONE", { exact: true })).toHaveLength(1);
    expect(screen.getByText("LOADED THROUGH PAGE 3 / 3")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "LOAD MORE / PAGE 3" })).toBeNull();
  });
});

  it("renders platform checkboxes and sends the selected platform list", async () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /FILTERS/ }));
    const lofterCheckbox = screen.getByRole("checkbox", { name: "搜尋 LOFTER" });
    expect(lofterCheckbox.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(lofterCheckbox);
    expect(lofterCheckbox.getAttribute("aria-checked")).toBe("false");

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "花" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "花", platforms: ["ao3"], page: 1 },
    }));
  });
