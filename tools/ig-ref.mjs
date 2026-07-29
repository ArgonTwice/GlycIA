/* Table d'IG tracés — saisie à la main, une citation par valeur.
   node tools/ig-ref.mjs           rapport de couverture et de recoupement
   node tools/ig-ref.mjs --apply   écrit IG_SRC dans db.json

   Pourquoi ce fichier existe. Sur les 1 042 aliments du noyau, 850 portent un
   IG vraisemblable mais non traçable : 82 % sont des multiples de 5, signature
   d'une saisie à la main. Il n'existe aucune base d'IG libre, exploitable par
   machine et faisant autorité — les tables de référence sont des suppléments
   d'article sous droits, non redistribuables dans un dépôt MIT.

   Ce qui est fait ici est différent d'une copie de table : quelques dizaines de
   valeurs d'aliments courants, chacune rattachée à sa publication et au nom
   exact de l'aliment mesuré, pour que n'importe qui puisse aller vérifier. Une
   valeur isolée est un fait ; c'est la sélection et l'agencement d'une table
   entière qui sont protégés.

   Ce fichier n'écrase rien : l'app superpose ces valeurs à celles de db.json au
   chargement, et affiche la citation. Les aliments absents d'ici gardent leur
   IG indicatif, annoncé comme tel. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SRC = {
  at08: {
    t: 'International Tables of Glycemic Index and Glycemic Load Values: 2008',
    a: 'Atkinson FS, Foster-Powell K, Brand-Miller JC',
    j: 'Diabetes Care 31(12):2281-2283',
    y: 2008,
    doi: '10.2337/dc08-1239'
  }
};

/* Cinquième champ, facultatif : l'état de recoupement de la transcription.
   Il ne dit pas « cette valeur est vraie », il dit « ce chiffre a été retrouvé
   ailleurs que dans ma saisie ». Distinction qui compte : la citation garantit
   d'où la valeur est censée venir, pas que je l'aie recopiée sans faute.

     'x' — recoupé avec une source secondaire citant explicitement Atkinson 2008
     absent — saisi depuis les tables publiées, jamais reconfronté

   L'annexe de l'article est payante et il n'existe aucune reproduction ouverte
   et exploitable par machine : le recoupement se fait donc à la main, valeur
   par valeur, et il avance lentement. `node tools/ig-ref.mjs` en donne le
   compte. C'est un chantier ouvert, pas un état final. */

/* [nom dans GlycIA, IG, source, aliment mesuré tel qu'il est nommé dans la table, recoupé ?]
   Le quatrième champ est le rapprochement lui-même : c'est lui qu'on vérifie.
   Volontairement absents : le lait, le chocolat noir, la banane très mûre et la
   courge — leurs valeurs publiées divergent trop d'une étude à l'autre pour
   qu'une moyenne veuille dire quelque chose. Mieux vaut un IG indicatif annoncé
   comme tel qu'un chiffre tracé qui ne tient pas. */
