// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "./Home";

const mockState = vi.hoisted(() => ({ lastVariables: null as unknown }));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("@/lib/trpc", async () => {
  const React = await import("react");
  return {
    trpc: {
      fastapi: {
        proxy: {
          useMutation: (options: { onSuccess?: (payload: unknown) => void }) => {
            const [isPending, setIsPending] = React.useState(false);
            const mutate = (variables?: unknown) => {
              mockState.lastVariables = variables;
              setIsPending(true);
              window.setTimeout(() => {
                const payload = {
                  items: [
                    {
                      title: "【義忍】無題",
                      author: "mitsuhane",
                      platform: "AO3",
                      url: "https://archiveofourown.org/works/27025444",
                      tags: "富岡義勇/胡蝶忍",
                      relationships: ["富岡義勇/胡蝶忍"],
                      characters: ["富岡義勇", "胡蝶忍"],
                      summary: "測試摘要",
                      scraped_at: "2026-01-01T00:00:00Z",
                    },
                  ],
                  totalWorks: 40,
                  totalPages: 2,
                  page: 1,
                  loadedThroughPage: 2,
                  nextPage: 2,
                  hasMore: true,
                };
                options.onSuccess?.(payload);
                setIsPending(false);
              }, 10);
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
  mockState.lastVariables = null;
});

describe("Home Page Traditional Chinese '義忍' Search", () => {
  it("successfully searches and renders results for traditional '義忍'", async () => {
    render(<Home />);

    fireEvent.change(screen.getByLabelText("搜尋同人作品"), { target: { value: "義忍" } });
    fireEvent.click(screen.getByRole("button", { name: "RUN SEARCH" }));

    await waitFor(() => expect(screen.getByText("40 STORIES FOUND")).toBeTruthy());
    expect(screen.getByText("【義忍】無題")).toBeTruthy();
    expect(screen.getByText(/mitsuhane/i)).toBeTruthy();
    expect(mockState.lastVariables).toEqual({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["ao3", "lofter"], page: 1 },
    });
  });
});
