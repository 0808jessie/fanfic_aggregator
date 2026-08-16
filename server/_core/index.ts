import "dotenv/config";
import express from "express";
import { createServer, request as httpRequest } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import {
  FASTAPI_BASE_URL,
  FASTAPI_SOCKET_PATH,
  FASTAPI_USES_UNIX_SOCKET,
  startManagedFastapi,
} from "../fastapiService";

function proxyFastapiHealth(): Promise<{ status: number; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const target = new URL("/api/health", FASTAPI_BASE_URL);
    const request = httpRequest(
      FASTAPI_USES_UNIX_SOCKET
        ? { socketPath: FASTAPI_SOCKET_PATH, path: "/api/health", method: "GET", timeout: 1_500 }
        : {
            hostname: target.hostname,
            port: target.port || 80,
            path: `${target.pathname}${target.search}`,
            method: "GET",
            timeout: 1_500,
          },
      upstream => {
        const chunks: Buffer[] = [];
        upstream.on("data", chunk => chunks.push(Buffer.from(chunk)));
        upstream.once("end", () => {
          try {
            resolve({
              status: upstream.statusCode || 502,
              payload: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("FastAPI health check timed out")));
    request.end();
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const stopFastapi = await startManagedFastapi();
  let hasStoppedFastapi = false;
  const stopManagedFastapi = () => {
    if (hasStoppedFastapi) return;
    hasStoppedFastapi = true;
    stopFastapi();
  };
  process.once("SIGINT", stopManagedFastapi);
  process.once("SIGTERM", stopManagedFastapi);

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Health is exposed through the same Node origin as the preview so browser
  // checks receive FastAPI JSON instead of Vite's SPA fallback document.
  app.get("/api/health", async (_request, response) => {
    try {
      const upstream = await proxyFastapiHealth();
      response.status(upstream.status).json(upstream.payload);
    } catch (error) {
      console.error("[FastAPI Preview Health] Loopback health proxy failed:", error);
      response.status(503).json({
        status: "unavailable",
        service: "fastapi-search",
        detail: "FastAPI loopback service is not reachable.",
      });
    }
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch(console.error);
