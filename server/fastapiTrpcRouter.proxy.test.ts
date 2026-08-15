import { describe, it, expect, vi } from "vitest";
import axios from "axios";
import { appRouter } from "./routers";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(async (config) => {
      if (config.url?.includes("/search") && config.data?.keyword === "義忍") {
        return {
          status: 200,
          data: {
            items: [
              {
                title: "【義忍】無題",
                author: "mitsuhane",
                platform: "AO3",
                url: "https://archiveofourown.org/works/27025444",
                tags: "富岡義勇/胡蝶忍",
              },
            ],
            totalWorks: 40,
            source: "live",
          },
        };
      }
      return { status: 404, data: { detail: "Not found" } };
    }),
  },
}));

describe("tRPC fastapi.proxy Actual Request Forwarding for '義忍'", () => {
    it("forwards keyword '義忍' to FastAPI /search and returns items", async () => {
        const caller = appRouter.createCaller({
            user: { id: "test-user", role: "user", openId: "test", name: "Test" },
            req: {} as any,
            res: {} as any,
        });

        const result: any = await caller.fastapi.proxy({
            path: "/search",
            method: "POST",
            data: { keyword: "義忍", platforms: ["ao3"], page: 1 },
        });

        expect(result).toHaveProperty("items");
        expect(result.items.length).toBeGreaterThan(0);
        expect(result.items[0].title).toBe("【義忍】無題");
        expect(axios.request).toHaveBeenCalledTimes(1);
    });
});
