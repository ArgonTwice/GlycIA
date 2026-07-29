#!/usr/bin/env node
/* ==========================================================================
   export-ciqual.mjs — genere ciqual.json, la base etendue
   --------------------------------------------------------------------------
   db.json reste le noyau : aliments choisis, portions realistes, IG source.
   ciqual.json ajoute les 3 000 aliments restants de la table de l'ANSES.
   Il n'est PAS charge au demarrage : l'app va le chercher seulement quand une
   recherche depasse le noyau. Le budget Lighthouse est a 400 Ko de poids
   total et le noyau y est deja presque.

   Deux reserves assumees, ecrites dans le fichier lui-meme :
   - l'IG n'est pas dans Ciqual, et n'est plus devine : la fiche affiche un tiret ;
   - les portions ne sont pas dans Ciqual non plus, tout est ramene a 100 g.

     node tools/export-ciqual.mjs
   ========================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.ciqual-cache');
const C_KCAL = '328', C_GLUC = '31000', C_LIP = '40000';

if (!fs.existsSync(path.join(CACHE, 'alim.xml'))) {
  console.error('✗ Cache Ciqual absent. Lance d’abord : node tools/audit-ciqual.mjs');
  process.exit(1);
}

const lire = f => fs.readFileSync(path.join(CACHE, f), 'utf8');

/* Ciqual est un export XML : les apostrophes y sont écrites &apos;, les
   guillemets &quot;, et les intervalles < et > des traces. Sans décodage, le
   nom traverse toute la chaîne tel quel jusqu'à esc() côté app, qui rééchappe
   le & — et l'utilisateur lit « Quinoa, bouilli/cuit à l&apos;eau ».
   &amp; se décode en dernier, sinon &amp;lt; donnerait « < » au lieu de « &lt; ». */
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

const alim = new Map();
for (const m of lire('alim.xml').matchAll(
  /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<alim_nom_fr>\s*([^<]*?)\s*<\/alim_nom_fr>/g)) alim.set(m[1], detexte(m[2]));

const compo = new Map();
for (const m of lire('compo.xml').matchAll(
  /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>\s*([^<]*?)\s*<\/teneur>/g)) {
  const [, code, cst, raw] = m;
  if (cst !== C_KCAL && cst !== C_GLUC && cst !== C_LIP) continue;
  const v = parseFloat(String(raw).replace(',', '.').replace(/[<>]/g, '').trim());
  if (!isFinite(v)) continue;
  const e = compo.get(code) || {};
  if (cst === C_KCAL) e.kcal = v; else if (cst === C_GLUC) e.gluc = v; else e.lip = v;
  compo.set(code, e);
}

/* Le noyau garde la main : un aliment deja dans db.json n'est pas redouble. */
const norm = s => String(s).toLowerCase().replace(/œ/g, 'oe')
  .normalize('NFD').replace(/[̀-ͯ]/g, '');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'db.json'), 'utf8'));
const noyau = new Set();
for (const b of ['FOODDB', 'FOODDB2'])
  for (const l of Object.values(db[b])) for (const a of l) noyau.add(norm(a[0]));

const arrondi = (v, d = 1) => { const p = 10 ** d; return Math.round(v * p) / p; };
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

const sortie = [];
let sansValeurs = 0, doublons = 0;
for (const [code, nom] of [...alim].sort((a, b) => a[1].localeCompare(b[1], 'fr'))) {
  const c = compo.get(code);
  if (!c || c.gluc === undefined || c.kcal === undefined) { sansValeurs++; continue; }
  if (noyau.has(norm(nom))) { doublons++; continue; }
  sortie.push([
    nom.slice(0, 70),
    borne(arrondi(c.gluc), 0, 100),
    borne(Math.round(c.kcal), 0, 900),
    c.lip === undefined ? null : borne(arrondi(c.lip), 0, 100),
    +code
  ]);
}

const fichier = {
  _source: 'Table Ciqual 2025, ANSES — doi:10.57745/RDMHWY',
  _format: '[nom, glucides/100g, kcal/100g, lipides/100g|null, code Ciqual]',
  _reserves: [
    "L'index glycemique n'est pas publie par Ciqual : la fiche affiche un tiret.",
    'Les portions non plus : tout est ramene a 100 g.',
    'Beaucoup d\'entrees decrivent l\'aliment cru — le nom le precise.'
  ],
  _genere: new Date().toISOString().slice(0, 10),
  aliments: sortie
};

const dest = path.join(ROOT, 'ciqual.json');
fs.writeFileSync(dest, JSON.stringify(fichier));
console.log(`Ciqual 2025   : ${alim.size} aliments`);
console.log(`  ecartes     : ${sansValeurs} sans glucides ou calories, ${doublons} deja dans db.json`);
console.log(`✓ ciqual.json : ${sortie.length} aliments, ${(fs.statSync(dest).size / 1024).toFixed(0)} Ko`);
