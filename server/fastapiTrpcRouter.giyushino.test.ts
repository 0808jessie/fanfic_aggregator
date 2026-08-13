import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

describe("tRPC fastapi.proxy Router for '義忍'", () => {
    it("has fastapi.proxy procedure defined in appRouter", () => {
        expect(appRouter._def.procedures).toHaveProperty("fastapi.proxy");
    });
});
