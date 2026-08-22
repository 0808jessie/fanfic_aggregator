import worker from "./worker.js";
import { afterEach, describe, expect, it, vi } from "vitest";

function context() {
  return { waitUntil: vi.fn() };
}

describe("Cloudflare PWA API proxy", () => {
  const env = { API_ORIGIN: "https://reader-api.example.test" };

  afterEach(() => vi.unstubAllGlobals());

  it("answers every CORS preflight with wildcard headers before contacting the upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request("https://proxy.example/api/search", {
      method: "OPTIONS",
      headers: {
        Origin: "https://fanfic-atlas.pages.dev",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type, x-fanfic-client",
      },
    }), env, context());

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("*");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles an OPTIONS preflight even before an unsupported path is rejected", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request("https://proxy.example/api/unknown", { method: "OPTIONS" }), env, context());

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies a search POST, adds CORS and schedules a twelve-hour cache write", async () => {
    const cache = { match: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined) };
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: "公開作品" }] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();

    const response = await worker.fetch(
      new Request("https://proxy.example/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: "義忍", platforms: ["ao3"] }) }),
      env,
      ctx,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=43200");
    expect(response.headers.get("Cache-Control")).toContain("max-age=43200");
    expect(fetchMock).toHaveBeenCalledWith("https://reader-api.example.test/api/search", expect.objectContaining({ method: "POST" }));
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);
  });

  it("serves a cached equivalent search without calling the FastAPI origin", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: "快取作品" }] }), { status: 200 })),
      put: vi.fn(),
    };
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(
      new Request("https://proxy.example/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: ["ao3"], keyword: "義忍" }),
      }),
      env,
      context(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=43200");
    expect(cache.match).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps reader responses out of the edge cache while preserving CORS", async () => {
    const cache = { match: vi.fn(), put: vi.fn() };
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ content: "公開正文" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();
    const payload = JSON.stringify({ url: "https://example.test/story" });

    const response = await worker.fetch(
      new Request("https://proxy.example/api/reader", { method: "POST", body: payload }),
      env,
      ctx,
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://reader-api.example.test/api/reader",
      expect.objectContaining({ method: "POST", body: payload }),
    );
    expect(cache.match).not.toHaveBeenCalled();
    expect(cache.put).not.toHaveBeenCalled();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("rejects unsupported paths and methods before they reach the FastAPI origin", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await worker.fetch(new Request("https://proxy.example/api/unknown", { method: "POST" }), env, context());

    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bypasses stale edge results for force_refresh and writes the latest successful search", async () => {
    const cache = {
      match: vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: "舊快取" }] }), { status: 200 })),
      put: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal("caches", { default: cache });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{ title: "最新作品" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const ctx = context();

    const response = await worker.fetch(
      new Request("https://proxy.example/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: "義忍", force_refresh: true }) }),
      env,
      ctx,
    );

    expect(await response.json()).toEqual({ items: [{ title: "最新作品" }] });
    expect(cache.match).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith("https://reader-api.example.test/api/search", expect.objectContaining({ method: "POST" }));
    expect(cache.put).toHaveBeenCalledTimes(1);
    expect(ctx.waitUntil).toHaveBeenCalledTimes(1);

    const refreshedCacheKey = cache.put.mock.calls[0][0] as Request;
    cache.match.mockImplementation((request: Request) => Promise.resolve(
      request.url === refreshedCacheKey.url
        ? new Response(JSON.stringify({ items: [{ title: "最新作品" }] }), { status: 200 })
        : undefined,
    ));
    fetchMock.mockClear();
    const cachedResponse = await worker.fetch(
      new Request("https://proxy.example/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: "義忍" }) }),
      env,
      context(),
    );

    expect(await cachedResponse.json()).toEqual({ items: [{ title: "最新作品" }] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
