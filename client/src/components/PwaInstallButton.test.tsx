import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PwaInstallButton } from "./PwaInstallButton";

afterEach(() => cleanup());

describe("PwaInstallButton", () => {
  it("exposes the browser install action after beforeinstallprompt and forwards the native prompt", async () => {
    render(<PwaInstallButton />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" as const }),
    });
    window.dispatchEvent(installEvent);

    const button = await screen.findByRole("button", { name: "安裝 Fanfic Atlas 應用程式" });
    fireEvent.click(button);
    expect(prompt).toHaveBeenCalledTimes(1);
  });
});
