const ALLOWED_PATHS = new Set(["/api/search", "/api/reader"]);
const SEARCH_CACHE_SECONDS = 600;
const UPSTREAM_TIMEOUT_MS = 8_000;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(), ...headers },
  });
}

function safeOrigin(value) {
  try {
    const origin = new URL(value);
    return origin.protocol === "https:" ? origin.origin : null;
  } catch {
    return null;
  }
}

async function cacheKeyFor(request, bodyText) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyText));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return new Request(`${new URL(request.url).origin}/__fanfic-cache__/search/${key}`, { method: "GET" });
}

function responseWithCors(upstream, cacheable = false) {
  const headers = new Headers(upstream.headers);
  for (const [key, value] of Object.entries(corsHeaders())) headers.set(key, value);
  headers.set("Vary", "Origin");
  if (cacheable) headers.set("Cache-Control", `public, max-age=${SEARCH_CACHE_SECONDS}, stale-while-revalidate=60`);
  else headers.set("Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function proxyRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (!ALLOWED_PATHS.has(url.pathname)) return jsonResponse({ detail: "找不到可用的 API 路徑。" }, 404);
  if (request.method !== "POST") return jsonResponse({ detail: "此 API 僅接受 POST 請求。" }, 405);

  const origin = safeOrigin(env.API_ORIGIN);
  if (!origin) return jsonResponse({ detail: "Worker 尚未設定安全的 API_ORIGIN。" }, 503);

  const bodyText = await request.text();
  const cacheableSearch = url.pathname === "/api/search";
  const cacheKey = cacheableSearch ? await cacheKeyFor(request, bodyText) : null;
  if (cacheKey) {
    const cached = await caches.default.match(cacheKey);
    if (cached) return responseWithCors(cached, true);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(`${origin}${url.pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fanfic-Proxy": "cloudflare-worker" },
      body: bodyText,
      signal: controller.signal,
    });
    const response = responseWithCors(upstream, cacheableSearch && upstream.ok);
    if (cacheKey && upstream.ok) ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "上游閱讀服務逾時，請稍後再試。"
      : "上游閱讀服務暫時無法連線，請稍後再試。";
    return jsonResponse({ detail: message }, 504);
  } finally {
    clearTimeout(timeoutId);
  }
}

export default {
  fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    return proxyRequest(request, env, ctx);
  },
};
