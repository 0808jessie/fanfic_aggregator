import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebPwaApiUrl, postWebPwaReader, postWebPwaSearch, usesWebPwaApi } from "./webPwaApi";

describe("Web PWA API client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses same-origin browser proxy endpoints by default and excludes Tauri runtime", () => {
    expect(createWebPwaApiUrl("/api/search")).toMatch(/\/api\/search$/);
    expect(createWebPwaApiUrl("/api/reader")).toMatch(/\/api\/reader$/);
    expect(usesWebPwaApi({})).toBe(false);
    expect(usesWebPwaApi({ __TAURI_INTERNALS__: {} })).toBe(false);
  });

  it("posts search and reader payloads through the browser-safe proxy paths", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: "測試作品" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postWebPwaSearch({ keyword: "義忍", platforms: ["pixiv"] })).resolves.toEqual({ items: [] });
    await expect(postWebPwaReader("https://www.pixiv.net/novel/show.php?id=1", { chapterUrl: "https://www.pixiv.net/novel/show.php?id=2" })).resolves.toEqual({ title: "測試作品" });

    expect(fetchMock).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/api\/search$/), expect.objectContaining({ method: "POST", body: JSON.stringify({ keyword: "義忍", platforms: ["pixiv"] }) }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/api\/reader$/), expect.objectContaining({ method: "POST", body: JSON.stringify({ url: "https://www.pixiv.net/novel/show.php?id=1", chapterUrl: "https://www.pixiv.net/novel/show.php?id=2" }) }));
  });

  it("uses VITE_API_BASE_URL when a Cloudflare Worker origin is configured", () => {
    vi.stubEnv("VITE_API_BASE_URL", "https://fanfic-proxy.example.workers.dev/");
    vi.stubEnv("VITE_REQUIRE_API_BASE_URL", "true");

    expect(createWebPwaApiUrl("/api/search")).toBe("https://fanfic-proxy.example.workers.dev/api/search");
    expect(createWebPwaApiUrl("/api/reader")).toBe("https://fanfic-proxy.example.workers.dev/api/reader");
  });

  it("prefers the Worker origin injected into a Cloudflare Pages document", () => {
    vi.stubGlobal("__FANFIC_WEB_API_ORIGIN__", "https://published-proxy.example.workers.dev");
    vi.stubGlobal("__FANFIC_REQUIRE_API_ORIGIN__", true);

    expect(createWebPwaApiUrl("/api/search")).toBe("https://published-proxy.example.workers.dev/api/search");
  });

  it("blocks a Cloudflare Pages build with no Worker origin before it can request relative /api", async () => {
    vi.stubEnv("VITE_REQUIRE_API_BASE_URL", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => createWebPwaApiUrl("/api/search")).toThrow("Cloudflare Pages 尚未設定 VITE_API_BASE_URL");
    await expect(postWebPwaSearch({ keyword: "義忍" })).rejects.toThrow("Cloudflare Pages 尚未設定 VITE_API_BASE_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
