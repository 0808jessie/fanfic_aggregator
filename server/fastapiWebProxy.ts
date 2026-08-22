import axios from "axios";
import type { Express, Request, Response } from "express";
import { FASTAPI_BASE_URL, FASTAPI_SOCKET_PATH, FASTAPI_USES_UNIX_SOCKET } from "./fastapiService";

// Reader requests can legitimately include a public chapter catalogue followed
// by a prose payload. Keep the proxy bounded, but leave enough time to relay a
// source-level success or 4xx/5xx diagnostic instead of replacing it with 503.
const WEB_PROXY_TIMEOUT_MS = 45_000;

async function forwardFastapiJson(path: "/search" | "/reader", request: Request, response: Response) {
  try {
    const upstream = await axios.request({
      method: "POST",
      url: `${FASTAPI_BASE_URL}${path}`,
      data: request.body,
      ...(FASTAPI_USES_UNIX_SOCKET ? { socketPath: FASTAPI_SOCKET_PATH } : {}),
      timeout: WEB_PROXY_TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
      validateStatus: () => true,
    });
    response.status(upstream.status).json(upstream.data);
  } catch (error) {
    console.error(`[FastAPI Web Proxy] ${path} failed:`, error);
    response.status(503).json({ detail: "網頁閱讀服務暫時無法連線，請稍後再試。" });
  }
}

/**
 * Browser/PWA requests use a same-origin API. A Cloudflare Worker can proxy
 * these same /api/* paths without exposing the FastAPI process to browsers.
 */
export function registerFastapiWebProxy(app: Express) {
  app.post("/api/search", (request, response) => void forwardFastapiJson("/search", request, response));
  app.post("/api/reader", (request, response) => void forwardFastapiJson("/reader", request, response));
}
