import { isTauriDesktopRuntime } from "./desktopApi";

type FetchLike = typeof globalThis.fetch;

function configuredWebApiOrigin(): string {
  const candidate = (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_WEB_API_ORIGIN)?.trim();
  if (!candidate) return globalThis.location?.origin || "http://localhost";
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
  } catch {
    // Invalid build-time configuration safely falls back to the same origin.
  }
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
