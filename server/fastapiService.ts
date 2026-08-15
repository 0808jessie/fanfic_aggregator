import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

export const FASTAPI_SOCKET_PATH =
  process.env.FASTAPI_SOCKET_PATH || path.join(process.cwd(), ".manus-fastapi.sock");

function requestFastapiHealth(): Promise<boolean> {
  return new Promise(resolve => {
    const request = http.request(
      { socketPath: FASTAPI_SOCKET_PATH, path: "/fastapi-status", method: "GET", timeout: 300 },
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
  return {
    command: process.env.FASTAPI_PYTHON_BIN || "python3",
    // FastAPI is internal only. A Unix socket prevents the preview service from
    // mistaking this sidecar for the public Node frontend on port 3000.
    args: ["-m", "uvicorn", "main:app", "--uds", FASTAPI_SOCKET_PATH],
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
    console.log(`[FastAPI Supervisor] Reusing healthy internal service at ${FASTAPI_SOCKET_PATH}`);
    return () => undefined;
  }

  // A dead process can leave the filesystem entry behind. Remove only after
  // health verification has failed so a healthy sibling is never disturbed.
  try {
    fs.rmSync(FASTAPI_SOCKET_PATH, { force: true });
  } catch (error) {
    console.error("[FastAPI Supervisor] Failed to clear stale socket:", error);
  }

  const config = fastapiLaunchConfig();
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
    try {
      fs.rmSync(FASTAPI_SOCKET_PATH, { force: true });
    } catch {
      // Socket cleanup is best-effort during process shutdown.
    }
  });

  const healthy = await waitForFastapiHealth();
  if (!healthy) {
    const detail = spawnFailure ? ` (${spawnFailure.message})` : "";
    console.error(`[FastAPI Supervisor] FastAPI did not become healthy within 5 seconds${detail}`);
  } else {
    console.log(`[FastAPI Supervisor] FastAPI ready at ${FASTAPI_SOCKET_PATH}`);
  }

  return () => {
    if (!managedChild.killed) managedChild.kill("SIGTERM");
  };
}
