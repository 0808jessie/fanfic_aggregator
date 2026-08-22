const CACHE_NAME = "fanfic-atlas-shell-v6";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/manus-storage/fanfic-atlas-pwa-192_607d6e55.png",
  "/manus-storage/fanfic-atlas-pwa-512_96dc9142.png",
  "/manus-storage/fanfic-atlas-pwa-maskable-512_9f1f7cb4.png",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("fanfic-atlas-shell-") && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const isApiRequest = url.pathname.startsWith("/api/") || url.pathname === "/search" || url.pathname === "/reader";
  if (isApiRequest) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put("/", copy));
          return response;
        })
        .catch(() => caches.match("/")),
    );
    return;
  }

  const isCacheableAsset = url.origin === self.location.origin || request.destination === "font";
  if (!isCacheableAsset) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok || response.type === "opaque") {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
      }
      return response;
    })),
  );
});
