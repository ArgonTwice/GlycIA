/* GlycIA — Service Worker
   Shell en cache-first, Open Food Facts en stale-while-revalidate,
   API Anthropic jamais mise en cache. */
const C = 'glycia-v1';
const SHELL = ['./', './index.html', './app.js', './db.json', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const u = e.request.url;
  if (e.request.method !== 'GET') return;
  if (u.includes('api.anthropic.com')) return;

  if (u.includes('openfoodfacts.org')) {
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request);
    if (hit) return hit;
    try { const r = await fetch(e.request); c.put(e.request, r.clone()); return r; }
    catch (_) { return hit || Response.error(); }
  }));
});
