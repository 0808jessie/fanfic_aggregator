import axios from "axios";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || "http://localhost:8000";

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
      console.log(`[FastAPITrpcProxy] Forwarding ${input.method} to ${targetUrl}`);

      try {
        const response = await axios.request({
          method: input.method,
          url: targetUrl,
          params: input.params,
          data: input.data,
          timeout: 25_000,
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        });

        console.log(`[FastAPITrpcProxy] Upstream responded with status ${response.status}`);

        if (response.status >= 400) {
          const errorDetail =
            typeof response.data === "object" && response.data !== null && "detail" in response.data
              ? JSON.stringify((response.data as { detail: unknown }).detail)
              : JSON.stringify(response.data);
          throw new Error(`FastAPI returned HTTP ${response.status}: ${errorDetail}`);
        }

        return response.data as unknown;
      } catch (error: any) {
        console.error(`[FastAPITrpcProxy] Error proxying request to ${targetUrl}:`, error.message || error);
        throw error;
      }
    }),
});
