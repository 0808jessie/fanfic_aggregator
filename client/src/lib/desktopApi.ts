export const DEFAULT_SIDECAR_API_BASE = "http://127.0.0.1:8000";

type QueryValue = string | number | boolean | null | undefined;
type FetchLike = typeof globalThis.fetch;

export function isTauriDesktopRuntime(runtime: unknown = globalThis): boolean {
  return Boolean(
    runtime
      && typeof runtime === "object"
      && ("__TAURI_INTERNALS__" in runtime || "__TAURI__" in runtime),
  );
}

export function resolveSidecarApiBase(configuredBase?: string): string {
  const candidate = configuredBase?.trim();
  if (candidate) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.origin;
    } catch {
      // A malformed build-time environment value must never reach fetch().
    }
  }
  return DEFAULT_SIDECAR_API_BASE;
}

export function createSidecarUrl(
  path: string,
  query: Record<string, QueryValue> = {},
  configuredBase?: string,
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, resolveSidecarApiBase(configuredBase));
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== null && value !== undefined) searchParams.set(key, String(value));
  }
  url.search = searchParams.toString();
  return url.toString();
}

export async function waitForSidecarReady({
  fetchImpl = globalThis.fetch,
  attempts = 20,
  retryDelayMs = 300,
  configuredBase,
  signal,
}: {
  fetchImpl?: FetchLike;
  attempts?: number;
  retryDelayMs?: number;
  configuredBase?: string;
  signal?: AbortSignal;
} = {}): Promise<void> {
  let lastError: unknown;
  const healthUrl = createSidecarUrl("/fastapi-status", {}, configuredBase);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (signal?.aborted) throw new DOMException("搜尋已由較新的關鍵字取代", "AbortError");
    try {
      const response = await fetchImpl(healthUrl, { method: "GET", cache: "no-store", signal });
      if (response.ok) return;
      lastError = new Error(`Sidecar health check returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      await new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, retryDelayMs);
        signal?.addEventListener("abort", () => {
          window.clearTimeout(timer);
          reject(new DOMException("搜尋已由較新的關鍵字取代", "AbortError"));
        }, { once: true });
      });
    }
  }

  const detail = lastError instanceof Error ? lastError.message : "unknown startup failure";
  throw new Error(`搜尋引擎尚未就緒：${detail}`);
}

export async function postSidecarSearch<T>(
  payload: unknown,
  configuredBase?: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await globalThis.fetch(createSidecarUrl("/search", {}, configuredBase), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) throw new Error(`搜尋引擎回傳 HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
