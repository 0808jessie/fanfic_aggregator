import { performance } from "node:perf_hooks";
import axios from "axios";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { FASTAPI_BASE_URL } from "./fastapiService";

// Source aggregation allows each external platform up to a 5s connect + 10s
// read budget. Keep the proxy above that bounded window so it can return
// partial results rather than replacing them with a global error envelope.
const FASTAPI_PROXY_TIMEOUT_MS = 20_000;
const PLATFORM_LABELS: Record<string, string> = {
  ao3: "AO3",
  cxc: "CxC 創利市集",
  doujin: "同人誌中心",
  waterwriter: "在水裡寫字",
  penana: "Penana",
};

function unavailableSearchEnvelope(data: Record<string, unknown> | undefined) {
  const requested = Array.isArray(data?.platforms)
    ? data.platforms.filter((platform): platform is string => typeof platform === "string")
    : Object.keys(PLATFORM_LABELS);
  const platforms = requested.filter((platform) => platform in PLATFORM_LABELS);
  const warning = "搜尋服務暫時無法連線；各來源尚未開始查詢，請稍後重試。";
  return {
    items: [],
    source: "none",
    success: false,
    isRateLimited: false,
    warning,
    totalWorks: 0,
    totalPages: 0,
    page: typeof data?.page === "number" ? data.page : 1,
    loadedThroughPage: 0,
    nextPage: null,
    hasMore: false,
    platformStatuses: platforms.map((platformId) => ({
      platformId,
      label: PLATFORM_LABELS[platformId],
      status: "error",
      itemCount: 0,
      warning,
      translatedQuery: typeof data?.keyword === "string" ? data.keyword : "",
    })),
  };
}

export const fastapiTrpcRouter = router({
  proxy: publicProcedure
    .input(
      z.object({
        path: z.string().regex(/^\/[a-zA-Z0-9/_-]+$|^$/),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
        params: z.record(z.string(), z.unknown()).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const targetUrl = `${FASTAPI_BASE_URL}${input.path}`;
      const startedAt = performance.now();
      console.log(`[FastAPITrpcProxy] Forwarding ${input.method} to ${targetUrl}`);

      try {
        const response = await axios.request({
          method: input.method,
          url: targetUrl,
          params: input.params,
          data: input.data,
          // The FastAPI registry enforces a bounded per-source deadline. Keep
          // the proxy slightly above it to relay partial results, never to
          // replace source-level states with a global proxy error.
          timeout: FASTAPI_PROXY_TIMEOUT_MS,
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        });

        console.log(`[FastAPITrpcProxy] Upstream responded with status ${response.status} in ${Math.round(performance.now() - startedAt)}ms`);

        if (response.status >= 400) {
          const errorDetail =
            typeof response.data === "object" && response.data !== null && "detail" in response.data
              ? JSON.stringify((response.data as { detail: unknown }).detail)
              : JSON.stringify(response.data);
          throw new Error(`FastAPI returned HTTP ${response.status}: ${errorDetail}`);
        }

        return response.data as unknown;
      } catch (error: any) {
        console.error(`[FastAPITrpcProxy] Error proxying request to ${targetUrl} in ${Math.round(performance.now() - startedAt)}ms:`, error.message || error);
        if (input.path === "/search") {
          return unavailableSearchEnvelope(input.data);
        }
        throw error;
      }
    }),
});
