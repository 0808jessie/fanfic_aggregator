import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const publicDirectory = path.resolve(process.cwd(), "client/public");
const projectDirectory = path.resolve(process.cwd());

describe("PWA static assets", () => {
  it("declares an installable standalone Fanfic Atlas manifest with standard and maskable icons", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(publicDirectory, "manifest.webmanifest"), "utf8")) as { name: string; display: string; icons: Array<{ src: string; sizes: string; type: string; purpose: string }> };
    expect(manifest.name).toContain("Fanfic Atlas");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.some(icon => icon.sizes === "192x192")).toBe(true);
    expect(manifest.icons.some(icon => icon.sizes === "512x512")).toBe(true);
    expect(manifest.icons.some(icon => icon.purpose === "maskable")).toBe(true);
    expect(manifest.icons.every(icon => icon.type === "image/png" && icon.src.endsWith(".png"))).toBe(true);
    expect(manifest.icons.every(icon => icon.src.startsWith("/manus-storage/"))).toBe(true);
  });

  it("keeps search and reader responses out of the offline app-shell cache", () => {
    const worker = fs.readFileSync(path.join(publicDirectory, "sw.js"), "utf8");
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('url.pathname === "/search"');
    expect(worker).toContain('url.pathname === "/reader"');
    expect(worker).toContain('"/manifest.webmanifest"');
    expect(worker).toContain('const CACHE_NAME = "fanfic-atlas-shell-v5"');
    expect(worker.match(/^const CACHE_NAME\s*=/gm)).toHaveLength(1);
    expect(() => new Function(worker)).not.toThrow();
    expect(worker).toContain('"/manus-storage/fanfic-atlas-pwa-192_607d6e55.png"');
    expect(worker).toContain('"/manus-storage/fanfic-atlas-pwa-maskable-512_9f1f7cb4.png"');
  });

  it("ships Cloudflare Pages API exclusions and a Worker deployment contract", () => {
    const routes = JSON.parse(fs.readFileSync(path.join(publicDirectory, "_routes.json"), "utf8")) as { include: string[]; exclude: string[] };
    const wrangler = fs.readFileSync(path.join(projectDirectory, "wrangler.toml"), "utf8");
    const worker = fs.readFileSync(path.join(projectDirectory, "workers", "worker.js"), "utf8");

    expect(routes.include).toContain("/*");
    expect(routes.exclude).toContain("/api/*");
    expect(wrangler).toContain('main = "workers/worker.js"');
    expect(wrangler).toContain("compatibility_date");
    expect(wrangler).toContain("API_ORIGIN");
    expect(worker).toContain('"Access-Control-Allow-Origin": "*"');
    expect(worker).toContain('"Access-Control-Allow-Headers": "*"');
    expect(worker).toContain("const UPSTREAM_TIMEOUT_MS = 12_000");
    expect(worker).toContain("const SEARCH_CACHE_SECONDS = 600");
    expect(worker).toContain('url.pathname === "/api/search"');
    expect(worker).toContain('headers.set("Cache-Control", "no-store")');
  });
});
