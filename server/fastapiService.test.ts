import { describe, expect, it } from "vitest";
import { fastapiLaunchConfig } from "./fastapiService";

describe("FastAPI supervisor launch config", () => {
  it("starts Uvicorn from the FastAPI application directory on port 8000", () => {
    const config = fastapiLaunchConfig("/tmp/fanfic-atlas");

    expect(config.command).toBe("python3");
    expect(config.cwd).toBe("/tmp/fanfic-atlas/fastapi_app");
    expect(config.args).toEqual(["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]);
  });
});
