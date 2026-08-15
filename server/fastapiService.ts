import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import path from "node:path";

const FASTAPI_PORT = 8000;
const FASTAPI_HEALTH_URL = `http://127.0.0.1:${FASTAPI_PORT}/fastapi-status`;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function fastapiLaunchConfig(projectRoot: string = process.cwd()) {
  return {
    command: process.env.FASTAPI_PYTHON_BIN || "python3",
    args: ["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", String(FASTAPI_PORT)],
    cwd: path.join(projectRoot, "fastapi_app"),
  };
}

async function waitForFastapiHealth(): Promise<boolean> {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      const response = await fetch(FASTAPI_HEALTH_URL, { signal: AbortSignal.timeout(300) });
      if (response.ok) return true;
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
  if (!(await isPortAvailable(FASTAPI_PORT))) {
    const healthy = await waitForFastapiHealth();
    console.log(
      healthy
        ? `[FastAPI Supervisor] Reusing healthy service on port ${FASTAPI_PORT}`
        : `[FastAPI Supervisor] Port ${FASTAPI_PORT} is occupied but health check failed`,
    );
    return () => undefined;
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
  managedChild.stdout?.on("data", chunk => console.log(`[FastAPI] ${String(chunk).trimEnd()}`));
  managedChild.stderr?.on("data", chunk => console.error(`[FastAPI] ${String(chunk).trimEnd()}`));
  managedChild.once("exit", (code, signal) => {
    console.error(`[FastAPI Supervisor] FastAPI exited (code=${code}, signal=${signal})`);
  });

  const healthy = await waitForFastapiHealth();
  if (!healthy) {
    console.error("[FastAPI Supervisor] FastAPI did not become healthy within 5 seconds");
  } else {
    console.log(`[FastAPI Supervisor] FastAPI ready on port ${FASTAPI_PORT}`);
  }

  return () => {
    if (!managedChild.killed) managedChild.kill("SIGTERM");
  };
}
