import { isTauriDesktopRuntime } from "./desktopApi";

type FetchLike = typeof globalThis.fetch;

const PAGES_API_ORIGIN_ERROR = "Cloudflare Pages 尚未設定 VITE_API_BASE_URL。請在 Pages Environment variables 填入 Cloudflare Worker HTTPS 網址後重新部署。";

type PagesRuntimeConfig = typeof globalThis & {
  __FANFIC_WEB_API_ORIGIN__?: unknown;
  __FANFIC_REQUIRE_API_ORIGIN__?: unknown;
};

function injectedWebApiOrigin(): string {
  const runtimeValue = (globalThis as PagesRuntimeConfig).__FANFIC_WEB_API_ORIGIN__;
  return typeof runtimeValue === "string"
    ? runtimeValue
    : (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_WEB_API_ORIGIN || "");
}

function requiresInjectedWebApiOrigin(): boolean {
  const runtimeValue = (globalThis as PagesRuntimeConfig).__FANFIC_REQUIRE_API_ORIGIN__;
  return typeof runtimeValue === "boolean"
    ? runtimeValue
    : import.meta.env.VITE_REQUIRE_API_BASE_URL === "true";
}

function configuredWebApiOrigin(): string {
  const candidate = injectedWebApiOrigin().trim();
  const requiresWorkerOrigin = requiresInjectedWebApiOrigin();
  if (!candidate) {
    if (requiresWorkerOrigin) throw new Error(PAGES_API_ORIGIN_ERROR);
    return globalThis.location?.origin || "http://localhost";
  }
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
  } catch {
    // Production Pages must never silently fall back to its static host.
  }
  if (requiresWorkerOrigin) throw new Error(PAGES_API_ORIGIN_ERROR);
  return globalThis.location?.origin || "http://localhost";
}

export function usesWebPwaApi(runtime: unknown = globalThis): boolean {
  // Production PWAs always use the Node-owned same-origin bridge. Local Web
  // previews opt in through the dev command, which prevents test runtimes from
  // unintentionally replacing their explicit tRPC transport mocks.
  return !isTauriDesktopRuntime(runtime) && (import.meta.env.PROD || import.meta.env.VITE_WEB_PWA_API_DIRECT === "true");
}

export function createWebPwaApiUrl(path: "/api/search" | "/api/reader" | "/api/health"): string {
  return new URL(path, configuredWebApiOrigin()).toString();
}

async function postWebPwaApi<T>(path: "/api/search" | "/api/reader", data: Record<string, unknown>, fetchImpl: FetchLike = globalThis.fetch, signal?: AbortSignal): Promise<T> {
  const response = await fetchImpl(createWebPwaApiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal,
  });
  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json() as { detail?: unknown; warning?: unknown };
      detail = typeof payload.detail === "string" ? payload.detail : typeof payload.warning === "string" ? payload.warning : "";
    } catch {
      // Keep the HTTP fallback if a proxy returns a non-JSON response.
    }
    throw new Error(detail || `網頁服務回傳 HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function postWebPwaSearch<T>(data: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  return postWebPwaApi<T>("/api/search", data, globalThis.fetch, signal);
}

export function postWebPwaReader<T>(url: string, options: { chapterUrl?: string } = {}, signal?: AbortSignal): Promise<T> {
  return postWebPwaApi<T>("/api/reader", { url, ...(options.chapterUrl ? { chapterUrl: options.chapterUrl } : {}) }, globalThis.fetch, signal);
}
