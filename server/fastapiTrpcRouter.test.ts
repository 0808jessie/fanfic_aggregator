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
        timeout: 25_000,
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
});
