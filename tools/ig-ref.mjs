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

     'x' — la valeur a été retrouvée dans la table A1 de l'article, ou dans
           une source secondaire qui la cite explicitement
     absent — saisie depuis les tables publiées, jamais reconfrontée

   La table A1 liste chaque étude séparément puis, quand il y en a plusieurs,
   une ligne « mean of N studies ». C'est cette moyenne qui fait foi ici : une
   entrée isolée ne vaut que pour son échantillon. Le pain blanc, par exemple,
   sort à 75 sur seize études, alors que les entrées individuelles vont de 59
   à 89.

   PIÈGE, payé une fois : la ligne de moyenne ne se rattache pas au groupe le
   plus proche. Chercher « Pita bread, white » puis prendre la première
   « mean of N studies » qui suit donne 44 — qui est la moyenne d'All-Bran,
   le groupe d'après. Le pita blanc, lui, n'a pas de ligne de moyenne : une
   seule entrée, à 68. Toute automatisation de ce recoupement se trompera de
   la même façon ; il faut lire la fenêtre.

   Deux corrections en sont sorties :
   - carotte crue 16 → 35. Le 16 venait d'une table antérieure ; la table 2008
     donne 35 crue en dés et 39 crue moulue.
   - pain pita 57 → 68. Le 57 venait de la même table antérieure. La seule
     entrée de pita blanc dans la table 2008 est à 68.

   À TRANCHER — quatre valeurs dont les entrées retrouvées dans la table ne
   concordent pas avec ce qu'on affiche. Elles ne sont pas corrigées : les
   moyennes correspondantes n'ont pas été localisées dans le texte extrait, et
   changer un chiffre sur une lecture partielle serait refaire l'erreur qu'on
   vient de corriger deux fois.

     Pomme      36  — entrée trouvée : Golden Delicious (Canada) 39
     Orange     43  — entrées trouvées : 33 (Afrique du Sud), 40 (Canada)
     Ananas     59  — entrée trouvée : cru (Australie) 66
     Banane     51  — entrées trouvées : 47 (Australie), 62 (Canada), 70 (Afr. du Sud)
     Lentilles vertes 32 — entrée trouvée : vertes sèches bouillies (Australie) 37
     Raisin     46  — entrée trouvée : noir, Waltham Cross (Australie) 59
     Pâtes complètes 48 — entrées : 42, 45, 58 (écart 16, sous le seuil de retrait)
     Frites     63  — entrées : 54, 64, 70 (écart 16, moyenne implicite 63)

   À LOCALISER — le boulgour et la betterave n'ont pas été retrouvés dans le
   texte extrait. Ce n'est pas une preuve d'absence : l'extraction perd des
   flux. Mais tant qu'on ne les a pas lus, citer la table 2008 pour eux
   repose sur la mémoire, pas sur la source.

   Pour reprendre ce travail : `node tools/ig-verifier.mjs`, qui affiche la
   fenêtre de table de chaque valeur restante et rappelle les pièges.

   `node tools/ig-ref.mjs` donne le compte. Le reste est un chantier ouvert,
   pas un état final. */

/* [nom dans GlycIA, IG, source, aliment mesuré tel qu'il est nommé dans la table, recoupé ?]
   Le quatrième champ est le rapprochement lui-même : c'est lui qu'on vérifie.
   RÈGLE DE RETRAIT, pour ne pas décider au cas par cas : un aliment quitte
   cette table quand ses entrées s'écartent de plus de 20 points sans ligne de
   moyenne pour les résumer, ou quand le rapprochement lui-même ne tient pas.
   Il retrouve alors son IG indicatif, annoncé comme tel — ce qui vaut mieux
   qu'un chiffre présenté comme mesuré et que la source ne soutient pas.

   Retirés à ce titre :
     galette de riz    61 à 91 selon la variété de riz
     vermicelles riz   40 à 61 selon fraîche ou sèche
     p. de terre vapeur rapprochée de « boiled » alors qu'elle est à la vapeur ;
                       les entrées vapeur vont de 62 à 72, sans moyenne

   DEUX RETRAITS ANNULÉS, et c'est instructif. La patate douce et la purée
   instantanée avaient été écartées faute de ligne de moyenne — elles en ont
   une, que mes premières recherches n'avaient pas atteinte : 70 pour la patate
   douce (qui portait 63 à tort), 87 pour la purée. Appliquer une règle sur une
   lecture incomplète produit exactement l'erreur que la règle voulait éviter.
   Chercher la moyenne d'un groupe demande de balayer tout le document, pas la
   fenêtre qui suit le nom.

   Absents dès le départ, pour la même raison : le lait, le chocolat noir, la
   banane très mûre et la courge. */
