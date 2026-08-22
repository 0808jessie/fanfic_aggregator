import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

describe("Cloudflare Pages static deployment contract", () => {
  it("publishes the Vite PWA from the project-root dist directory", () => {
    const viteConfig = fs.readFileSync(path.join(projectRoot, "vite.config.ts"), "utf8");
    const packageJson = fs.readFileSync(path.join(projectRoot, "package.json"), "utf8");
    const tauriConfig = fs.readFileSync(path.join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8");

    expect(viteConfig).toContain('outDir: path.resolve(import.meta.dirname, "dist")');
    expect(viteConfig).not.toContain('outDir: path.resolve(import.meta.dirname, "dist/public")');
    expect(viteConfig).toContain("process.env.VITE_API_BASE_URL");
    expect(viteConfig).toContain("process.env.VITE_REQUIRE_API_BASE_URL");
    expect(viteConfig).toContain("vitePluginPagesApiOrigin");
    expect(viteConfig).toContain("window.__FANFIC_WEB_API_ORIGIN__");
    expect(viteConfig).toContain("window.__FANFIC_REQUIRE_API_ORIGIN__");
    expect(packageJson).toContain('"cf:pages:build": "VITE_REQUIRE_API_BASE_URL=true vite build --mode production"');
    expect(tauriConfig).toContain('"frontendDist": "../dist"');
  });

  it("ships a Cloudflare-compatible SPA fallback from Vite public assets", () => {
    const redirects = fs.readFileSync(path.join(projectRoot, "client", "public", "_redirects"), "utf8").trim();
    const routes = JSON.parse(fs.readFileSync(path.join(projectRoot, "client", "public", "_routes.json"), "utf8"));

    expect(redirects).toBe("/*    /index.html   200");
    expect(routes).toMatchObject({ include: ["/*"], exclude: ["/api/*"] });
  });
});
