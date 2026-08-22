export const PWA_UPDATE_READY_EVENT = "fanfic-atlas:pwa-update-ready";

export type PwaUpdateRegistration = Pick<ServiceWorkerRegistration, "waiting">;

function announceUpdate(registration: PwaUpdateRegistration) {
  window.dispatchEvent(new CustomEvent<PwaUpdateRegistration>(PWA_UPDATE_READY_EVENT, { detail: registration }));
}

/** Register the application shell and announce only waiting replacements. */
export async function registerPwaUpdateListener(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.register("/sw.js");
  const inspect = () => {
    if (registration.waiting && navigator.serviceWorker.controller) announceUpdate(registration);
  };
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") inspect();
    });
  });
  inspect();
}

/** Ask the waiting worker to activate, then reload exactly once on controller change. */
export function applyPwaUpdate(registration: PwaUpdateRegistration, reload = () => window.location.reload()): boolean {
  const waitingWorker = registration.waiting;
  if (!waitingWorker || !("serviceWorker" in navigator)) return false;
  let reloaded = false;
  const handleControllerChange = () => {
    if (reloaded) return;
    reloaded = true;
    navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange, { once: true });
  waitingWorker.postMessage({ type: "SKIP_WAITING" });
  return true;
}