const REF = [
  // Pains et petit-déjeuner
  ['Pain de mie',              75, 'at08', 'White wheat flour bread', 'x'],
  ['Pain complet',             74, 'at08', 'Whole wheat / whole meal bread', 'x'],
  ['Pain de mie complet',      74, 'at08', 'Whole wheat / whole meal bread', 'x'],
  ['Pain de seigle',           50, 'at08', 'Rye bread, 50% rye + 50% wheat flour', 'x'],
  ['Pain aux céréales',        44, 'at08', 'Bürgen Mixed Grain bread (moyenne)', 'x'],
  ['Pain pita',                68, 'at08', 'Pita bread, white, mini (UK)', 'x'],
  ['Corn flakes',              81, 'at08', 'Corn flakes', 'x'],
  ['Flocons d\'avoine',        55, 'at08', 'Porridge (moyenne)', 'x'],
  ['Avoine cuite',             55, 'at08', 'Porridge (moyenne)', 'x'],
  ['Muesli sans sucre',        57, 'at08', 'Muesli'],
  ['Pop-corn nature',          65, 'at08', 'Popcorn', 'x'],

  // Féculents
  ['Riz blanc cuit',           73, 'at08', 'White rice, boiled', 'x'],
  ['Riz complet cuit',         68, 'at08', 'Brown rice, boiled', 'x'],
  ['Riz basmati cuit',         57, 'at08', 'Basmati rice, boiled', 'x'],
  ['Riz gluant',               98, 'at08', 'Glutinous rice, white, cooked in rice cooker (Thailand)', 'x'],
  ['Pâtes cuites al dente',    49, 'at08', 'Spaghetti, white, boiled 10-15 min', 'x'],
  ['Spaghetti cuits',          49, 'at08', 'Spaghetti, white, boiled 10-15 min', 'x'],
  ['Pâtes complètes',          48, 'at08', 'Spaghetti, wholemeal, boiled'],
  ['Semoule de couscous',      65, 'at08', 'Couscous, rehydrated with hot water', 'x'],
  ['Quinoa cuit',              53, 'at08', 'Quinoa', 'x'],
  ['Boulgour cuit',            48, 'at08', 'Bulgur'],
  ['Orge perlé',               28, 'at08', 'Barley, pearled / pot, boiled', 'x'],
  ['Purée de pommes de terre', 87, 'at08', 'Instant mashed potato (moyenne)', 'x'],
  ['Patate douce cuite',       70, 'at08', 'Sweet potato, cooked (moyenne)', 'x'],
  ['Frites maison',            63, 'at08', 'French fries'],
  ['Frites fast-food',         63, 'at08', 'French fries'],
  ['Maïs doux en boîte',       52, 'at08', 'Sweet corn', 'x'],
  ['Chips',                    56, 'at08', 'Potato crisps', 'x'],

  // Légumineuses
  ['Lentilles vertes cuites',  32, 'at08', 'Lentils'],
  ['Lentilles corail cuites',  26, 'at08', 'Red lentils', 'x'],
  ['Pois chiches cuits',       28, 'at08', 'Chickpeas', 'x'],
  ['Haricots rouges cuits',    22, 'at08', 'Kidney beans (moyenne)', 'x'],
  ['Haricots blancs cuits',    31, 'at08', 'Haricot / Navy beans, boiled (Canada)', 'x'],
  ['Pois cassés',              25, 'at08', 'Split peas', 'x'],
  ['Soja jaune cuit',          16, 'at08', 'Soya beans'],
  ['Petits pois',              51, 'at08', 'Pea, frozen, boiled (Canada)', 'x'],
  ['Houmous',                   6, 'at08', 'Hummus', 'x'],

  // Fruits
  ['Pomme',                    36, 'at08', 'Apple, raw'],
  ['Poire',                    38, 'at08', 'Pear, raw'],
  ['Banane',                   51, 'at08', 'Banana, raw'],
  ['Orange',                   43, 'at08', 'Orange, raw'],
  ['Pamplemousse',             25, 'at08', 'Grapefruit, raw'],
  ['Fraises',                  40, 'at08', 'Strawberries, fresh, raw (Australia)', 'x'],
  ['Raisin',                   46, 'at08', 'Grapes, raw'],
  ['Pastèque',                 76, 'at08', 'Watermelon, raw', 'x'],
  ['Melon',                    65, 'at08', 'Rockmelon / Cantaloupe, raw (Australia)', 'x'],
  ['Ananas frais',             59, 'at08', 'Pineapple, raw'],
  ['Mangue',                   51, 'at08', 'Mango (Mangifera indica) (Australia)', 'x'],
  ['Kiwi',                     58, 'at08', 'Kiwi fruit (Australia)', 'x'],
  ['Pêche',                    42, 'at08', 'Peach, raw'],
  ['Abricot',                  34, 'at08', 'Apricots, raw, NS (Australia)', 'x'],
  ['Dattes séchées',           42, 'at08', 'Dates, dried', 'x'],
  ['Raisins secs',             64, 'at08', 'Raisins (Canada)', 'x'],
  ['Pruneaux',                 29, 'at08', 'Prunes, pitted', 'x'],

  // Légumes
  ['Carotte crue',             35, 'at08', 'Carrots, raw, diced', 'x'],
  ['Carotte cuite',            39, 'at08', 'Carrots, boiled', 'x'],
  ['Betterave cuite',          64, 'at08', 'Beetroot'],

  // Boissons
  ['Jus d\'orange',            50, 'at08', 'Orange juice, unsweetened', 'x'],
  ['Jus de pomme',             41, 'at08', 'Apple juice, unsweetened'],
  ['Jus d\'ananas',            46, 'at08', 'Pineapple juice, unsweetened'],
  ['Boisson au soja',          34, 'at08', 'Soy milk'],
  ['Soda à l\'orange',         68, 'at08', 'Fanta, orange soft drink (Australia)', 'x'],

  // Laitages et sucré
  ['Yaourt aux fruits sucré',  41, 'at08', 'Yoghurt, fruit, sweetened'],
  ['Glace vanille',            51, 'at08', 'Ice cream, regular'],
  ['Chocolat au lait',         43, 'at08', 'Chocolate, milk, plain (moyenne)', 'x'],
  ['Sucre blanc',              65, 'at08', 'Sucrose (moyenne de six études)', 'x'],
  ['Miel',                     61, 'at08', 'Honey (moyenne de dix-sept miels)', 'x']
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
