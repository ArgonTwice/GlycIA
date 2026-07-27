#!/usr/bin/env node
/* Génère standalone.html à partir de index.html + app.js + db.json.
   Aucune dépendance. Lancer : node build.mjs   (ou node build.mjs --check) */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const app  = readFileSync('app.js', 'utf8');
const db   = readFileSync('db.json', 'utf8');

/* 1. Les données sont intégrées au lieu d'être chargées par fetch */
const FETCH = /const DB = await \(await fetch\(new URL\('\.\/db\.json', import\.meta\.url\)\)\)\.json\(\);/;
if (!FETCH.test(app)) { console.error('✗ Le chargement de db.json est introuvable dans app.js'); process.exit(1); }
/* Remplacement par fonction : sinon String.replace interprète les $$ du code comme des échappements */
let inline = app.replace(FETCH, () => `const DB = ${db};`);

/* 2. Pas de Service Worker ni de manifeste externe dans le fichier autonome */
inline = inline.replace(/navigator\.serviceWorker\.register\(new URL\('\.\/sw\.js', import\.meta\.url\)\)\.catch\(\(\) => \{\}\);/,
  "navigator.serviceWorker.register(new URL('./sw.js', location.href)).catch(() => {});");

/* 3. Injection dans la coquille */
const TAG = '<script type="module" src="./app.js"></script>';
if (!html.includes(TAG)) { console.error('✗ La balise script est introuvable dans index.html'); process.exit(1); }
const out = html
  .replace('<link rel="manifest" href="./manifest.webmanifest">\n', '')
  .replace(TAG, () => '<script type="module">\n' + inline + '\n</script>');

if (process.argv.includes('--check')) {
  const cur = existsSync('standalone.html') ? readFileSync('standalone.html', 'utf8') : '';
  if (cur !== out) { console.error('✗ standalone.html est périmé — lance : node build.mjs'); process.exit(1); }
  console.log('✓ standalone.html est à jour');
  process.exit(0);
}

writeFileSync('standalone.html', out);
console.log(`✓ standalone.html régénéré — ${(out.length / 1024).toFixed(0)} Ko`);
