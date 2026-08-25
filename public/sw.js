/**
 * Itqān — the learner's service worker.
 *
 * Deliberately small. It does two things and refuses to be clever about either:
 *
 *   1. Pre-caches the application shell, so a learner who opens the app with no
 *      signal gets the interface rather than a browser error page.
 *   2. Serves navigations network-first, falling back to the cache. Network-first
 *      matters: a cached Today page is a snapshot of a plan that has since moved
 *      on, and showing a stale plan as if it were today's would be a quiet lie.
 *
 * What it does NOT do:
 *   · It never caches a POST, so an attempt is never "sent" by the cache. Attempts
 *     queue in IndexedDB and are replayed by the app with their idempotency keys,
 *     where the server can recognise a replay.
 *   · It never serves stale content silently on a fresh network. A cache hit
 *     after a network failure is the offline path, and the app says so.
 */

const SHELL_CACHE = "itqan-shell-v1";
const PAGE_CACHE = "itqan-pages-v1";

/** The smallest set that makes the app open offline at all. */
const SHELL = ["/today", "/quran", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A shell entry that 404s must not fail the whole install: the worker is
      // still worth having for everything that did cache.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name !== SHELL_CACHE && name !== PAGE_CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GETs are ever cached. A queued attempt is the app's business, not the
  // cache's, and a cached write would be indistinguishable from a real one.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached ?? caches.match("/today"))
            .then((cached) => cached ?? Response.error()),
        ),
    );
    return;
  }

  // Static build output is content-addressed, so a cache hit is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            const copy = response.clone();
            void caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
