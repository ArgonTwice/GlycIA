#!/usr/bin/env node
/* ==========================================================================
   audit-ciqual.mjs — confronte db.json à la table CIQUAL de l'ANSES
   --------------------------------------------------------------------------
   CIQUAL est la source des glucides et des calories de l'app (c'est aussi
   celle de Gluci-Chek, l'application de Roche). Elle ne contient PAS d'index
   glycémique : l'IG vient des International Tables of Glycemic Index 2021
   et n'est jamais touché ici.

     node tools/audit-ciqual.mjs             # rapport, n'écrit rien
     node tools/audit-ciqual.mjs --apply     # applique les corrections sûres
     node tools/audit-ciqual.mjs --all       # inclut les cas à trancher à la main

   Pourquoi autant de garde-fous : l'appariement par nom se trompe de façon
   spectaculaire si on le laisse faire. Mesuré sur cette base —
     « Blanc d'œuf »          -> « Pain blanc »              (0,88)
     « Cocktail de fruits »   -> « Fruits de mer, mélange »  (0,83)
     « Chewing-gum sans sucre » -> « Chewing-gum, sucré »    (1,00)
   D'où : tous les mots exigés, couverture minimale, état (cru/cuit) et
   négations (sans sucre, allégé) vérifiés, ambiguïtés écartées.
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.ciqual-cache');
const DB = path.join(ROOT, 'db.json');

/* Table Ciqual 2025, dépôt Recherche Data Gouv, doi:10.57745/RDMHWY */
const FICHIERS = { alim: 666252, const: 666246, compo: 666249 };
const URL = id => `https://entrepot.recherche.data.gouv.fr/api/access/datafile/${id}`;
const C_KCAL = '328';      // Energie, Règlement UE N° 1169/2011 (kcal/100 g)
const C_GLUC = '31000';    // Glucides (g/100 g)

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');

/* ---------- récupération, mise en cache ---------- */
async function fichier(nom) {
  const dest = path.join(CACHE, `${nom}.xml`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) return fs.readFileSync(dest, 'utf8');
  fs.mkdirSync(CACHE, { recursive: true });
  process.stderr.write(`téléchargement de ${nom}.xml…\n`);
  const r = await fetch(URL(FICHIERS[nom]));
  if (!r.ok) throw new Error(`CIQUAL ${nom} : HTTP ${r.status}`);
  const txt = await r.text();
  fs.writeFileSync(dest, txt);
  return txt;
}

/* ---------- normalisation ---------- */
const norm = s => String(s).toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\(.*?\)/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ').trim();

const STOP = new Set(['de','du','des','au','aux','les','par','ex','pour','type','sorte',
                      'plat','environ','moyen','moyenne','tous','toutes','autre','autres']);
const toks = s => [...new Set(norm(s).split(' ').filter(w => w.length > 2 && !STOP.has(w)))];

/* Un aliment cru ou déshydraté n'est pas le même que le même aliment prêt à
   manger : le riz passe de 69 g à 21 g de glucides aux 100 g. */
const ETAT_BRUT = /\bcru\b|\bcrue\b|\bcrus\b|\bcrues\b|\bsec\b|\bseche\b|\bsechee\b|\bseches\b|\bsechees\b|deshydrate|en poudre|concentre/;
/* Une négation retournée fausse complètement la valeur */
const NEGATIONS = [/\bsans sucre\b/, /\bsans matiere grasse\b/, /\ballege\b|\ballegee\b/,
                   /\blight\b/, /\bzero\b/, /\bsans gluten\b/, /\bdegraisse\b/];

function compatible(appNom, cqNom) {
  const a = norm(appNom), c = norm(cqNom);
  if (ETAT_BRUT.test(c) && !ETAT_BRUT.test(a)) return 'état (cru/sec) différent';
  if (ETAT_BRUT.test(a) && !ETAT_BRUT.test(c)) return 'état (cru/sec) différent';
  for (const n of NEGATIONS) if (n.test(a) !== n.test(c)) return 'négation différente';
  return null;
}

/* ---------- construction des index ---------- */
const alim = new Map();
for (const m of (await fichier('alim')).matchAll(
  /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<alim_nom_fr>\s*([^<]*?)\s*<\/alim_nom_fr>/g)) alim.set(m[1], m[2]);

const compo = new Map();
for (const m of (await fichier('compo')).matchAll(
  /<alim_code>\s*(\d+)\s*<\/alim_code>\s*<const_code>\s*(\d+)\s*<\/const_code>\s*<teneur>\s*([^<]*?)\s*<\/teneur>/g)) {
  const [, code, cst, raw] = m;
  if (cst !== C_KCAL && cst !== C_GLUC) continue;
  const v = parseFloat(String(raw).replace(',', '.').replace(/[<>]/g, '').trim());
  if (!isFinite(v)) continue;
  const e = compo.get(code) || {};
  if (cst === C_KCAL) e.kcal = v; else e.gluc = v;
  compo.set(code, e);
}

const index = [];
for (const [code, nom] of alim) {
  const c = compo.get(code);
  if (!c || c.gluc === undefined || c.kcal === undefined) continue;
  index.push({ code, nom, t: new Set(toks(nom)), n: toks(nom).length, ...c });
}

