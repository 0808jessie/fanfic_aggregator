import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const FASTAPI_HOST = "127.0.0.1";
export const FASTAPI_PORT = Number.parseInt(process.env.FASTAPI_PORT || "8000", 10);
export const FASTAPI_SOCKET_PATH = process.env.FASTAPI_SOCKET_PATH || path.join(process.cwd(), ".manus-fastapi.sock");
export const FASTAPI_USES_UNIX_SOCKET = !process.env.FASTAPI_BASE_URL;
export const FASTAPI_BASE_URL = (process.env.FASTAPI_BASE_URL || "http://localhost").replace(/\/$/, "");

function requestFastapiHealth(): Promise<boolean> {
  return new Promise(resolve => {
    const healthUrl = new URL("/api/health", FASTAPI_BASE_URL);
    const request = http.request(
      FASTAPI_USES_UNIX_SOCKET
        ? { socketPath: FASTAPI_SOCKET_PATH, path: "/api/health", method: "GET", timeout: 500 }
        : {
            hostname: healthUrl.hostname,
            port: healthUrl.port || 80,
            path: `${healthUrl.pathname}${healthUrl.search}`,
            method: "GET",
            timeout: 500,
          },
      response => {
        response.resume();
        resolve(response.statusCode === 200);
      },
    );
    request.once("error", () => resolve(false));
    request.once("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.end();
  });
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function fastapiLaunchConfig(projectRoot: string = process.cwd()) {
  const socketPath = process.env.FASTAPI_SOCKET_PATH || path.join(projectRoot, ".manus-fastapi.sock");
  return {
    command: process.env.FASTAPI_PYTHON_BIN || "python3",
    // The Web worker uses a Unix socket so port 3000 remains the only preview
    // gateway candidate. Desktop sidecars keep their independent loopback port.
    args: FASTAPI_USES_UNIX_SOCKET
      ? ["-m", "uvicorn", "main:app", "--uds", socketPath]
      : ["-m", "uvicorn", "main:app", "--host", FASTAPI_HOST, "--port", String(FASTAPI_PORT)],
    cwd: path.join(projectRoot, "fastapi_app"),
  };
}

async function waitForFastapiHealth(): Promise<boolean> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      if (await requestFastapiHealth()) return true;
    } catch {
      // Uvicorn is still importing the app or the service could not start.
    }
    await delay(200);
  }
  return false;
}

/**
 * Ensure FastAPI is available whenever the Node/tRPC server starts.
 *
 * A manually started healthy service is left untouched for local debugging;
 * otherwise the Node server owns the spawned child and terminates it on exit.
 */
export async function startManagedFastapi(): Promise<() => void> {
  if (await waitForFastapiHealth()) {
    console.log(`[FastAPI Supervisor] Reusing healthy loopback service at ${FASTAPI_BASE_URL}`);
    return () => undefined;
  }

  const config = fastapiLaunchConfig();
  if (FASTAPI_USES_UNIX_SOCKET) {
    try {
      fs.rmSync(FASTAPI_SOCKET_PATH, { force: true });
    } catch (error) {
      console.warn("[FastAPI Supervisor] Unable to remove stale socket:", error);
    }
  }
  let child: ChildProcess | undefined;
  try {
    child = spawn(config.command, config.args, {
      cwd: config.cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    console.error("[FastAPI Supervisor] Failed to spawn FastAPI:", error);
    return () => undefined;
  }

  const managedChild = child;
  if (!managedChild) return () => undefined;
  let spawnFailure: Error | undefined;
  // `spawn()` reports a missing executable asynchronously. Listening for this
  // event keeps the Node frontend alive so its 3000 health probe can succeed
  // and the proxy can return a source-level diagnostic instead of crashing.
  managedChild.once("error", error => {
    spawnFailure = error;
    console.error("[FastAPI Supervisor] FastAPI process could not start:", error);
  });
  managedChild.stdout?.on("data", chunk => console.log(`[FastAPI] ${String(chunk).trimEnd()}`));
  managedChild.stderr?.on("data", chunk => console.error(`[FastAPI] ${String(chunk).trimEnd()}`));
  managedChild.once("exit", (code, signal) => {
    console.error(`[FastAPI Supervisor] FastAPI exited (code=${code}, signal=${signal})`);
  });

  const healthy = await waitForFastapiHealth();
  if (!healthy) {
    const detail = spawnFailure ? ` (${spawnFailure.message})` : "";
    console.error(`[FastAPI Supervisor] FastAPI did not become healthy within 5 seconds${detail}`);
  } else {
    console.log(`[FastAPI Supervisor] FastAPI ready at ${FASTAPI_BASE_URL}`);
  }

  return () => {
    if (!managedChild.killed) managedChild.kill("SIGTERM");
  };
}
