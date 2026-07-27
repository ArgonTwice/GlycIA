#!/usr/bin/env node
/**
 * Génère db.<lang>.json à partir de db.json, par lots, via l'API Anthropic.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node i18n/translate.mjs en
 *
 * Seuls les libellés sont traduits. Les nombres — glucides, IG, kcal, poids —
 * ne sont jamais touchés : ils sont réinjectés depuis la source après coup.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const lang = process.argv[2] || 'en';
const KEY = process.env.ANTHROPIC_API_KEY;
if (!KEY) { console.error('✗ ANTHROPIC_API_KEY manquante'); process.exit(1); }

const LANGS = { en: 'anglais', es: 'espagnol', de: 'allemand', it: 'italien', pt: 'portugais' };
const target = LANGS[lang] || lang;
const db = JSON.parse(readFileSync('db.json', 'utf8'));
const BATCH = 60;

async function ask(prompt) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, messages: [{ role: 'user', content: prompt }] })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + await r.text());
  const d = await r.json();
  const t = d.content.filter(c => c.type === 'text').map(c => c.text).join('').replace(/```json|```/g, '').trim();
  return JSON.parse(t.slice(t.indexOf('['), t.lastIndexOf(']') + 1));
}

/** Traduit une liste de chaînes en préservant l'ordre et la longueur. */
async function tr(items, kind) {
  const out = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const chunk = items.slice(i, i + BATCH);
    process.stdout.write(`\r${kind} ${Math.min(i + BATCH, items.length)}/${items.length}   `);
    const res = await ask(
`Traduis en ${target} ces ${kind} du domaine alimentaire, pour une application de suivi du diabète.
Réponds UNIQUEMENT par un tableau JSON de ${chunk.length} chaînes, dans le même ordre, sans texte autour.
Garde les noms de marques et d'enseignes tels quels. Adapte les plats sans équivalent par une description courte.

${JSON.stringify(chunk, null, 0)}`);
    if (res.length !== chunk.length) throw new Error(`Lot désaligné : ${res.length} au lieu de ${chunk.length}`);
    out.push(...res);
  }
  console.log();
  return out;
}

const out = structuredClone(db);

for (const key of ['FOODDB', 'FOODDB2']) {
  const cats = Object.keys(db[key]);
  const names = cats.flatMap(c => db[key][c].map(a => a[0]));
  const units = [...new Set(cats.flatMap(c => db[key][c].map(a => a[5])))];

  const tNames = await tr(names, `noms ${key}`);
  const tUnits = await tr(units, `portions ${key}`);
  const uMap = Object.fromEntries(units.map((u, i) => [u, tUnits[i]]));
  const tCats = await tr(cats, `catégories ${key}`);

  let k = 0;
  const fresh = {};
  cats.forEach((c, ci) => {
    fresh[tCats[ci]] = db[key][c].map(a => [tNames[k++], a[1], a[2], a[3], a[4], uMap[a[5]] || a[5]]);
  });
  out[key] = fresh;
}

writeFileSync(`db.${lang}.json`, JSON.stringify(out));
console.log(`✓ db.${lang}.json écrit — nombres inchangés, libellés traduits`);
