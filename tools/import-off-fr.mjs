#!/usr/bin/env node
/* ==========================================================================
   import-off-fr.mjs — extrait les produits francais d'Open Food Facts
   --------------------------------------------------------------------------
   L'export complet fait 1,2 Go compresse, 12 Go decompresse. Le gros du
   filtrage est fait par awk, qui travaille a memoire constante : deux
   tentatives ou Node lisait le flux entier sont mortes en saturant le tas,
   la seconde apres 4,2 millions de lignes. Node ne voit donc plus que les
   lignes deja retenues.

     curl -sL https://static.openfoodfacts.org/data/fr.openfoodfacts.org.products.csv.gz \
       | gzip -dc \
       | awk -F'\t' 'NR>1 && tolower($41) ~ /france/ && $76+0 >= 1 && $130 != "" && $90 != "" \
           { print $1 "\t" $11 "\t" $19 "\t" $76 "\t" $90 "\t" $93 "\t" $130 }' \
       | node tools/import-off-fr.mjs --max=50000

   Colonnes en entree (1-indexees, telles que produites par l'awk ci-dessus) :
     1 code   2 nom   3 marques   4 scans   5 kcal   6 lipides   7 glucides

   Le classement se fait sur le nombre de scans reels : une base de produits
   que les gens achetent vaut mieux qu'un echantillon pris au hasard.

   Licence : Open Food Facts est sous ODbL. Attribution et partage a
   l'identique — voir la section Donnees du README.
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX = +(process.argv.find(a => /^--max=/.test(a)) || '').split('=')[1] || 50000;

const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const nombre = v => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : null; };

/* Des saisies d'Open Food Facts arrivent avec des entités HTML dans le nom.
   Sans décodage, esc() rééchappe le & côté app et l'utilisateur lit
   « Pommes de terre &quot;grenaille&quot; ». &amp; en dernier, sinon
   &amp;lt; donnerait « < » au lieu de « &lt; ». */
const ENTITES = { apos: '\'', quot: '"', lt: '<', gt: '>', nbsp: ' ' };
const unPassage = s => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(apos|quot|lt|gt|nbsp);/g, (_, e) => ENTITES[e])
  .replace(/&amp;/g, '&');

/* Certaines saisies sont encodees deux fois : « Pik&amp;amp;croq » veut dire
   « Pik&croq ». On repasse donc jusqu'a stabilite, mais au plus trois fois —
   sans borne, un nom contenant vraiment « &amp; » comme texte se ferait
   deshabiller a l'infini. */
function detexte(s) {
  let v = String(s);
  for (let i = 0; i < 3; i++) {
    const w = unPassage(v);
    if (w === v) break;
    v = w;
  }
  return v;
}
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

/* Le noyau et Ciqual gardent la main : pas de doublon. */
const deja = new Set();
for (const f of ['db.json', 'ciqual.json']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (d.aliments) d.aliments.forEach(a => deja.add(norm(a[0])));
  else for (const b of ['FOODDB', 'FOODDB2'])
    for (const l of Object.values(d[b])) for (const a of l) deja.add(norm(a[0]));
}

/* Borne dure : on ne garde jamais plus que le necessaire en memoire. */
const PLAFOND = Math.ceil(MAX * 1.4);
let garde = [];
function elaguer() { garde.sort((a, b) => b[5] - a[5]); garde.length = Math.min(garde.length, MAX); }

let lues = 0, sansNom = 0, horsBornes = 0, doublons = 0;
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const ligne of rl) {
  if (++lues % 100000 === 0) process.stderr.write(`\r${(lues / 1000).toFixed(0)}k lignes retenues par awk, ${garde.length} gardees`);
  const c = ligne.split('\t');
  if (c.length < 7) continue;

  /* Les saisies d'Open Food Facts commencent parfois par une virgule ou un
     point : on retire la ponctuation de tete, et on exige au moins une lettre. */
  const nom = detexte(c[1] || '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s{2,}/g, ' ').trim();
  if (!nom || nom.length < 2 || nom.length > 70 || !/\p{L}/u.test(nom)) { sansNom++; continue; }
  const gluc = nombre(c[6]), kcal = nombre(c[4]);
  if (gluc === null || kcal === null || gluc < 0 || gluc > 100 || kcal < 0 || kcal > 900) { horsBornes++; continue; }

  const cle = norm(nom);
  if (deja.has(cle)) { doublons++; continue; }
  deja.add(cle);

  const marque = (c[2] || '').split(',')[0].trim();
  const complet = marque && !cle.includes(norm(marque)) ? `${nom} — ${marque}`.slice(0, 70) : nom;
  const lip = nombre(c[5]);
  garde.push([complet, Math.round(gluc * 10) / 10, Math.round(kcal),
              lip === null ? null : borne(Math.round(lip * 10) / 10, 0, 100),
              c[0] || '', +c[3] || 0]);
  if (garde.length > PLAFOND) elaguer();
}
process.stderr.write('\r' + ' '.repeat(72) + '\r');

elaguer();
deja.clear();
const sortie = garde.slice(0, MAX).map(a => a.slice(0, 5));
/* Un collateur reutilise plutot que localeCompare par comparaison */
const col = new Intl.Collator('fr');
sortie.sort((a, b) => col.compare(a[0], b[0]));

const fichier = {
  _source: 'Open Food Facts, export France — licence ODbL',
  _attribution: 'https://world.openfoodfacts.org/ — Open Database License (ODbL)',
  _format: '[nom, glucides/100g, kcal/100g, lipides/100g|null, code-barres]',
  _reserves: [
    'Valeurs declarees par les fabricants, saisies par les contributeurs.',
    "L'index glycemique n'y figure pas : la fiche affiche un tiret plutot qu'un chiffre inventé.",
    'Ne sont gardes que les produits scannes au moins une fois, les plus courants d\'abord.'
  ],
  _genere: new Date().toISOString().slice(0, 10),
  aliments: sortie
};

const dest = path.join(ROOT, 'off-fr.json');
fs.writeFileSync(dest, JSON.stringify(fichier));
console.log(`lignes recues d'awk : ${lues.toLocaleString('fr-FR')}`);
console.log(`  nom inexploitable : ${sansNom.toLocaleString('fr-FR')}`);
console.log(`  valeurs hors bornes : ${horsBornes.toLocaleString('fr-FR')}`);
console.log(`  doublons ecartes  : ${doublons.toLocaleString('fr-FR')}`);
console.log(`✓ off-fr.json : ${sortie.length.toLocaleString('fr-FR')} produits, ${(fs.statSync(dest).size / 1048576).toFixed(1)} Mo`);
