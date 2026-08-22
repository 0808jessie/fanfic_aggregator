import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

describe("production FastAPI container contract", () => {
  it("installs Python dependencies and keeps FastAPI on a private loopback port for the Node proxy", () => {
    const dockerfile = fs.readFileSync(path.join(projectRoot, "Dockerfile"), "utf8");

    expect(dockerfile).toContain("FROM node:22-slim");
    expect(dockerfile).toContain("python3 python3-venv ca-certificates");
    expect(dockerfile).toContain("-r fastapi_app/requirements.txt");
    const requirements = fs.readFileSync(path.join(projectRoot, "fastapi_app", "requirements.txt"), "utf8");
    expect(requirements).toMatch(/^httpx>=0\.27,<1$/m);
    expect(dockerfile).toContain('ENV FASTAPI_PYTHON_BIN="/opt/fastapi-venv/bin/python3"');
    expect(dockerfile).toContain('ENV FASTAPI_BASE_URL="http://127.0.0.1:8000"');
    expect(dockerfile).toContain('ENV FASTAPI_PORT="8000"');
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
  });
});
