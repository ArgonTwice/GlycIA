#!/usr/bin/env node
/* ==========================================================================
   ig-verifier.mjs — aide a confronter les IG traces a la table A1 de 2008
   --------------------------------------------------------------------------
   Le recoupement des IG demande de lire la table de l'article, pas de la
   deviner. La table n'est pas redistribuable, elle n'est donc pas au depot :
   cet outil travaille sur une copie locale que tu fournis.

     1. recuperer le PDF de l'annexe (Table A1 de doi:10.2337/dc08-1239)
     2. en extraire le texte (le PDF en a une couche, pas besoin d'OCR) :
          node tools/ig-verifier.mjs --extraire chemin/vers/tableA1.pdf > a1.txt
     3. lire les fenetres des valeurs pas encore recoupees :
          node tools/ig-verifier.mjs a1.txt
          node tools/ig-verifier.mjs a1.txt pomme      # une seule

   CE QUI SE LIT, ET COMMENT
   La ligne d'un aliment donne d'abord l'IG sur base glucose, puis l'IG sur
   base pain. « 44 63 » veut dire 44, pas 63 — se tromper de colonne fait
   passer une patate douce de 44 a 63.

   Quand un aliment a ete teste plusieurs fois, une ligne « mean of N studies »
   ferme le groupe. C'est elle qui fait foi : une entree isolee ne vaut que
   pour son echantillon. Le pain blanc sort a 75 sur seize etudes quand les
   entrees individuelles vont de 59 a 89.

   PIEGE, paye une fois : cette ligne de moyenne ne se rattache PAS au groupe
   le plus proche dans le texte extrait, dont les colonnes s'entremelent.
   Chercher « Pita bread, white » puis prendre la premiere moyenne qui suit
   renvoie 44 — qui est celle d'All-Bran, le groupe d'apres. Il faut lire la
   fenetre entiere, pas se fier a la proximite. Toute automatisation de ce
   recoupement se trompera de la meme facon.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

/* ---------- Extraction du texte, sans dependance ---------- */
if (args[0] === '--extraire') {
  const brut = fs.readFileSync(args[1]).toString('latin1');
  let texte = '';
  const re = /stream\r?\n/g;
  let m;
  while ((m = re.exec(brut))) {
    const deb = m.index + m[0].length, fin = brut.indexOf('endstream', deb);
    if (fin < 0) continue;
    try {
      const out = zlib.inflateSync(Buffer.from(brut.slice(deb, fin), 'latin1')).toString('latin1');
      if (/Tj|TJ/.test(out)) texte += out + '\n';
    } catch (_) { /* image ou flux non compresse */ }
  }
  const mots = [];
  const rp = /\(((?:[^()\\]|\\.)*)\)/g;
  let p;
  while ((p = rp.exec(texte))) mots.push(p[1].replace(/\\([()\\])/g, '$1'));
  process.stdout.write(mots.join(' ').replace(/\s+/g, ' '));
  process.exit(0);
}

if (!args[0]) {
  console.error('Usage : node tools/ig-verifier.mjs <table.txt> [filtre]');
  console.error('        node tools/ig-verifier.mjs --extraire <table.pdf> > table.txt');
  process.exit(1);
}

const texte = fs.readFileSync(args[0], 'utf8');
const filtre = args[1] ? new RegExp(args[1], 'i') : null;
const db = JSON.parse(fs.readFileSync(path.join(ROOT, 'db.json'), 'utf8'));

/* Termes de recherche : le nom imprime dans la table diverge souvent du nom
   court qu'on utilise. Ceux qui restent vides sont a trouver. */
const TERMES = {
  'Pain aux céréales': 'Multigrain bread|Mixed grain bread',
  'Flocons d\'avoine': 'Porridge made from rolled oats|Oatmeal',
  'Avoine cuite': 'Porridge made from rolled oats|Oatmeal',
  'Muesli sans sucre': 'Muesli, ',
  'Galette de riz soufflé': 'Puffed rice cakes',
  'Riz gluant': 'Glutinous rice',
  'Pâtes complètes': 'Spaghetti, wholemeal, boiled',
  'Vermicelles de riz': 'Rice noodles',
  'Boulgour cuit': 'Bulgur|Bulghur|Cracked wheat',
  'Pommes de terre vapeur': 'Potato, boiled|Steamed potato',
  'Purée de pommes de terre': 'Instant mashed potato',
  'Frites maison': 'French Fries',
  'Frites fast-food': 'French Fries',
  'Lentilles vertes cuites': 'Lentils, green',
  'Haricots rouges cuits': 'Kidney beans',
  'Soja jaune cuit': 'Soya beans',
  'Petits pois': 'Peas, green|Green peas',
  'Pomme': 'Apples, raw',
  'Poire': 'Pear, raw|Pears',
  'Banane': 'Banana, raw',
  'Orange': 'Oranges, raw',
  'Pamplemousse': 'Grapefruit, raw',
  'Raisin': 'Grapes',
  'Ananas frais': 'Pineapple, raw',
  'Betterave cuite': 'Beetroot',
  'Jus de pomme': 'Apple juice, unsweetened',
  'Jus d\'ananas': 'Pineapple juice',
  'Boisson au soja': 'Soy milk, ',
  'Yaourt aux fruits sucré': 'Yoghurt, low-fat, fruit',
  'Glace vanille': 'Ice cream, Regular',
  'Chocolat au lait': 'Milk chocolate, plain|Chocolate, milk',
  'Sucre blanc': 'Sucrose',
  'Miel': 'Honey'
};

let vus = 0;
for (const [nom, ig, , mesure, ok] of db.IG_SRC.v) {
  if (ok === 'x') continue;
  if (filtre && !filtre.test(nom)) continue;
  vus++;
  const pat = TERMES[nom];
  console.log(`\n### ${nom} — affiché ${ig} — rapproché de « ${mesure} »`);
  if (!pat) { console.log('    (pas de terme de recherche : à ajouter dans TERMES)'); continue; }
  let m = null;
  try { m = new RegExp('(?:' + pat + ')', 'i').exec(texte); } catch (e) { console.log('    regex : ' + e.message); continue; }
  console.log(m ? '    ' + texte.slice(m.index, m.index + 420) : '    INTROUVABLE avec « ' + pat + ' »');
}

const total = db.IG_SRC.v.length, faits = db.IG_SRC.v.filter(v => v[4] === 'x').length;
console.log(`\n${faits}/${total} recoupés · ${vus} fenêtre(s) affichée(s) ci-dessus.`);
console.log('Une valeur confirmée se marque par un 5e champ \'x\' dans tools/ig-ref.mjs,');
console.log('puis « node tools/ig-ref.mjs --apply ».');
