#!/usr/bin/env node
/* ==========================================================================
   audit-etiquettes.mjs — retrouve la source des aliments absents de Ciqual
   --------------------------------------------------------------------------
   Ciqual couvre les aliments generiques. Les produits de marque et les plats
   de chaine n'y sont pas : leur seule source legitime est la declaration
   nutritionnelle du fabricant, obligatoire sous le reglement UE 1169/2011.
   Open Food Facts la porte, avec le code-barres qui permet de la verifier.

     node tools/audit-etiquettes.mjs            # rapport, n'ecrit rien
     node tools/audit-etiquettes.mjs --apply    # ecrit le code-barres (9e champ)

   Meme prudence que pour Ciqual, pour la meme raison : sur 4 millions de
   produits, un appariement par nom trouve toujours quelque chose. On exige
   donc que tous les mots du nom soient presents, que le produit soit vendu
   en France, que les valeurs concordent a 25 % pres avec celles deja en base,
   et on refuse des que deux candidats plausibles se contredisent.

   Un aliment non apparie n'est PAS invente : il reste marque non verifie
   dans l'app, et la fiche invite a scanner le paquet.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB = path.join(ROOT, 'db.json');
const APPLY = process.argv.includes('--apply');
const LIMITE = +(process.argv.find(a => /^--max=/.test(a)) || '').split('=')[1] || Infinity;

const UA = 'GlycIA/1.0 (https://github.com/ArgonTwice/GlycIA)';
const CHAMPS = 'code,product_name_fr,product_name,brands,countries_tags,nutriments';

const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['de', 'du', 'des', 'au', 'aux', 'les', 'sans', 'avec', 'maison', 'nature']);
const toks = s => [...new Set(norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)))];

/* Un qualificatif present d'un cote et pas de l'autre change le produit. */
const QUALIFICATIFS = [/\bsans gluten\b/, /\bsans sucre\b/, /\bsans lactose\b/, /\bbio\b/,
                       /\ballege\b|\bleger\b|\blight\b/, /\bvegan\b|\bvegetal\b/,
                       /\bsurgele\b/, /\bnoel\b/, /\bhalal\b/, /\bfumé\b|\bfume\b/];

const dormir = ms => new Promise(r => setTimeout(r, ms));

async function chercher(nom) {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(nom)}`
    + `&page_size=25&fields=${CHAMPS}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const d = await r.json();
  return d.hits || [];
}

/* Un candidat n'est retenu que s'il coche tout. */
function retenir(aliment, hits) {
  const [nom, gluc, , kcal] = aliment;
  const mots = toks(nom);
  if (mots.length < 1) return { skip: 'nom trop court' };

  const bons = [];
  for (const h of hits) {
    const titre = h.product_name_fr || h.product_name || '';
    if (!titre) continue;
    const t = toks(titre);
    if (!mots.every(w => t.includes(w))) continue;                  // tous les mots exiges
    /* Le produit ne doit pas etre autre chose que l'aliment cherche. Sans
       cette regle, "Pizza margherita" s'apparie a "Pizza Margherita sans
       gluten" et "Club sandwich" a un sandwich de Noel Sainsbury's : un
       code-barres plausible colle sur une entree generique, ce qui ressemble
       a une source sans en etre une. */
    if (mots.length / t.length < 0.6) continue;
    if (QUALIFICATIFS.some(q => q.test(norm(titre)) !== q.test(norm(nom)))) continue;
    const pays = h.countries_tags || [];
    if (pays.length && !pays.some(p => /france/.test(p))) continue;  // vendu en France
    const nu = h.nutriments || {};
    const c = +nu.carbohydrates_100g, k = +nu['energy-kcal_100g'];
    if (!isFinite(c) || !isFinite(k)) continue;
    /* La valeur declaree doit confirmer celle en base, pas la remplacer en
       silence : un ecart fort signale un mauvais appariement. */
    const ecartC = Math.abs(c - gluc) / Math.max(3, gluc);
    const ecartK = Math.abs(k - kcal) / Math.max(30, kcal);
    if (ecartC > 0.25 || ecartK > 0.25) continue;
    bons.push({ code: h.code, titre, c, k });
  }
  if (!bons.length) return { skip: 'aucun produit concordant' };

  /* Deux candidats qui se contredisent : on ne tranche pas a la place du fabricant. */
  const lo = Math.min(...bons.map(b => b.c)), hi = Math.max(...bons.map(b => b.c));
  if (hi - lo > Math.max(2, lo * 0.15)) return { skip: `candidats contradictoires (${lo}–${hi} g)` };
  return { top: bons[0], n: bons.length };
}

const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const aTracer = [];
for (const bloc of ['FOODDB', 'FOODDB2'])
  for (const [cat, liste] of Object.entries(db[bloc]))
    for (const a of liste) if (a[7] == null && a[8] == null) aTracer.push({ cat, a });

console.log(`${aTracer.length} aliments sans source Ciqual ni code-barres\n`);

const trouves = [], ignores = new Map();
let fait = 0;
for (const { cat, a } of aTracer.slice(0, LIMITE)) {
  fait++;
  process.stderr.write(`\r${fait}/${Math.min(aTracer.length, LIMITE)}  ${a[0].slice(0, 40).padEnd(40)}`);
  let hits = [];
  try { hits = await chercher(a[0]); }
  catch (e) { ignores.set('recherche en echec', (ignores.get('recherche en echec') || 0) + 1); await dormir(1200); continue; }
  const { top, skip, n } = retenir(a, hits);
  if (skip) { ignores.set(skip.replace(/\(.*\)/, '(…)'), (ignores.get(skip.replace(/\(.*\)/, '(…)')) || 0) + 1); }
  else trouves.push({ cat, ref: a, nom: a[0], code: top.code, titre: top.titre, c: top.c, k: top.k, n });
  await dormir(700);                                   // on ne martele pas le service
}
process.stderr.write('\r' + ' '.repeat(70) + '\r');

console.log(`${trouves.length} aliment(s) tracés jusqu'à une étiquette :\n`);
for (const t of trouves) {
  console.log(`  ${t.nom}`);
  console.log(`      « ${t.titre} » code ${t.code} (${t.n} produit${t.n > 1 ? 's' : ''} concordant${t.n > 1 ? 's' : ''})`);
  console.log(`      base ${t.ref[1]} g / ${t.ref[3]} kcal   étiquette ${t.c} g / ${t.k} kcal`);
}
console.log('\nnon tracés :');
[...ignores].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`   ${String(n).padStart(4)}  ${r}`));

if (APPLY && trouves.length) {
  for (const t of trouves) { while (t.ref.length < 8) t.ref.push(null); t.ref[8] = t.code; }
  fs.writeFileSync(DB, JSON.stringify(db));
  fs.writeFileSync(path.join(ROOT, 'tools', 'etiquettes-tracees.json'),
    JSON.stringify(trouves.map(t => ({ aliment: t.nom, produit: t.titre, code: t.code,
                                       glucides_base: t.ref[1], glucides_etiquette: t.c })), null, 1) + '\n');
  console.log(`\n✓ ${trouves.length} codes-barres écrits, journal : tools/etiquettes-tracees.json`);
} else if (!APPLY) {
  console.log('\n(rapport seul — relancer avec --apply pour écrire)');
}