/* ---------- appariement ---------- */
const COUVERTURE_MIN = 0.6;   // part du nom CIQUAL expliquée par l'aliment de l'app

function apparier(nom) {
  const a = toks(nom);
  if (a.length < 1) return { skip: 'nom vide' };
  const cands = [];
  for (const e of index) {
    if (!a.every(w => e.t.has(w))) continue;         // tous les mots exigés
    const couverture = a.length / e.n;
    if (couverture < COUVERTURE_MIN) continue;
    cands.push({ ...e, couverture });
  }
  if (!cands.length) return { skip: 'aucun équivalent CIQUAL' };
  cands.sort((x, y) => y.couverture - x.couverture);
  const top = cands[0];
  /* ambiguïté : deux candidats aussi bons mais des glucides très différents */
  const exaequo = cands.filter(c => Math.abs(c.couverture - top.couverture) < 0.01);
  if (exaequo.length > 1) {
    const lo = Math.min(...exaequo.map(c => c.gluc)), hi = Math.max(...exaequo.map(c => c.gluc));
    if (hi - lo > Math.max(2, lo * 0.15)) return { skip: `ambigu (${exaequo.length} entrées, ${lo}–${hi} g)` };
  }
  const inc = compatible(nom, top.nom);
  if (inc) return { skip: inc, top };
  return { top };
}

/* ---------- confrontation ---------- */
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
const SEUIL_REL = 0.15, SEUIL_ABS = 2;   // en deçà, l'écart n'est pas significatif

const corrections = [], aTrancher = [], ignores = new Map();
let total = 0;

for (const bloc of ['FOODDB', 'FOODDB2']) {
  for (const [cat, liste] of Object.entries(db[bloc])) {
    for (const a of liste) {
      total++;
      const [nom, gluc, , kcal] = a;
      const { top, skip } = apparier(nom);
      if (skip) { ignores.set(skip, (ignores.get(skip) || 0) + 1); continue; }
      const dG = Math.abs(gluc - top.gluc), dK = Math.abs(kcal - top.kcal);
      const sigG = dG > SEUIL_ABS && dG / Math.max(1, top.gluc) > SEUIL_REL;
      const sigK = dK > 15 && dK / Math.max(1, top.kcal) > SEUIL_REL;
      if (!sigG && !sigK) continue;
      const ligne = { bloc, cat, nom, ciqual: top.nom, code: top.code,
                      couverture: +top.couverture.toFixed(2),
                      gluc: [gluc, top.gluc], kcal: [kcal, top.kcal], ref: a };
      /* Un écart énorme trahit plus souvent un mauvais appariement qu'une
         mauvaise valeur : on ne l'applique pas sans relecture humaine. */
      (dG / Math.max(1, top.gluc) > 1.5 ? aTrancher : corrections).push(ligne);
    }
  }
}

/* ---------- sortie ---------- */
console.log(`CIQUAL 2025 : ${alim.size} aliments, ${index.length} exploitables`);
console.log(`db.json     : ${total} aliments\n`);
console.log(`écartés :`);
[...ignores].sort((a, b) => b[1] - a[1]).forEach(([r, n]) => console.log(`   ${String(n).padStart(4)}  ${r}`));

const fmt = l => `  ${l.nom}\n      CIQUAL « ${l.ciqual} » (${l.code}, couverture ${l.couverture})\n`
  + `      glucides ${l.gluc[0]} → ${l.gluc[1]}   |   kcal ${l.kcal[0]} → ${l.kcal[1]}`;

console.log(`\n${corrections.length} correction(s) sûre(s) :\n`);
corrections.forEach(l => console.log(fmt(l)));
if (ALL || !APPLY) {
  console.log(`\n${aTrancher.length} cas à trancher à la main (écart > 150 %, appariement suspect) :\n`);
  aTrancher.forEach(l => console.log(fmt(l)));
}

if (APPLY) {
  /* --all applique aussi la liste à trancher : à ne faire qu'après l'avoir lue. */
  const aEcrire = ALL ? corrections.concat(aTrancher) : corrections;
  for (const l of aEcrire) { l.ref[1] = l.gluc[1]; l.ref[3] = Math.round(l.kcal[1]); }
  /* db.json est minifié sur une seule ligne : on ne change pas ce format,
     le reformater ferait passer le fichier de 1 à 11 643 lignes. */
  fs.writeFileSync(DB, JSON.stringify(db));
  const j = aEcrire.map(l => ({ aliment: l.nom, categorie: l.cat, ciqual: l.ciqual,
                                alim_code: l.code, glucides: l.gluc, kcal: l.kcal }));
  fs.writeFileSync(path.join(ROOT, 'tools', 'ciqual-corrections.json'), JSON.stringify(j, null, 1) + '\n');
  console.log(`\n✓ ${aEcrire.length} valeurs alignées sur CIQUAL 2025, db.json réécrit`);
  console.log(`✓ journal des changements : tools/ciqual-corrections.json`);
} else {
  console.log(`\n(rapport seul — relancer avec --apply pour écrire, --apply --all pour inclure les cas relus)`);
}
