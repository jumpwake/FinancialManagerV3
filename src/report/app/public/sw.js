/* Portfolio Analyzer — minimal service worker.
 *
 * Strategy (runtime caching, no precaching):
 *   - /api/*, /login, /logout, /signin-google, /dev-login → network only
 *     (auth + live data must never be served stale).
 *   - HTML navigations → network-first, fall back to cached index for offline.
 *   - Hashed static assets (/assets/...) and PWA assets (/icons/...,
 *     manifest.json) → cache-first; SWR-ish in that the cache is populated
 *     on first successful network response.
 *
 * Cache version is bumped any time this file is modified so old caches get
 * cleared on activate.
 */
const CACHE_VERSION = "v1";
const CACHE_NAME = `pa-${CACHE_VERSION}`;

self.addEventListener("install", (event) => {
  // Activate immediately on first install; no precache.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

function isNetworkOnly(url) {
  // Match under both dev base "/" and prod base "/finance/".
  return (
    url.pathname.includes("/api/") ||
    url.pathname.endsWith("/login") ||
    url.pathname.endsWith("/logout") ||
    url.pathname.endsWith("/signin-google") ||
    url.pathname.endsWith("/dev-login")
  );
}

function isCacheable(url) {
  return (
    url.pathname.includes("/assets/") ||
    url.pathname.includes("/icons/") ||
    url.pathname.endsWith("/manifest.json")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isNetworkOnly(url)) {
    return; // let the browser handle it normally
  }

  // Navigation requests → network-first, fall back to cached index.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cache = await caches.open(CACHE_NAME);
          const cached = await cache.match(req);
          if (cached) return cached;
          // Fall back to any cached navigation we have.
          const fallback = await cache.match("/") || await cache.match("/finance/");
          if (fallback) return fallback;
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Static assets → cache-first.
  if (isCacheable(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          if (fresh.ok) cache.put(req, fresh.clone());
          return fresh;
        } catch {
          return new Response("Offline", { status: 503, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Default: pass through.
});