const REF = [
  // Pains et petit-déjeuner
  ['Pain de mie',              75, 'at08', 'White wheat flour bread'],
  ['Pain complet',             74, 'at08', 'Whole wheat / whole meal bread'],
  ['Pain de mie complet',      74, 'at08', 'Whole wheat / whole meal bread'],
  ['Pain de seigle',           50, 'at08', 'Whole grain rye bread'],
  ['Pain aux céréales',        53, 'at08', 'Multigrain bread'],
  ['Pain pita',                57, 'at08', 'White pita bread'],
  ['Corn flakes',              81, 'at08', 'Corn flakes'],
  ['Flocons d\'avoine',        55, 'at08', 'Porridge, rolled oats'],
  ['Avoine cuite',             55, 'at08', 'Porridge, rolled oats'],
  ['Muesli sans sucre',        57, 'at08', 'Muesli'],
  ['Galette de riz soufflé',   87, 'at08', 'Rice cakes, white'],
  ['Pop-corn nature',          65, 'at08', 'Popcorn'],

  // Féculents
  ['Riz blanc cuit',           73, 'at08', 'White rice, boiled', 'x'],
  ['Riz complet cuit',         68, 'at08', 'Brown rice, boiled', 'x'],
  ['Riz basmati cuit',         57, 'at08', 'Basmati rice, boiled'],
  ['Riz gluant',               86, 'at08', 'Glutinous rice'],
  ['Pâtes cuites al dente',    49, 'at08', 'Spaghetti, white, boiled'],
  ['Spaghetti cuits',          49, 'at08', 'Spaghetti, white, boiled'],
  ['Pâtes complètes',          48, 'at08', 'Spaghetti, wholemeal, boiled'],
  ['Vermicelles de riz',       53, 'at08', 'Rice noodles'],
  ['Semoule de couscous',      65, 'at08', 'Couscous'],
  ['Quinoa cuit',              53, 'at08', 'Quinoa'],
  ['Boulgour cuit',            48, 'at08', 'Bulgur'],
  ['Orge perlé',               28, 'at08', 'Pearled barley'],
  ['Pommes de terre vapeur',   78, 'at08', 'Potato, boiled'],
  ['Purée de pommes de terre', 87, 'at08', 'Instant mashed potato'],
  ['Frites maison',            63, 'at08', 'French fries'],
  ['Frites fast-food',         63, 'at08', 'French fries'],
  ['Patate douce cuite',       63, 'at08', 'Sweet potato, boiled'],
  ['Maïs doux en boîte',       52, 'at08', 'Sweet corn'],
  ['Chips',                    56, 'at08', 'Potato crisps'],

  // Légumineuses
  ['Lentilles vertes cuites',  32, 'at08', 'Lentils'],
  ['Lentilles corail cuites',  26, 'at08', 'Red lentils'],
  ['Pois chiches cuits',       28, 'at08', 'Chickpeas', 'x'],
  ['Haricots rouges cuits',    24, 'at08', 'Kidney beans'],
  ['Haricots blancs cuits',    31, 'at08', 'Navy (haricot) beans'],
  ['Pois cassés',              25, 'at08', 'Split peas'],
  ['Soja jaune cuit',          16, 'at08', 'Soya beans'],
  ['Petits pois',              51, 'at08', 'Green peas'],
  ['Houmous',                   6, 'at08', 'Hummus'],

  // Fruits
  ['Pomme',                    36, 'at08', 'Apple, raw'],
  ['Poire',                    38, 'at08', 'Pear, raw'],
  ['Banane',                   51, 'at08', 'Banana, raw'],
  ['Orange',                   43, 'at08', 'Orange, raw'],
  ['Pamplemousse',             25, 'at08', 'Grapefruit, raw'],
  ['Fraises',                  40, 'at08', 'Strawberries, fresh'],
  ['Raisin',                   46, 'at08', 'Grapes, raw'],
  ['Pastèque',                 76, 'at08', 'Watermelon, raw'],
  ['Melon',                    65, 'at08', 'Cantaloupe, raw'],
  ['Ananas frais',             59, 'at08', 'Pineapple, raw'],
  ['Mangue',                   51, 'at08', 'Mango, raw'],
  ['Kiwi',                     58, 'at08', 'Kiwifruit, raw'],
  ['Pêche',                    42, 'at08', 'Peach, raw'],
  ['Abricot',                  34, 'at08', 'Apricot, raw'],
  ['Dattes séchées',           42, 'at08', 'Dates, dried', 'x'],
  ['Raisins secs',             64, 'at08', 'Raisins'],
  ['Pruneaux',                 29, 'at08', 'Prunes, pitted'],

  // Légumes
  ['Carotte crue',             16, 'at08', 'Carrots, raw'],
  ['Carotte cuite',            39, 'at08', 'Carrots, boiled'],
  ['Betterave cuite',          64, 'at08', 'Beetroot'],

  // Boissons
  ['Jus d\'orange',            50, 'at08', 'Orange juice, unsweetened'],
  ['Jus de pomme',             41, 'at08', 'Apple juice, unsweetened'],
  ['Jus d\'ananas',            46, 'at08', 'Pineapple juice, unsweetened'],
  ['Boisson au soja',          34, 'at08', 'Soy milk'],
  ['Soda à l\'orange',         68, 'at08', 'Fanta, orange soft drink'],

  // Laitages et sucré
  ['Yaourt aux fruits sucré',  41, 'at08', 'Yoghurt, fruit, sweetened'],
  ['Glace vanille',            51, 'at08', 'Ice cream, regular'],
  ['Chocolat au lait',         43, 'at08', 'Milk chocolate'],
  ['Sucre blanc',              65, 'at08', 'Sucrose'],
  ['Miel',                     61, 'at08', 'Honey']
];

const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

const dbPath = path.join(ROOT, 'db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

const foods = new Map();
[db.FOODDB, db.FOODDB2].forEach(bloc => Object.values(bloc || {}).forEach(
  liste => liste.forEach(a => { if (!foods.has(norm(a[0]))) foods.set(norm(a[0]), a); })
));

const absents = [], ecarts = [];
REF.forEach(([nom, ig, , mesure]) => {
  const a = foods.get(norm(nom));
  if (!a) { absents.push(nom); return; }
  const ancien = a[2];
  if (ancien != null && Math.abs(ancien - ig) >= 8) ecarts.push([nom, ancien, ig, mesure]);
});

const doublons = new Set();
REF.forEach(([n]) => { if (doublons.has(norm(n))) console.error('  doublon :', n); doublons.add(norm(n)); });

const recoupees = REF.filter(r => r[4] === 'x').length;

console.log(`Table d'IG tracés : ${REF.length} valeurs, ${REF.length - absents.length} rattachées à un aliment de GlycIA.`);
console.log(`Transcription recoupée : ${recoupees}/${REF.length}. Les ${REF.length - recoupees} autres`
  + ` sont citées mais n'ont pas été reconfrontées à une source — voir l'en-tête de ce fichier.`);

if (absents.length) {
  console.log(`\n${absents.length} clés sans aliment correspondant — nom à corriger :`);
  absents.forEach(n => console.log('  ✗ ' + n));
}

if (ecarts.length) {
  console.log(`\n${ecarts.length} écarts d'au moins 8 points avec la valeur saisie à la main :`);
  ecarts.sort((a, b) => Math.abs(b[1] - b[2]) - Math.abs(a[1] - a[2]))
    .forEach(([n, av, ap, m]) => console.log(`  ${n.padEnd(26)} ${String(av).padStart(3)} → ${String(ap).padStart(3)}   (${m})`));
  console.log('\nL\'app affiche la valeur tracée et cite sa source ; db.json n\'est pas modifié.');
}

if (process.argv.includes('--apply')) {
  delete db.IG_REF;                               // nom d'une première version
  db.IG_SRC = { src: SRC, v: REF };
  fs.writeFileSync(dbPath, JSON.stringify(db));   // db.json reste sur une ligne
  console.log(`\n✓ IG_SRC écrit dans db.json (${REF.length} valeurs, ${Object.keys(SRC).length} source).`);
}
