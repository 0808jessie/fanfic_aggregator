import axios from "axios";
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";

const FASTAPI_BASE_URL = process.env.FASTAPI_BASE_URL || "http://localhost:8000";

export const fastapiTrpcRouter = router({
  proxy: publicProcedure
    .input(
      z.object({
        path: z.string().regex(/^\/[a-zA-Z0-9/_-]+$/),
        method: z.enum(["GET", "POST", "PUT", "DELETE"]).default("GET"),
        params: z.record(z.string(), z.unknown()).optional(),
        data: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const response = await axios.request({
        method: input.method,
        url: `${FASTAPI_BASE_URL}${input.path}`,
        params: input.params,
        data: input.data,
        timeout: 20_000,
        headers: { "Content-Type": "application/json" },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        throw new Error(`FastAPI returned HTTP ${response.status}`);
      }

      return response.data as unknown;
    }),
});
