import { describe, expect, it, vi } from "vitest";

vi.mock("axios", () => ({
  default: {
    request: vi.fn().mockRejectedValue(new Error("sidecar unavailable")),
  },
}));

import { appRouter } from "./routers";

describe("tRPC FastAPI unavailable-source contract", () => {
  it("preserves all newly registered platform statuses when the desktop sidecar is unavailable", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: {} as never,
      res: {} as never,
    });

    const result = await caller.fastapi.proxy({
      path: "/search",
      method: "POST",
      data: { keyword: "義忍", platforms: ["bahamut", "kadokado"], page: 1 },
    });

    expect(result.platformStatuses).toEqual([
      expect.objectContaining({ platformId: "bahamut", label: "巴哈姆特創作大廳", status: "error" }),
      expect.objectContaining({ platformId: "kadokado", label: "KadoKado 角角者", status: "error" }),
    ]);
  });
});
