/* Charge app.js dans Node pour tester les vraies fonctions, pas des copies.
   app.js est une IIFE qui manipule le DOM dès son évaluation : on lui fournit
   un DOM factice assez permissif pour qu'elle aille au bout, puis on récupère
   ce qu'elle expose via __GLYCIA_TEST__ (inerte dans un navigateur). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/* Un objet qui accepte tout : lecture de n'importe quelle propriété, appel,
   affectation. Suffisant pour que le rendu s'exécute dans le vide. */
function creerFactice(nom = 'el') {
  const cible = function () {};
  cible.nom = nom;
  return new Proxy(cible, {
    get(_, p) {
      if (p === Symbol.toPrimitive || p === 'toString') return () => '';
      if (p === Symbol.iterator) return function* () {};
      if (p === 'length') return 0;
      if (p === 'then') return undefined;              // ne pas passer pour une promesse
      if (p === 'style' || p === 'dataset' || p === 'classList') return creerFactice(p);
      if (p === 'value' || p === 'textContent' || p === 'innerHTML' || p === 'innerText') return '';
      if (p === 'checked' || p === 'hidden') return false;
      return creerFactice(String(p));
    },
    set: () => true,
    apply: () => creerFactice('appel'),
    has: () => true
  });
}

const stockage = new Map();
globalThis.localStorage = {
  getItem: k => (stockage.has(k) ? stockage.get(k) : null),
  setItem: (k, v) => stockage.set(k, String(v)),
  removeItem: k => stockage.delete(k),
  clear: () => stockage.clear()
};

globalThis.document = new Proxy({
  querySelector: () => creerFactice(),
  querySelectorAll: () => [],
  createElement: () => creerFactice(),
  addEventListener: () => {},
  body: creerFactice('body'),
  documentElement: creerFactice('html')
}, { get: (t, p) => (p in t ? t[p] : creerFactice(String(p))) });

globalThis.window = globalThis;
/* navigator est en lecture seule dans Node récent : il faut le redéfinir. */
Object.defineProperty(globalThis, 'navigator', {
  configurable: true, writable: true,
  value: { serviceWorker: { addEventListener() {}, getRegistrations: async () => [] },
           mediaDevices: {}, geolocation: {}, language: 'fr-FR' }
});
globalThis.location = { search: '', pathname: '/', href: 'http://localhost/' };
globalThis.history = { replaceState() {} };
globalThis.addEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
globalThis.requestAnimationFrame = cb => cb(0);
globalThis.caches = { open: async () => ({ match: async () => null, delete: async () => {} }), keys: async () => [] };

/* db.json est le seul fetch fait à l'évaluation ; le reste ne doit pas partir. */
const dbTexte = fs.readFileSync(path.join(ROOT, 'db.json'), 'utf8');
globalThis.fetch = async url => {
  if (String(url).includes('db.json')) return { ok: true, json: async () => JSON.parse(dbTexte) };
  throw new Error('appel réseau inattendu dans les tests : ' + url);
};

/* Les minuteries programmées au démarrage empêcheraient Node de rendre la main. */
const vraiSetTimeout = globalThis.setTimeout, vraiSetInterval = globalThis.setInterval;
globalThis.setTimeout = (fn, d) => { const t = vraiSetTimeout(fn, d); t.unref?.(); return t; };
globalThis.setInterval = (fn, d) => { const t = vraiSetInterval(fn, d); t.unref?.(); return t; };

const api = {};
globalThis.__GLYCIA_TEST__ = api;
await import(pathToFileURL(path.join(ROOT, 'app.js')).href);

if (!Object.keys(api).length) throw new Error("app.js n'a rien exposé : le point d'accroche a disparu ?");
export default api;
