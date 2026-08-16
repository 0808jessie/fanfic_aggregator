import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SIDECAR_API_BASE,
  createSidecarUrl,
  isTauriDesktopRuntime,
  resolveSidecarApiBase,
  waitForSidecarReady,
} from "./desktopApi";

describe("desktop FastAPI client", () => {
  it("uses a loopback fallback when the configured base URL is absent or malformed", () => {
    expect(resolveSidecarApiBase()).toBe(DEFAULT_SIDECAR_API_BASE);
    expect(resolveSidecarApiBase("undefined/api")).toBe(DEFAULT_SIDECAR_API_BASE);
    expect(resolveSidecarApiBase("http://localhost:undefined")).toBe(DEFAULT_SIDECAR_API_BASE);
  });

  it("constructs a standards-compliant URL and encodes non-ASCII query parameters", () => {
    const url = createSidecarUrl("search", { keyword: "義忍 & 富岡", page: 2 });
    expect(url).toBe("http://127.0.0.1:8000/search?keyword=%E7%BE%A9%E5%BF%8D+%26+%E5%AF%8C%E5%B2%A1&page=2");
  });

  it("detects the Tauri runtime without relying on user-agent parsing", () => {
    expect(isTauriDesktopRuntime({ __TAURI_INTERNALS__: {} })).toBe(true);
    expect(isTauriDesktopRuntime({})).toBe(false);
  });

  it("retries the health endpoint until the local sidecar is ready", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await expect(waitForSidecarReady({ fetchImpl, attempts: 2, retryDelayMs: 0 })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/fastapi-status",
      { method: "GET", cache: "no-store" },
    );
  });
});
