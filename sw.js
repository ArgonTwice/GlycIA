/* GlycIA — Service Worker
   Shell en stale-while-revalidate, Open Food Facts pareil,
   API Anthropic jamais mise en cache.

   Le shell était en cache-first sur un cache nommé 'glycia-v1', jamais
   renommé. Conséquence : une fois l'app installée, aucune mise à jour ne
   parvenait jamais à l'utilisateur — ni corps de l'app, ni db.json. Des
   valeurs d'aliments corrigées restaient invisibles indéfiniment.

   Le shell est donc servi depuis le cache pour rester instantané et
   utilisable hors ligne, mais toujours re-téléchargé en arrière-plan : le
   chargement suivant a la version à jour. Un rechargement de retard au
   lieu d'aucune mise à jour. */
const C = 'glycia-v2';
const SHELL = ['./', './index.html', './app.js', './db.json', './icon.svg', './manifest.webmanifest'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* Partage depuis la galerie : pas de serveur, la photo transite par le Cache Storage
   et l'appli la relit au chargement suivant (voir checkSharedPhoto() dans app.js). */
async function handleShareTarget(req) {
  try {
    const fd = await req.formData();
    const file = fd.get('photo');
    const c = await caches.open(C);
    if (file && file.size) await c.put('./shared-photo', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg' } }));
  } catch (_) {}
  return Response.redirect('./?partage=1', 303);
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.pathname.endsWith('/share-target')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;
  if (u.href.includes('api.anthropic.com')) return;

  if (u.href.includes('openfoodfacts.org')) {
    e.respondWith(caches.open(C).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  /* Shell : on rend le cache tout de suite, et on rafraîchit derrière.
     `cache: 'reload'` contourne le cache HTTP du navigateur, sinon celui-ci
     peut resservir un fichier périmé au Service Worker lui-même. */
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request);
    const reseau = fetch(new Request(e.request, { cache: 'reload' }))
      .then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; })
      .catch(() => hit);
    if (hit) { e.waitUntil(reseau); return hit; }
    return (await reseau) || Response.error();
  }));
});

/* Rappels de repas : clic sur un favori en action rapide -> ajoute au journal
   dans un onglet déjà ouvert (message) ou en ouvre un (paramètre d'URL). */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const idx = e.action || '';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if ('focus' in c) { c.postMessage({ type: 'glycia-addfav', index: idx }); return c.focus(); }
    }
    return self.clients.openWindow(idx ? `./index.html?addfav=${encodeURIComponent(idx)}` : './index.html');
  }));
});
