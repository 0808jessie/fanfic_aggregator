import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(import.meta.dirname, "..");

describe("Tauri updater configuration", () => {
  it("contains a public key, a GitHub latest.json endpoint, and signed updater artifacts", () => {
    const config = JSON.parse(fs.readFileSync(path.join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8"));

    expect(config.bundle.createUpdaterArtifacts).toBe(true);
    expect(config.plugins.updater.pubkey).toMatch(/^dW50cnVzdGVk/);
    expect(config.plugins.updater.endpoints).toEqual([
      "https://github.com/0808jessie/fanfic_aggregator/releases/latest/download/latest.json",
    ]);
  });

  it("grants the updater installer and process relaunch capabilities", () => {
    const capabilities = JSON.parse(fs.readFileSync(path.join(projectRoot, "src-tauri", "capabilities", "default.json"), "utf8"));

    expect(capabilities.permissions).toEqual(expect.arrayContaining(["updater:default", "process:default"]));
  });

  it("fails CI clearly when the signing secrets are not available", () => {
    const workflow = fs.readFileSync(path.join(projectRoot, ".github", "workflows", "release.yml"), "utf8");

    expect(workflow).toContain("Verify updater signing material");
    expect(workflow).toContain("TAURI_SIGNING_PRIVATE_KEY");
    expect(workflow).toContain("tauri-apps/tauri-action@v1");
  });
});
