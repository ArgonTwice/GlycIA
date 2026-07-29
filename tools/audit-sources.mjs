#!/usr/bin/env node
/* ==========================================================================
   audit-sources.mjs — inventaire et controle des references de l'app
   --------------------------------------------------------------------------
   L'app affiche des chiffres qu'elle attribue a des publications. Une
   attribution fausse est pire qu'une absence de source : elle donne l'air du
   verifiable a ce qui ne l'est pas. Le cas s'est produit — le seuil des
   sucres libres etait attribue a la recommandation OMS de 2023, qui ne le
   contient pas ; il vient de celle de 2015.

   Ce que l'outil verifie :
   - toute reference declaree est complete (auteurs, titre, revue, annee, DOI)
   - toute valeur qui cite une reference cite une reference qui existe
   - aucune reference declaree ne dort sans etre citee
   - l'etat de recoupement des index glycemiques

   Ce qu'il ne verifie PAS : que la publication dit bien ce qu'on lui fait
   dire. Ca, ca se lit. L'outil rappelle seulement ou en est ce travail.

     node tools/audit-sources.mjs
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'db.json'), 'utf8'));

const CHAMPS = ['t', 'a', 'j', 'y', 'doi'];
const soucis = [];

/* ---------- Index glycemique ---------- */
const igSrc = db.IG_SRC.src, igVals = db.IG_SRC.v;
const igCites = new Set(igVals.map(v => v[2]));

Object.entries(igSrc).forEach(([id, c]) => {
  CHAMPS.forEach(ch => { if (!c[ch]) soucis.push(`IG_SRC « ${id} » : champ ${ch} manquant`); });
  if (!igCites.has(id)) soucis.push(`IG_SRC « ${id} » n'est citee par aucune valeur`);
});
igVals.forEach(([nom, ig, src]) => {
  if (!igSrc[src]) soucis.push(`IG de « ${nom} » cite « ${src} », introuvable`);
  if (!(ig > 0 && ig <= 110)) soucis.push(`IG de « ${nom} » hors bornes : ${ig}`);
});

const recoupes = igVals.filter(v => v[4] === 'x');

/* ---------- Gastroparesie ---------- */
const gpSrc = db.GP_SRC, meca = db.GP_MECA;
const gpCites = new Set();
Object.values(meca).forEach(m => (m.s || []).forEach(id => gpCites.add(id)));

Object.entries(gpSrc).forEach(([id, c]) => {
  CHAMPS.forEach(ch => { if (!c[ch]) soucis.push(`GP_SRC « ${id} » : champ ${ch} manquant`); });
  if (!gpCites.has(id)) soucis.push(`GP_SRC « ${id} » n'est citee par aucun mecanisme`);
});
Object.entries(meca).forEach(([id, m]) => {
  if (!m.t) soucis.push(`mecanisme « ${id} » sans titre`);
  (m.s || []).forEach(s => { if (!gpSrc[s]) soucis.push(`mecanisme « ${id} » cite « ${s} », introuvable`); });
});

const mecaSources = Object.entries(meca).filter(([, m]) => m.s && m.s.length);
const mecaSans = Object.entries(meca).filter(([, m]) => !m.s || !m.s.length).map(([id]) => id);

/* ---------- Rapport ---------- */
console.log('Références déclarées');
[['IG_SRC', igSrc], ['GP_SRC', gpSrc]].forEach(([nom, tbl]) => {
  Object.entries(tbl).forEach(([id, c]) =>
    console.log(`  ${nom}/${id.padEnd(11)} ${c.a.split(',')[0]} et al., ${c.j}, ${c.y}\n${' '.repeat(22)}doi:${c.doi}`));
});

console.log(`\nIndex glycémique : ${igVals.length} valeurs, ${Object.keys(igSrc).length} référence(s).`);
console.log(`  transcription recoupée : ${recoupes.length}/${igVals.length}`
  + (recoupes.length < igVals.length ? ` — reste ${igVals.length - recoupes.length} à confronter` : ''));
console.log(`  recoupées : ${recoupes.map(v => v[0]).join(', ') || 'aucune'}`);

console.log(`\nGastroparésie : ${Object.keys(meca).length} mécanismes, ${Object.keys(gpSrc).length} références.`);
console.log(`  avec source : ${mecaSources.length}`);
console.log(`  sans source, assumé : ${mecaSans.join(', ')}`);

if (soucis.length) {
  console.log(`\n${soucis.length} problème(s) :`);
  soucis.forEach(s => console.log('  ✗ ' + s));
} else {
  console.log('\n✓ Toute référence citée existe, est complète, et sert à quelque chose.');
}

process.exit(soucis.length ? 1 : 0);
