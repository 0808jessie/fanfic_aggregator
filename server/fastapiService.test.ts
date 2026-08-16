import { describe, expect, it } from "vitest";
import { FASTAPI_BASE_URL, FASTAPI_HOST, FASTAPI_PORT, fastapiLaunchConfig } from "./fastapiService";

describe("FastAPI supervisor launch config", () => {
  it("starts Uvicorn from the FastAPI application directory on a private loopback HTTP port", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
    expect(config.cwd).toBe("/tmp/fanfic-atlas/fastapi_app");
    expect(config.args).toEqual(["-m", "uvicorn", "main:app", "--host", FASTAPI_HOST, "--port", String(FASTAPI_PORT)]);
    expect(FASTAPI_BASE_URL).toBe(`http://${FASTAPI_HOST}:${FASTAPI_PORT}`);
  });

  it("allows production to resolve Python from the container PATH", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
  });
});
