#!/usr/bin/env node
/* ==========================================================================
   audit-gastro.mjs — relit le classement gastroparésie et cherche l'incohérent
   --------------------------------------------------------------------------
   Le classement repose sur des motifs appliqués au nom de l'aliment. C'est
   robuste tant que les noms se ressemblent, et ça se dérègle en silence dès
   qu'une famille entière échappe à son motif : les boissons énergisantes ne
   contiennent ni « soda » ni « gazeux », donc rien ne les attrapait, alors
   qu'elles sont pétillantes comme un cola.

   L'outil ne juge pas aliment par aliment — ce serait refaire la table à la
   main. Il vérifie des RÈGLES DE FAMILLE : tout ce qui est alcoolisé doit
   être écarté pour l'alcool, tout ce qui pétille pour le gaz, et un jus
   filtré ne doit jamais l'être pour des peaux et des pépins qu'il n'a plus.

   Une anomalie n'est pas forcément une erreur : elle demande un regard.

     node tools/audit-gastro.mjs
   ========================================================================== */
import api from './test/harness.mjs';

const { ALL, gpLevel, gpReason, gpFat, normalize } = api;

/* [nom de la famille, motif sur le nom, niveau attendu au minimum,
    mécanisme attendu | null, exceptions] */
const FAMILLES = [
  /* Uniquement des boissons : « Diots au vin blanc » est un plat mijoté et
     « Crackers apéro » un biscuit — ni l'un ni l'autre ne relève de l'alcool,
     et les compter ici ne produirait que du bruit. */
  ['alcool', /^(?:biere|vin (?:rouge|blanc|rose|doux)|whisky|vodka|gin |rhum|pastis|champagne|cidre|mojito|spritz|porto|kir|sangria|margarita|punch|liqueur|digestif|eau-de-vie|panache|pina colada|sake|tequila|cocktail sucre)/,
   3, 'gaz'],
  ['boisson gazeuse', /soda|\bcola\b|limonade|tonic|energisant|kombucha|petillant|gazeu|perrier|schweppes|ginger ale/,
   3, 'gaz'],
  ['friture et panure', /frit(e|es|ure)?\b|pane|nugget|beignet|churros|tempura/, 3, 'friture'],
  ['charcuterie', /saucisse|chorizo|salami|saucisson|lardon|bacon|rillette/, 3, 'charcuterie'],
  ['legumineuse', /lentille|pois chiche|haricot (rouge|blanc|noir)|flageolet|feve\b/, 3, 'legumineuses'],
  ['fruit a coque', /noix|amande|pistache|cajou|noisette|cacahuete/, 3, null],
  ['cereale complete', /complet|son d|muesli|granola|pop-?corn/, 3, null]
];

/* Ce qu'un motif ne doit PAS reprocher : un jus filtré n'a plus ni peau ni
   pépin, une compote non plus. Le motif du fruit entier ne doit pas les
   suivre jusque-là. */
const INTERDITS = [
  ['jus filtre', /^jus |^nectar |^sirop |^citronnade|^diabolo|^thé glacé|^ice tea/i, 'peaux_pepins',
   'un jus filtré n’a plus de peaux ni de pépins'],
  ['compote et puree', /^compote|^purée de fruits|^gelée/i, 'peaux_pepins',
   'la compote est justement le fruit sans sa peau']
];

const MARK = { 1: '✅', 2: '⚠️', 3: '⛔' };
const anomalies = [];
const note = (fam, f, dit) => anomalies.push({ fam, n: f.n, lv: gpLevel(f), dit });

for (const f of ALL) {
  const k = normalize(f.n);
  const motifs = gpReason(f);
  const titres = motifs.map(m => m.t).join(' ');

  for (const [fam, re, mini, mecaAttendu] of FAMILLES) {
    if (!re.test(k)) continue;
    if (gpLevel(f) < mini) { note(fam, f, `classé ${MARK[gpLevel(f)]}, attendu ${MARK[mini]}`); continue; }
    if (mecaAttendu === 'gaz' && !/Gaz ou alcool/.test(titres))
      note(fam, f, `écarté, mais pas pour l’alcool ni le gaz — « ${motifs[0].t} »`);
    if (mecaAttendu === 'friture' && !/Friture|gras|lipides/i.test(titres))
      note(fam, f, `écarté, mais pas pour la friture — « ${motifs[0].t} »`);
  }

  for (const [fam, re, mecaInterdit, pourquoi] of INTERDITS) {
    if (!re.test(f.n)) continue;
    const meca = { peaux_pepins: /Peaux, pépins/ }[mecaInterdit];
    if (meca && meca.test(titres)) note(fam, f, `reproche « peaux et pépins » : ${pourquoi}`);
  }

  /* L'alcool apporte 7 kcal/g. Estimer les lipides d'après les calories fait
     donc d'une eau-de-vie un aliment gras, ce qu'elle n'est pas. */
  if (/whisky|vodka|\bgin\b|rhum|eau-de-vie|digestif|liqueur|pastis|tequila/.test(k)
      && f.lip == null && gpFat(f) > 5)
    note('gras fantôme', f, `${Math.round(gpFat(f))} g de lipides estimés sur un alcool`);
}

const parFamille = {};
anomalies.forEach(a => (parFamille[a.fam] = parFamille[a.fam] || []).push(a));

console.log(`Classement gastroparésie : ${ALL.length} aliments relus.`);
const n = [0, 0, 0, 0];
ALL.forEach(f => n[gpLevel(f)]++);
console.log(`  ✅ ${n[1]}   ⚠️ ${n[2]}   ⛔ ${n[3]}\n`);

if (!anomalies.length) {
  console.log('Aucune incohérence de famille.');
} else {
  console.log(`${anomalies.length} incohérences, ${Object.keys(parFamille).length} familles :\n`);
  for (const [fam, liste] of Object.entries(parFamille)) {
    console.log(`— ${fam} (${liste.length})`);
    liste.forEach(a => console.log(`   ${MARK[a.lv]} ${a.n.padEnd(30)} ${a.dit}`));
    console.log('');
  }
}

/* Un aliment écarté sans explication est le pire cas : on retire sans dire
   pourquoi. Contrôlé aussi par la suite de tests. */
const muets = ALL.filter(f => gpLevel(f) === 3 && !gpReason(f).some(m => m.p && m.p.length > 40));
console.log(muets.length
  ? `⚠️  ${muets.length} aliments écartés sans mécanisme expliqué : ${muets.slice(0, 5).map(f => f.n).join(', ')}`
  : '✓ Chaque aliment écarté nomme le frein en cause et l’explique.');

process.exit(anomalies.length ? 1 : 0);
