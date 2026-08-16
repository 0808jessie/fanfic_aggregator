import { describe, expect, it } from "vitest";
import { FASTAPI_BASE_URL, FASTAPI_SOCKET_PATH, FASTAPI_USES_UNIX_SOCKET, fastapiLaunchConfig } from "./fastapiService";

describe("FastAPI supervisor launch config", () => {
  it("starts Uvicorn from the FastAPI application directory on a private Unix socket", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
    expect(config.cwd).toBe("/tmp/fanfic-atlas/fastapi_app");
    expect(config.args).toEqual(["-m", "uvicorn", "main:app", "--uds", "/tmp/fanfic-atlas/.manus-fastapi.sock"]);
    expect(FASTAPI_USES_UNIX_SOCKET).toBe(true);
    expect(FASTAPI_SOCKET_PATH).toContain(".manus-fastapi.sock");
    expect(FASTAPI_BASE_URL).toBe("http://localhost");
  });

  it("allows production to resolve Python from the container PATH", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
  });
});
