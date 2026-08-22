import { describe, expect, it, vi } from "vitest";
import { applyPwaUpdate } from "./pwaUpdate";

describe("PWA update controls", () => {
  it("asks the waiting worker to skip waiting then reloads on controller change", () => {
    const postMessage = vi.fn();
    const listener = new EventTarget();
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: listener });
    const reload = vi.fn();

    expect(applyPwaUpdate({ waiting: { postMessage } } as never, reload)).toBe(true);
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    listener.dispatchEvent(new Event("controllerchange"));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload when no waiting worker exists", () => {
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: new EventTarget() });
    expect(applyPwaUpdate({ waiting: null })).toBe(false);
  });
});
