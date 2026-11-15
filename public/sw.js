// Offline support: the app shell and hashed assets are cached as they are used;
// the last 5 topics opened stay available offline. Everything degrades to the
// network when the cache or the service worker is unavailable.
const SHELL = 'zero-lab-shell-v1';
const TOPICS = 'zero-lab-topics-v1';
const KEEP_TOPICS = 5;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== TOPICS).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTopics(cache) {
  const keys = (await cache.keys()).filter((r) => /\/content\/(physics|moon)\//.test(r.url));
  for (const old of keys.slice(0, Math.max(0, keys.length - KEEP_TOPICS))) await cache.delete(old);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/demo/')) return;
  const isTopic = /^\/content\/(physics|moon)\//.test(url.pathname);
  const isData = isTopic || url.pathname.startsWith('/practicals/') || url.pathname.startsWith('/img/') || url.pathname.startsWith('/vo/');
  if (url.pathname.startsWith('/assets/')) {
    // hashed files never change: cache first
    e.respondWith(caches.open(SHELL).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  // everything else: network first, cache as the offline fallback
  e.respondWith((async () => {
    const cache = await caches.open(isData ? TOPICS : SHELL);
    try {
      const r = await fetch(req);
      if (r.ok) {
        if (isTopic) { await cache.delete(req); } // re-insert so the newest topic is last
        await cache.put(req, r.clone());
        if (isTopic) await trimTopics(cache);
      }
      return r;
    } catch {
      return (await cache.match(req)) ?? (req.mode === 'navigate' ? (await caches.open(SHELL)).match('/') : Response.error());
    }
  })());
});
