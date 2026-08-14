import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { appRouter } from "./routers";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
  },
}));

describe("fastapi.proxy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards a search request to the Python service", async () => {
    vi.mocked(axios.request).mockResolvedValue({
      status: 200,
      data: [{ title: "Test story", platform: "AO3" }],
    } as never);

    const caller = appRouter.createCaller({
      user: undefined,
      req: {} as never,
      res: {} as never,
    });

    const result = await caller.fastapi.proxy({
      path: "/search",
      method: "POST",
      data: { keyword: "星光", platforms: ["ao3"] },
    });

    expect(result).toEqual([{ title: "Test story", platform: "AO3" }]);
    expect(axios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: "http://localhost:8000/search",
        data: { keyword: "星光", platforms: ["ao3"] },
        timeout: 20_000,
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("preserves the explicit empty-result envelope from FastAPI", async () => {
    const emptyEnvelope = {
      items: [],
      source: "none",
      warning: "未從 AO3, LOFTER 取得可驗證作品",
    };
    vi.mocked(axios.request).mockResolvedValue({ status: 200, data: emptyEnvelope } as never);

    const caller = appRouter.createCaller({
      user: undefined,
      req: {} as never,
      res: {} as never,
    });

    const result = await caller.fastapi.proxy({
      path: "/search",
      method: "POST",
      data: { keyword: "__no_match__", platforms: ["ao3", "lofter"] },
    });

    expect(result).toEqual(emptyEnvelope);
  });

  it("rejects upstream HTTP errors", async () => {
    vi.mocked(axios.request).mockResolvedValue({ status: 503, data: { detail: "down" } } as never);

    const caller = appRouter.createCaller({
      user: undefined,
      req: {} as never,
      res: {} as never,
    });

    await expect(caller.fastapi.proxy({ path: "/fastapi-status" })).rejects.toThrow("HTTP 503");
  });

  it("returns source-level retry states when the search service is unreachable", async () => {
    vi.mocked(axios.request).mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:8000"));
    const caller = appRouter.createCaller({ user: undefined, req: {} as never, res: {} as never });

    const result = await caller.fastapi.proxy({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["ao3", "waterwriter"] },
    }) as { source: string; success: boolean; items: unknown[]; platformStatuses: Array<{ platformId: string; status: string; warning: string }> };

    expect(result).toMatchObject({ source: "none", success: false, items: [] });
    expect(result.platformStatuses).toEqual([
      expect.objectContaining({ platformId: "ao3", status: "error", warning: expect.stringContaining("搜尋服務暫時無法連線") }),
      expect.objectContaining({ platformId: "waterwriter", status: "error", warning: expect.stringContaining("搜尋服務暫時無法連線") }),
    ]);
  });
});
