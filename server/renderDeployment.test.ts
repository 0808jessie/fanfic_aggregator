import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(process.cwd());

describe("Render FastAPI deployment contract", () => {
  it("defines a free Python web service rooted at fastapi_app", () => {
    const blueprint = fs.readFileSync(path.join(projectRoot, "render.yaml"), "utf8");
    const requirements = fs.readFileSync(path.join(projectRoot, "fastapi_app", "requirements.txt"), "utf8");

    expect(blueprint).toContain("type: web");
    expect(blueprint).toContain("runtime: python");
    expect(blueprint).toContain("plan: free");
    expect(blueprint).toContain("rootDir: fastapi_app");
    expect(blueprint).toContain("buildCommand: pip install -r requirements.txt");
    expect(blueprint).toContain("startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT");
    expect(blueprint).toContain("healthCheckPath: /api/health");
    expect(requirements).toMatch(/^fastapi/m);
    expect(requirements).toMatch(/^uvicorn\[standard\]/m);
    expect(requirements).toMatch(/^beautifulsoup4/m);
    expect(requirements).toMatch(/^curl_cffi/m);
  });

  it("keeps public API CORS configurable for Cloudflare Pages and Workers", () => {
    const main = fs.readFileSync(path.join(projectRoot, "fastapi_app", "main.py"), "utf8");

    expect(main).toContain('os.getenv("CORS_ALLOW_ORIGINS", "*")');
    expect(main).toContain("allow_origins=configured_cors_origins()");
    expect(main).toContain("allow_credentials=False");
  });
});
