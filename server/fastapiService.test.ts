import { describe, expect, it } from "vitest";
import { FASTAPI_SOCKET_PATH, fastapiLaunchConfig } from "./fastapiService";

describe("FastAPI supervisor launch config", () => {
  it("starts Uvicorn from the FastAPI application directory through an internal socket", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
    expect(config.cwd).toBe("/tmp/fanfic-atlas/fastapi_app");
    expect(config.args).toEqual(["-m", "uvicorn", "main:app", "--uds", FASTAPI_SOCKET_PATH]);
  });

  it("allows production to resolve Python from the container PATH", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
  });
});
