/* node --test tools/test/
   Les fonctions testées sont celles de app.js, chargées telles quelles.
   Priorité aux régressions déjà survenues : elles sont annotées. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import api, { navigateur } from './harness.mjs';

const {
  normalize, clamp, round, fmtQ, igLabel, igClass, aIg, withBrand,
  gpLevel, gpReason, gpFat, gpRecipeLevel, gpRecipeReason,
  igKey, personalIg, mealResponse, matchShoppingItem, gluPath, unent, ingPair,
  migrateIgPerso, IG_ORIG,
  navStack, pushNav, closeNav, navTab, go, curTab, removeMeal,
  mergeGlucose, restoreGlucose, forgetGlucose, cgmProvider, store,
  IG_TRACE, igCite,
  computeTotals, toGl, fmtDur, IGP, state, ALL, DB, matchFoods, setQuery
} = api;

/* Le Worker n'a pas de DOM : il s'importe directement. Seul `export default`
   sert au déploiement, `__test` n'existe que pour ce fichier. */
const { __test: worker } = await import('../../worker/worker.js');

describe('utilitaires', () => {
  test('normalize retire accents et casse', () => {
    assert.equal(normalize('Pâte à Tartiner'), 'pate a tartiner');
  });
  test('clamp et round', () => {
    assert.equal(clamp(120, 0, 100), 100);
    assert.equal(round(57.456, 1), 57.5);
    assert.equal(round(57.456), 57);
  });
  test('fmtQ affiche les demi-portions', () => {
    assert.equal(fmtQ(1), '1');
    assert.equal(fmtQ(1.5), '1½');
  });
  test('igLabel suit les seuils des tables internationales', () => {
    assert.equal(igLabel(55), 'IG bas');
    assert.equal(igLabel(56), 'IG moyen');
    assert.equal(igLabel(70), 'IG élevé');
  });
  /* Piège : null < 56 est vrai. Sans garde, tout aliment sans IG connu
     s'afficherait « IG bas » — le contresens le plus dangereux possible. */
  test('un IG absent ne passe pas pour un IG bas', () => {
    for (const v of [null, undefined, 0, NaN]) {
      assert.equal(igLabel(v), 'IG inconnu', String(v));
      assert.equal(igClass(v), '', String(v));
    }
  });
  test('toGl convertit mg/dL en g/L à la française', () => {
    assert.equal(toGl(142), '1,42');
  });
  test('fmtDur', () => {
    assert.equal(fmtDur(45), '45 min');
    assert.equal(fmtDur(130), '2 h 10');
  });
});

describe('Open Food Facts', () => {
  /* Régression : la marque était recollée même déjà présente -> "Nutella — Nutella" */
  test('withBrand ne duplique pas la marque déjà dans le nom', () => {
    assert.equal(withBrand('Nutella', 'Nutella, Ferrero'), 'Nutella');
  });
  test('withBrand ajoute la marque quand elle manque', () => {
    assert.equal(withBrand('Pâte à tartiner', 'Nutella, Ferrero'), 'Pâte à tartiner — Nutella');
  });
  test('withBrand plafonne à 52 caractères', () => {
    assert.ok(withBrand('x'.repeat(60), 'Marque').length <= 52);
  });
  /* Les deux routes de recherche ne renvoient pas brands sous la même forme :
     tableau pour Search-a-licious, chaîne pour l'ancienne. */
  test('offToEntry accepte les deux formes de « brands »', () => {
    const nu = { carbohydrates_100g: 30, 'energy-kcal_100g': 150 };
    const a = api.offToEntry({ product_name_fr: 'Riz basmati', brands: ['Taureau Ailé'], nutriments: nu });
    const b = api.offToEntry({ product_name_fr: 'Riz basmati', brands: 'Taureau Ailé, Autre', nutriments: nu });
    assert.equal(a.n, b.n);
    assert.equal(a.n, 'Riz basmati — Taureau Ailé');
    assert.equal(a.c, 30);
  });
  test('offToEntry écarte un produit sans glucides connus', () => {
    assert.equal(api.offToEntry({ product_name_fr: 'X', nutriments: {} }), null);
    assert.equal(api.offToEntry({ product_name_fr: '', nutriments: { carbohydrates_100g: 10 } }), null);
  });
  test('offToEntry borne les valeurs aberrantes', () => {
    const f = api.offToEntry({ product_name_fr: 'Bizarre',
      nutriments: { carbohydrates_100g: 480, 'energy-kcal_100g': 9000 }, serving_quantity: 5000 });
    assert.ok(f.c <= 100 && f.kcal <= 900 && f.pw <= 900, JSON.stringify(f));
  });
  /* guessIG() devinait un IG a partir de mots-cles du nom. Supprime :
     il fabriquait un chiffre d'apparence mesuree pour 53 000 aliments. */
  test('les produits en ligne n’ont plus d’IG inventé', () => {
    const f = api.offToEntry({ product_name_fr: 'Danette café', brands: 'Danone',
      nutriments: { carbohydrates_100g: 17.5, 'energy-kcal_100g': 120 } });
    assert.equal(f.ig, null);
    assert.equal(f.c, 17.5);
  });
});

describe('gastroparésie — classement', () => {
  const f = (n, cat = 'Sucré, desserts & goûter', c = 20, kcal = 200, lip) =>
    ({ n, cat, c, kcal, lip });

  /* Régressions : ces motifs matchaient en plein mot. */
  test('« cola » ne doit pas matcher « chocolat »', () => {
    const r = gpReason(f('Chocolat noir'));
    assert.ok(!r.some(x => /Gaz ou alcool/.test(x)), r.join(' | '));
  });
  test('« moule » ne doit pas matcher « semoule »', () => {
    const r = gpReason(f('Semoule de couscous', 'Féculents, céréales & légumineuses'));
    assert.ok(!r.some(x => /Chair ferme/.test(x)), r.join(' | '));
  });
  test('« confit » ne doit pas matcher « confiture »', () => {
    const r = gpReason(f('Confiture'));
    assert.ok(!r.some(x => /Charcuterie/.test(x)), r.join(' | '));
  });
  test('« mais » ne doit pas matcher « maison »', () => {
    const r = gpReason(f('Jus pressé maison', 'Boissons', 11, 45));
    assert.ok(!r.some(x => /Céréales complètes/.test(x)), r.join(' | '));
  });

  test('les vrais cas restent classés à éviter', () => {
    assert.equal(gpLevel(f('Moules marinières', 'Poissons & fruits de mer', 3, 90)), 3);
    assert.equal(gpLevel(f('Escalope panée', 'Viandes, volailles & charcuterie', 12, 240)), 3);
    assert.equal(gpLevel(f('Maïs, pop-corn')), 3);
  });
  test('les textures lisses restent bien tolérées', () => {
    assert.equal(gpLevel(f('Purée de pommes de terre', 'Légumes', 15, 90)), 1);
    assert.equal(gpLevel(f('Velouté de courge', 'Légumes', 6, 45)), 1);
  });

  test('chaque niveau donne au moins une raison non vide', () => {
    for (const nom of ['Chorizo', 'Purée de carotte', 'Riz blanc', 'Lentilles', 'Kiwi']) {
      const r = gpReason(f(nom));
      assert.ok(r.length > 0 && r.every(x => typeof x === 'string' && x.length > 10), nom);
    }
  });
  test('deux freins cumulés donnent deux raisons', () => {
    const r = gpReason(f('Muesli aux noix', 'Petit-déjeuner & tartines', 60, 450));
    assert.ok(r.length >= 2, r.join(' | '));
  });
});

describe('gastroparésie — lipides', () => {
  test('gpFat utilise la valeur mesurée quand elle existe', () => {
    assert.equal(gpFat({ n: 'x', c: 0, kcal: 900, lip: 12.5 }), 12.5);
  });
  test('gpFat retombe sur l’estimation sans valeur mesurée', () => {
    const estime = gpFat({ n: 'x', c: 0, kcal: 500 });
    assert.ok(estime > 0 && estime < 60, String(estime));
  });
  /* Piège : un trou du tableau JSON devient null, et isFinite(null) vaut true.
     Sans garde, un aliment sans lipides connus passerait pour 0 g de gras. */
  test('lipides à null : on estime, on ne lit pas 0', () => {
    assert.ok(gpFat({ n: 'x', c: 0, kcal: 500, lip: null }) > 0);
    assert.equal(gpFat({ n: 'x', c: 0, kcal: 500, lip: 0 }), 0);
  });
  /* Régression : le whisky était crédité de 21 g de lipides par l'estimation */
  test('la provenance du chiffre est indiquée', () => {
    const r = gpReason({ n: 'Test gras', cat: 'Sauces, matières grasses & apéro', c: 0, kcal: 400, lip: 40 });
    assert.ok(r.some(x => /Ciqual/.test(x)), r.join(' | '));
  });
});

describe('gastroparésie — recettes', () => {
  const r = (title, ing, ph) => ({ title, ing: ing.map(x => [x]), ph });
  test('une recette du répertoire est bien tolérée', () => {
    assert.equal(gpRecipeLevel(r('Velouté', ['courge'], 2)), 1);
    assert.ok(/répertoire/.test(gpRecipeReason(r('Velouté', ['courge'], 2))[0]));
  });
  test('les ingrédients problématiques sont nommés', () => {
    const raisons = gpRecipeReason(r('Poêlée de chou et lardons', ['chou vert', 'lardons fumés']));
    assert.ok(raisons.length >= 2, raisons.join(' | '));
  });
});

describe('IG personnel', () => {
  /* Régression : la clé incluait le suffixe de portion, le seuil n'était jamais atteint */
  test('igKey retire le suffixe de portion', () => {
    assert.equal(igKey('Nutella (1½ portion)'), igKey('Nutella'));
    assert.equal(igKey('Riz blanc (2 portions)'), 'riz blanc');
  });
  test('sous le seuil, aucun IG personnel', () => {
    IGP.obs['test aliment'] = [1.2, 1.3, 1.1];
    assert.equal(personalIg('Test aliment', 60), null);
    delete IGP.obs['test aliment'];
  });
  test('au-dessus du seuil, un IG corrigé et borné', () => {
    IGP.obs['test rapide'] = [1.6, 1.55, 1.7, 1.58, 1.66];
    IGP.obs['test lent'] = [0.6, 0.58, 0.64, 0.6, 0.62];
    const rapide = personalIg('Test rapide (1½ portion)', 60);
    const lent = personalIg('Test lent', 60);
    assert.ok(rapide && lent, 'les deux doivent être définis');
    assert.equal(rapide.n, 5);
    assert.ok(rapide.ig > lent.ig, `${rapide.ig} doit dépasser ${lent.ig}`);
    for (const p of [rapide, lent]) assert.ok(p.ig >= 0 && p.ig <= 100);
    delete IGP.obs['test rapide']; delete IGP.obs['test lent'];
  });
});

describe('réponse glycémique', () => {
  const courbe = (base, pic, tRepas) => {
    const pts = [];
    for (let i = -4; i < 0; i++) pts.push({ t: new Date(tRepas + i * 5 * 60000), mgdl: base });
    const forme = [0, .1, .35, .7, .95, 1, .85, .6, .35, .15, .05, 0, 0, 0, 0, 0, 0, 0];
    forme.forEach((k, i) => pts.push({ t: new Date(tRepas + i * 10 * 60000), mgdl: Math.round(base + (pic - base) * k) }));
    return pts;
  };
  test('pic, écart et retour sont mesurés', () => {
    const t = Date.now() - 4 * 3600e3;
    state.glucose = courbe(95, 180, t);
    const r = mealResponse({ time: new Date(t), carbs: 60, ig: 60 });
    assert.ok(r, 'une réponse est attendue');
    assert.equal(r.base, 95);
    assert.equal(r.peak.mgdl, 180);
    assert.equal(r.delta, 85);
    assert.equal(r.peakMin, 50);
    assert.ok(r.backMin > r.peakMin, 'le retour vient après le pic');
    state.glucose = [];
  });
  test('moins de 4 mesures : pas de courbe', () => {
    const t = Date.now() - 4 * 3600e3;
    state.glucose = [{ t: new Date(t + 60000), mgdl: 100 }, { t: new Date(t + 120000), mgdl: 110 }];
    assert.equal(mealResponse({ time: new Date(t), carbs: 60, ig: 60 }), null);
    state.glucose = [];
  });
  test('sans capteur, pas de courbe', () => {
    state.glucose = [];
    assert.equal(mealResponse({ time: new Date(), carbs: 60, ig: 60 }), null);
  });

  /* Depuis que la courbe s'accumule d'une lecture à l'autre, les trous sont la
     règle et non l'exception : téléphone endormi, capteur retiré, LibreLinkUp
     qui ne rend que 12 h. Un point de départ vieux de six heures donnerait un
     « +0,85 g/L » mesuré contre une glycémie d'hier. */
  test('un point de départ trop vieux invalide la réponse', () => {
    const t = Date.now() - 4 * 3600e3;
    const pts = courbe(95, 180, t);
    const decolles = pts.map(p => (+p.t < t ? { t: new Date(+p.t - 6 * 3600e3), mgdl: p.mgdl } : p));
    state.glucose = decolles;
    const r = mealResponse({ time: new Date(t), carbs: 60, ig: 60 });
    /* Le premier point après le repas est à t+0, donc il fait office de départ.
       En le décalant aussi, il ne reste plus rien de proche. */
    assert.ok(r, 'un premier point à l’heure du repas fait un départ valable');
    state.glucose = decolles.filter(p => +p.t < t || +p.t > t + 40 * 60000);
    assert.equal(mealResponse({ time: new Date(t), carbs: 60, ig: 60 }), null,
      'sans mesure proche du repas, aucun écart n’a de sens');
    state.glucose = [];
  });

  test('« encore au-dessus à 3 h » demande d’avoir mesuré jusque-là', () => {
    const t = Date.now() - 4 * 3600e3;
    /* Une montée qui ne redescend pas, mais dont les mesures s'arrêtent à 40 min */
    state.glucose = [-10, -5, 0, 10, 20, 30, 40].map(min => ({
      t: new Date(t + min * 60000), mgdl: min <= 0 ? 95 : 95 + min * 2
    }));
    const r = mealResponse({ time: new Date(t), carbs: 60, ig: 60 });
    assert.ok(r, 'une réponse partielle reste affichable');
    assert.equal(r.backMin, null, 'la glycémie n’est jamais redescendue');
    assert.equal(r.complet, false, 'mais on ne peut rien affirmer sur la 3ᵉ heure');
    state.glucose = [];
  });
});

describe('tracé de la courbe', () => {
  const X = p => (+p.t % 100000) / 1000;
  const Y = v => v / 10;

  /* Relier deux points separés par un trou dessinerait une glycémie jamais
     mesurée. Le trait doit se lever : un « M » de plus dans le chemin SVG. */
  test('un trou coupe le trait au lieu de l’enjamber', () => {
    const t = Date.parse('2026-07-29T08:00:00Z');
    const serre = [0, 5, 10, 15].map(m => ({ t: new Date(t + m * 60000), mgdl: 100 }));
    assert.equal((gluPath(serre, X, Y).match(/M/g) || []).length, 1, 'série continue : un seul M');

    const troue = [0, 5, 240, 245].map(m => ({ t: new Date(t + m * 60000), mgdl: 100 }));
    assert.equal((gluPath(troue, X, Y).match(/M/g) || []).length, 2, 'quatre heures sans mesure : le trait se coupe');
  });

  test('un intervalle de capteur normal ne coupe rien', () => {
    const t = Date.parse('2026-07-29T08:00:00Z');
    /* Libre pose un point tous les quarts d'heure : c'est une série continue. */
    const libre = [0, 15, 30, 45].map(m => ({ t: new Date(t + m * 60000), mgdl: 100 }));
    assert.equal((gluPath(libre, X, Y).match(/M/g) || []).length, 1);
  });

  test('un point isolé se dessine sans planter', () => {
    assert.equal((gluPath([{ t: new Date(), mgdl: 100 }], X, Y).match(/M/g) || []).length, 1);
    assert.equal(gluPath([], X, Y), '');
  });
});

/* Un nom qui arrive avec des entites HTML traversait toute la chaine jusqu'a
   esc(), qui reechappait le & : l'utilisateur lisait « l&apos;eau ». */
describe('noms venus de l’exterieur', () => {
  test('les entites sont decodees avant affichage', () => {
    assert.equal(unent('Quinoa, bouilli/cuit à l&apos;eau'), 'Quinoa, bouilli/cuit à l\'eau');
    assert.equal(unent('Pommes de terre &quot;grenaille&quot;'), 'Pommes de terre "grenaille"');
    assert.equal(unent('Traces &lt; 0,5 g'), 'Traces < 0,5 g');
    assert.equal(unent('Chips &#39;nature&#39;'), 'Chips \'nature\'');
  });

  test('un nom deja propre n’est pas touche', () => {
    for (const n of ['M&S Food', 'Chef Select — curry & barbecue', 'Yaourt nature', ''])
      assert.equal(unent(n), n);
  });

  /* Des saisies d'Open Food Facts sont encodees deux fois. */
  test('le double encodage est defait, mais pas a l’infini', () => {
    assert.equal(unent('Pik&amp;amp;croq'), 'Pik&croq');
    /* Trois passages au plus : un nom fait pour resister s'arrete la plutot
       que de boucler. Cinq couches d'encodage, trois retirees, deux restent. */
    assert.equal(unent('&amp;amp;amp;amp;amp;lt;'), '&amp;amp;lt;');
  });

  test('les bases livrees avec l’app sont propres', () => {
    const sales = ALL.filter(f => /&(apos|quot|amp|lt|gt|nbsp);|&#\d+;/.test(f.n));
    assert.deepEqual(sales.map(f => f.n), [], 'aucune entite ne doit rester dans db.json');
  });
});

/* Les recettes des modes listent leurs ingredients en une seule chaine. La
   regle d'avant detachait le dernier mot quoi qu'il arrive : « Sel, poivre »
   s'affichait « Sel, » avec « poivre » en quantite. */
describe('ingredients des recettes de mode', () => {
  test('la quantite est detachee quand il y en a une', () => {
    assert.deepEqual(ingPair('Œufs 2'), ['Œufs', '2']);
    assert.deepEqual(ingPair('Pain complet 2 tranches'), ['Pain complet', '2 tranches']);
    assert.deepEqual(ingPair('Avocat ½'), ['Avocat', '½']);
    /* La quantite court jusqu'au bout : « 3 c. à soupe » ne se coupe pas
       apres « à », ce que faisait la regle precedente. */
    assert.deepEqual(ingPair('Lait écrémé 3 c. à soupe'), ['Lait écrémé', '3 c. à soupe']);
  });

  test('sans quantite, le nom reste entier', () => {
    assert.deepEqual(ingPair('Sel, poivre'), ['Sel, poivre', '']);
    assert.deepEqual(ingPair('Persil et coriandre'), ['Persil et coriandre', '']);
    assert.deepEqual(ingPair('Menthe fraîche'), ['Menthe fraîche', '']);
    assert.deepEqual(ingPair('Une pincée de sel'), ['Une pincée de sel', '']);
    assert.deepEqual(ingPair('Cannelle en option'), ['Cannelle en option', '']);
  });

  /* Le repertoire entier doit passer : aucun nom ne doit finir sur une
     virgule ou une conjonction, signe qu'on a coupe au mauvais endroit. */
  test('aucune ligne du repertoire n’est coupee de travers', () => {
    const modes = ['GP_RECIPES', 'RAMADAN_RECIPES', 'GE_RECIPES', 'SPORT_RECIPES'];
    const mauvaises = [];
    modes.forEach(m => (DB[m] || []).forEach(r => (r.i || []).forEach(x => {
      const [nom, qte] = ingPair(x);
      if (/[,;]$|\b(et|ou|de|à|en|non)$/i.test(nom)) mauvaises.push(`${x} -> ${nom} | ${qte}`);
      if (qte && !/^[\d½¼¾⅓⅔⅛]/.test(qte)) mauvaises.push(`${x} -> quantite « ${qte} »`);
    })));
    assert.deepEqual(mauvaises, []);
  });
});

/* Chercher « riz » remontait quatre « Riz au lait » avant le riz : tout ce qui
   commençait par la requête etait a egalite, et le tri alphabetique tranchait. */
describe('pertinence de la recherche', () => {
  const chercher = q => { setQuery(q); const r = matchFoods().map(f => f.n); setQuery(''); return r; };

  test('le riz passe avant le riz au lait', () => {
    const r = chercher('riz');
    const lait = r.findIndex(n => /^Riz au lait/i.test(n));
    const grain = r.findIndex(n => /^Riz (blanc|complet|basmati)/i.test(n));
    assert.ok(grain >= 0 && lait >= 0, 'les deux doivent etre trouves');
    assert.ok(grain < lait, `« ${r[grain]} » doit passer avant « ${r[lait]} »`);
  });

  /* Meme regularite du francais : une preposition annonce un autre aliment,
     et le « s » du pluriel ne doit pas faire rater la regle. */
  test('la pomme de terre passe apres les vraies pommes', () => {
    const r = chercher('pomme');
    const terre = r.findIndex(n => /^Pommes de terre/i.test(n));
    const fruit = r.findIndex(n => /^Pomme (Golden|verte|rouge|au four|cuite)/i.test(n));
    assert.equal(r[0], 'Pomme', 'le nom exact d’abord');
    if (fruit >= 0 && terre >= 0) assert.ok(fruit < terre, `« ${r[fruit]} » avant « ${r[terre]} »`);
  });

  /* « Pain a burger » reste un pain : le « a » seul n'annonce pas un autre
     aliment, contrairement a « au » et « aux ». */
  test('une preposition d’usage ne declasse pas', () => {
    const r = chercher('pain');
    assert.ok(r.slice(0, 6).some(n => /^Pain à burger/i.test(n)), 'il reste parmi les premiers pains');
  });

  test('un nom exact arrive en tete', () => {
    for (const q of ['pomme', 'miel', 'banane']) {
      const r = chercher(q);
      assert.equal(normalize(r[0]), q, `« ${q} » doit se trouver lui-meme en premier, or « ${r[0]} »`);
    }
  });

  /* Le depart noyau / bases etendues ne se teste pas ici : le harnais ne
     charge que db.json, ciqual.json et off-fr.json arrivent par le reseau.
     Ce classement-la se verifie dans le navigateur. */

  test('une frappe en cours de mot trouve encore', () => {
    assert.ok(chercher('chocol').some(n => /chocolat/i.test(n)), 'la recherche doit suivre la frappe');
  });
});

/* GP_FOODS est une table de conseils, ecrite pour etre lue. S'en servir telle
   quelle pour apparier des aliments confondait deux formes : l'enumeration
   (« Chou, brocoli, chou-fleur ») et la preparation (« Tomate pelee et
   epepinee »). L'appariement se faisait dans les deux sens, si bien qu'un nom
   court heritait du niveau d'une reference plus longue — 45 aliments etaient
   classes ainsi. */
describe('gastroparesie — appariement aux reperes', () => {
  const niveau = n => { const f = ALL.find(x => x.n === n); assert.ok(f, n); return gpLevel(f); };
  const motif = n => gpReason(ALL.find(x => x.n === n)).join(' ');

  test('un aliment frais ne prend pas le niveau de sa version sechee', () => {
    assert.equal(niveau('Abricot'), 2, 'un abricot frais n’est pas un fruit sec');
    assert.equal(niveau('Abricots secs'), 3);
    assert.equal(niveau('Prune'), 2);
  });

  /* « poireau ».includes(« poire ») : la poire heritait du poireau. */
  test('un nom contenu dans un autre ne les confond pas', () => {
    assert.equal(niveau('Poire'), 2);
    assert.equal(niveau('Poireau'), 3);
  });

  test('les enumerations restent appariees terme a terme', () => {
    for (const n of ['Brocoli', 'Chou-fleur', 'Petits pois', 'Pâtes complètes'])
      assert.equal(niveau(n), 3, n);
    assert.equal(niveau('Melon'), 1);
  });

  /* « ail » ne doit pas se reconnaitre au milieu d'« ailerons ». */
  test('l’appariement se fait sur des mots entiers', () => {
    const ail = ALL.find(x => x.n === 'Ail');
    const ailerons = ALL.find(x => /^Ailerons/.test(x.n));
    if (ail && ailerons) assert.notEqual(gpLevel(ailerons), 1);
  });

  test('une preparation ne deteint pas sur l’aliment nu', () => {
    /* La table dit « Tomate pelee et epepinee », pas « Tomate ». */
    assert.notEqual(niveau('Tomate'), 1);
  });
});

/* Le niveau vient de la table de reperes, la raison des motifs : deux sources
   qui pouvaient se contredire. Un roti de boeuf sortait « a eviter » au motif
   d'etre un « plat compose », une baguette blanche au motif du son. */
describe('gastroparesie — le motif suit le classement', () => {
  const motif = n => gpReason(ALL.find(x => x.n === n)).join(' ');

  test('un repere explicite est cite tel quel', () => {
    assert.match(motif('Rôti de bœuf'), /Steak, rôti, viande en morceaux/);
    assert.match(motif('Baguette blanche'), /Pain frais, baguette/);
  });

  test('une baguette blanche n’est plus expliquee par le son', () => {
    assert.doesNotMatch(motif('Baguette blanche'), /son|complètes/i);
  });

  test('« bien mûre » n’est pas la baie', () => {
    assert.equal(gpLevel(ALL.find(x => x.n === 'Banane bien mûre')), 1);
    assert.equal(gpLevel(ALL.find(x => x.n === 'Mûres')), 3);
  });

  test('le haricot vert n’est pas une legumineuse', () => {
    assert.doesNotMatch(motif('Haricots verts'), /Légumineuses/);
    assert.match(motif('Haricots rouges cuits'), /Légumineuses/);
  });

  test('« sec » ne fait pas d’un vin un legume fibreux', () => {
    assert.doesNotMatch(motif('Vin blanc sec'), /Légume cru/);
    assert.match(motif('Vin blanc sec'), /alcool/i);
  });

  /* Le repli global — « Plat compose, souvent gras ou fibreux, long a reduire
     en bouillie » — ne dit rien de l'aliment : c'est celui qu'un abricot frais
     recevait. Depuis que le repere est cite, plus aucun aliment n'y tombe.
     Les messages de categorie, eux, restent legitimes : ils nomment une
     famille. Attention en relisant : le message « Cuisine du monde » commence
     par les memes mots, d'ou la phrase entiere dans le motif. */
  test('aucun aliment ne tombe sur le repli global', () => {
    const REPLI = 'Plat composé, souvent gras ou fibreux, long à réduire en bouillie.';
    const orphelins = ALL.filter(f => gpLevel(f) === 3 && gpReason(f).includes(REPLI));
    assert.deepEqual(orphelins.map(f => f.n), []);
  });

  /* Tout aliment classe doit pouvoir dire pourquoi, et jamais rester muet. */
  test('chaque classement donne au moins une raison', () => {
    const muets = ALL.filter(f => { const r = gpReason(f); return !r.length || !r[0]; });
    assert.deepEqual(muets.map(f => f.n), []);
  });
});

describe('retirer un repas', () => {
  const repas = (id, nom) => ({ id, name: nom, time: new Date(), carbs: 30, ig: 50, icon: '🍽️' });

  test('le repas retire peut etre remis a sa place', () => {
    state.journal = [repas('a', 'Petit-dejeuner'), repas('b', 'Dejeuner'), repas('c', 'Diner')];
    const r = removeMeal('b');
    assert.ok(r);
    assert.equal(r.name, 'Dejeuner');
    assert.deepEqual(state.journal.map(m => m.id), ['a', 'c']);
    r.undo();
    /* Un push le remettrait a la fin : le dejeuner passerait apres le diner,
       et « annuler » n'annulerait pas vraiment. */
    assert.deepEqual(state.journal.map(m => m.id), ['a', 'b', 'c'], 'remis a son rang');
    state.journal = [];
  });

  test('le repas revient intact, pas reconstruit', () => {
    const m = repas('a', 'Tartines');
    state.journal = [m];
    removeMeal('a').undo();
    assert.equal(state.journal[0], m, 'meme objet : id, heure et source sont preserves');
    state.journal = [];
  });

  test('un identifiant inconnu ne retire rien', () => {
    state.journal = [repas('a', 'Pomme')];
    assert.equal(removeMeal('zzz'), null);
    assert.equal(state.journal.length, 1);
    state.journal = [];
  });
});

/* Sur Android, le bouton retour ferme la PWA quand il n'a rien a defaire.
   Une modale ouverte, un appui reflexe, et on est dehors avec le repas en
   cours de saisie. C'est le geste le plus courant du systeme. */
describe('bouton retour', () => {
  const remise = () => { navStack.length = 0; navigateur.reset(); go('home', true); };

  test('quitter l’accueil pose une entree, retour y ramene', () => {
    remise();
    go('food');
    assert.equal(curTab(), 'food');
    assert.equal(navigateur.profondeur(), 1, 'une entree posee');
    navigateur.retour();
    assert.equal(curTab(), 'home', 'retour ramene a l’accueil');
    assert.equal(navStack.length, 0);
  });

  /* Convention Android : retour ramene a l'ecran de depart, il ne rejoue pas
     tout le parcours entre onglets. */
  test('traverser trois onglets ne pose qu’une entree', () => {
    remise();
    go('food'); go('recipe'); go('tools');
    assert.equal(navigateur.profondeur(), 1, 'un seul cran, pas trois');
    navigateur.retour();
    assert.equal(curTab(), 'home');
  });

  test('revenir a l’accueil par la barre neutralise l’entree', () => {
    remise();
    go('food');
    go('home');
    assert.equal(curTab(), 'home');
    /* L'entree du navigateur reste — on ne peut pas la retirer sans reculer —
       mais elle ne doit plus rien defaire, et un seul appui doit suffire a
       sortir de l'app. */
    navigateur.retour();
    assert.equal(curTab(), 'home');
    assert.equal(navStack.length, 0, 'la pile de l’app est vide : le systeme reprend la main');
  });

  /* Le parcours qui a fait rejeter history.back() : liste de courses vers
     scanner, fiche produit vers onglet aliments. Un retour asynchrone
     retomberait sur l'ecran qui vient de s'ouvrir et le refermerait. */
  test('fermer un ecran pour en ouvrir un autre n’annule pas le second', () => {
    remise();
    go('food');                       // premier ecran
    go('home');                       // ferme : entree morte au sommet
    go('recipe');                     // ouvre dans la foulee
    assert.equal(curTab(), 'recipe', 'le second ecran reste ouvert');
    assert.equal(navigateur.profondeur(), 1, 'et l’entree morte a ete recyclee');
    navigateur.retour();
    assert.equal(curTab(), 'home', 'un seul appui ramene a l’accueil');
  });

  test('ouvrir et fermer en boucle ne fait pas gonfler l’historique', () => {
    remise();
    for (let i = 0; i < 20; i++) { go('food'); go('home'); }
    assert.equal(navigateur.profondeur(), 1,
      'sinon vingt allers-retours demanderaient vingt appuis pour sortir');
  });

  /* Sans pile a nous, retour appartient au systeme : c'est lui qui ferme
     l'app, et l'app ne doit pas l'en empecher. */
  test('a l’accueil, retour n’est pas intercepte', () => {
    remise();
    assert.equal(navigateur.profondeur(), 0);
    navigateur.retour();
    assert.equal(curTab(), 'home');
    assert.equal(navStack.length, 0);
  });

  /* Un ecran ferme par l'interface alors qu'il n'etait pas au sommet laisse
     une entree derriere lui. Elle doit s'absorber toute seule, sans faire
     perdre un appui a l'utilisateur ni bloquer la sortie. */
  test('une entree morte est absorbee sans rien afficher', () => {
    remise();
    go('food');
    pushNav({ k: 'modal', v: 'm-jamais-ouverte' });
    closeNav(navStack[navStack.length - 1]);   // ferme a la main, entree laissee derriere
    assert.equal(navigateur.profondeur(), 2);
    navigateur.retour();                        // un seul appui
    assert.equal(curTab(), 'home', 'le retour traverse l’entree morte d’un coup');
    assert.equal(navStack.length, 0, 'et la pile se vide entierement');
  });

  test('la pile de l’app suit celle du navigateur', () => {
    remise();
    go('food');
    assert.equal(navStack.length, navigateur.profondeur());
    navigateur.retour();
    assert.equal(navStack.length, navigateur.profondeur());
  });
});

describe('IG tracés', () => {
  test('la table est branchée et non vide', () => {
    assert.ok(IG_TRACE.size >= 50, `${IG_TRACE.size} valeurs tracées, attendu au moins 50`);
  });

  /* Une valeur tracée sans citation vaudrait exactement autant qu'un chiffre
     inventé : c'est la citation qui fait toute la différence. */
  test('chaque valeur tracée porte une citation complète', () => {
    for (const [cle, e] of IG_TRACE) {
      assert.ok(e.ig > 0 && e.ig <= 110, `${cle} : IG ${e.ig} hors bornes`);
      assert.ok(e.mesure, `${cle} : l'aliment mesuré n'est pas nommé`);
      const c = igCite(e);
      assert.ok(c, `${cle} : source « ${e.s} » introuvable`);
      for (const champ of ['a', 't', 'j', 'doi']) {
        assert.ok(c[champ], `${cle} : citation sans ${champ}`);
      }
    }
  });

  /* Une clé qui ne correspond à aucun aliment est du travail perdu et
     silencieux : la faute de frappe ne se verrait nulle part dans l'app. */
  test('aucune clé ne pointe dans le vide', () => {
    const noms = new Set(ALL.map(f => normalize(f.n)));
    const orphelines = [...IG_TRACE.keys()].filter(k => !noms.has(k));
    assert.deepEqual(orphelines, [], 'clés sans aliment correspondant');
  });

  test('la valeur publiée remplace bien celle saisie à la main', () => {
    const quinoa = ALL.find(f => normalize(f.n) === 'quinoa cuit');
    assert.ok(quinoa, 'le quinoa doit être dans la base');
    assert.equal(quinoa.ig, 53, 'la valeur héritée était 35, sans source');
    assert.ok(quinoa.igr, 'et la fiche doit pouvoir citer sa source');
  });

  test('un aliment hors table garde son IG indicatif, sans citation', () => {
    const sans = ALL.find(f => f.c > 0 && aIg(f.ig) && !f.igr);
    assert.ok(sans, 'la base doit garder des IG indicatifs');
    assert.equal(sans.igr, null);
  });
});

/* Une observation garde « écart ÷ charge attendue », et la charge attendue
   depend de l'IG en vigueur au moment du repas. Les 70 IG tracés ont change
   cette base sous les pieds des observations deja enregistrees. */
describe('reprise des observations apres correction d’un IG', () => {
  test('la table sait quels IG ont ete corriges', () => {
    assert.ok(IG_ORIG.size >= 10, `${IG_ORIG.size} IG corriges, attendu au moins 10`);
    assert.equal(IG_ORIG.get('quinoa cuit'), 35, 'la valeur d’origine reste connue');
    /* 16 des 70 valeurs tracées confirment la valeur héritée au point près.
       Celles-la n'ont rien a reprendre. */
    assert.equal(IG_ORIG.has('poire'), false, 'un IG inchange n’a rien a reprendre');
  });

  test('un rapport enregistre est ramene sur la nouvelle base', () => {
    store.del('glycia.igpersoVer');
    IGP.obs['quinoa cuit'] = [1.0, 0.5];
    IGP.obs['poire'] = [0.8];
    migrateIgPerso();
    /* Quinoa : 35 → 53. Le rapport avait ete calcule contre une charge plus
       petite, il doit donc retrecir dans le meme rapport. */
    assert.deepEqual(IGP.obs['quinoa cuit'], [round(35 / 53, 3), round(0.5 * 35 / 53, 3)]);
    assert.deepEqual(IGP.obs['poire'], [0.8], 'un aliment non corrige ne bouge pas');
    delete IGP.obs['quinoa cuit']; delete IGP.obs['poire'];
  });

  test('la reprise ne se rejoue pas au demarrage suivant', () => {
    store.del('glycia.igpersoVer');
    IGP.obs['quinoa cuit'] = [1.0];
    migrateIgPerso();
    const apres = IGP.obs['quinoa cuit'].slice();
    migrateIgPerso();
    assert.deepEqual(IGP.obs['quinoa cuit'], apres, 'deux passages diviseraient deux fois');
    delete IGP.obs['quinoa cuit'];
  });

  test('sans observation, la reprise ne fabrique rien', () => {
    store.del('glycia.igpersoVer');
    const avant = Object.keys(IGP.obs).length;
    migrateIgPerso();
    assert.equal(Object.keys(IGP.obs).length, avant);
  });
});

describe('capteur de glycémie', () => {
  const H = 3600e3;

  test('les lectures se complètent au lieu de se remplacer', () => {
    forgetGlucose();
    const t = Date.now() - 2 * H;
    mergeGlucose([{ t: new Date(t), mgdl: 100 }, { t: new Date(t + 5 * 60000), mgdl: 105 }]);
    mergeGlucose([{ t: new Date(t + 10 * 60000), mgdl: 110 }]);
    assert.equal(state.glucose.length, 3, 'LibreLinkUp ne rend que 12 h : la courbe doit s’accumuler');
    assert.deepEqual(state.glucose.map(p => p.mgdl), [100, 105, 110], 'et rester triée');
    forgetGlucose();
  });

  /* Un point relu d'un appel à l'autre ne doit pas doubler la courbe. */
  test('un même instant ne compte qu’une fois', () => {
    forgetGlucose();
    /* Aligné sur la minute : sinon les deux points tombent de part et d'autre
       d'une frontière une fois sur soixante, et le test clignote. */
    const t = Math.floor((Date.now() - H) / 60000) * 60000;
    mergeGlucose([{ t: new Date(t), mgdl: 100 }]);
    mergeGlucose([{ t: new Date(t + 900), mgdl: 101 }]);   // même minute, valeur réajustée
    assert.equal(state.glucose.length, 1);
    assert.equal(state.glucose[0].mgdl, 101, 'la dernière valeur connue gagne');
    forgetGlucose();
  });

  test('au-delà de 24 h, et dans le futur, les points tombent', () => {
    forgetGlucose();
    mergeGlucose([
      { t: new Date(Date.now() - 25 * H), mgdl: 100 },   // trop vieux
      { t: new Date(Date.now() + 2 * H), mgdl: 100 },    // horloge déréglée
      { t: new Date(Date.now() - H), mgdl: 120 },
      { t: new Date(Date.now() - H + 60000), mgdl: 0 },  // valeur impossible
      { t: new Date('n’importe quoi'), mgdl: 120 }
    ]);
    assert.equal(state.glucose.length, 1);
    assert.equal(state.glucose[0].mgdl, 120);
    forgetGlucose();
  });

  test('la courbe survit à un rechargement', () => {
    forgetGlucose();
    mergeGlucose([{ t: new Date(Date.now() - H), mgdl: 142 }]);
    state.glucose = [];
    restoreGlucose();
    assert.equal(state.glucose.length, 1);
    assert.equal(state.glucose[0].mgdl, 142);
    assert.ok(state.glucose[0].t instanceof Date, 'le JSON rend des nombres, pas des dates');
    forgetGlucose();
  });

  /* Une URL Nightscout posée avant l'arrivée des trois fournisseurs vaut
     choix : sans ça, les installations existantes perdraient leur courbe. */
  test('une installation Nightscout d’avant garde son capteur', () => {
    store.del('glycia.cgmProvider');
    assert.equal(cgmProvider(), '');
    store.set('glycia.nightscout', 'https://exemple.up.railway.app');
    assert.equal(cgmProvider(), 'nightscout');
    store.set('glycia.cgmProvider', 'librelinkup');
    assert.equal(cgmProvider(), 'librelinkup', 'le choix explicite prime');
    store.del('glycia.cgmProvider'); store.del('glycia.nightscout');
  });

  /* Abbott date en format américain sans fuseau. Lire « 3/7 » comme le 3 juillet
     décalerait toute la courbe de quatre mois. */
  test('les horodatages Abbott sont lus en UTC, mois d’abord', () => {
    assert.equal(worker.usDateToMs('3/7/2026 2:05:00 PM'), Date.UTC(2026, 2, 7, 14, 5, 0));
    assert.equal(worker.usDateToMs('12/31/2026 12:00:00 AM'), Date.UTC(2026, 11, 31, 0, 0, 0));
    assert.equal(worker.usDateToMs('12/31/2026 12:00:00 PM'), Date.UTC(2026, 11, 31, 12, 0, 0));
    assert.equal(worker.usDateToMs('7/29/2026 09:14:03'), Date.UTC(2026, 6, 29, 9, 14, 3));
    assert.equal(worker.usDateToMs('pas une date'), null);
    assert.equal(worker.usDateToMs(null), null);
  });

  test('une mesure Abbott devient un point, ou rien', () => {
    assert.deepEqual(
      worker.lluPoint({ FactoryTimestamp: '7/29/2026 09:14:03', ValueInMgPerDl: 118.6 }),
      { t: Date.UTC(2026, 6, 29, 9, 14, 3), mgdl: 119 }
    );
    assert.equal(worker.lluPoint({ FactoryTimestamp: '7/29/2026 09:14:03', ValueInMgPerDl: 0 }), null);
    assert.equal(worker.lluPoint({ ValueInMgPerDl: 118 }), null);
    assert.equal(worker.lluPoint(null), null);
  });

  test('une région inconnue retombe sur l’Europe', () => {
    assert.equal(worker.lluBase('fr'), 'https://api-fr.libreview.io');
    assert.equal(worker.lluBase('zz'), 'https://api-eu.libreview.io');
    assert.equal(worker.lluBase(undefined), 'https://api-eu.libreview.io');
  });
});

describe('liste de courses', () => {
  test('un produit Open Food Facts retrouve sa ligne de liste', () => {
    state.shoppingList = [{ name: 'Pâte à tartiner', bought: false }, { name: 'Riz blanc', bought: false }];
    assert.ok(matchShoppingItem('Pâte à tartiner — Nutella'));
    assert.ok(matchShoppingItem('Riz blanc long grain — Taureau Ailé'));
    assert.equal(matchShoppingItem('Coca-Cola'), undefined);
    state.shoppingList = [];
  });
});

describe('calculs de repas', () => {
  test('computeTotals pondère l’IG par les glucides', () => {
    const t = computeTotals([
      { q: 1, f: { n: 'a', g: 100, carb: 20, ig: 40 } },
      { q: 1, f: { n: 'b', g: 100, carb: 20, ig: 80 } }
    ]);
    assert.equal(t.carbs, 40);
    assert.equal(t.ig, 60);
  });
  test('assiette sans glucides : IG nul, pas de division par zéro', () => {
    const t = computeTotals([{ q: 1, f: { n: 'a', g: 100, carb: 0, ig: 0 } }]);
    assert.equal(t.carbs, 0);
    assert.equal(t.ig, 0);
  });
});

describe('intégrité de la base', () => {
  test('1042 aliments chargés', () => assert.equal(ALL.length, 1042));
  test('les valeurs restent dans des bornes plausibles', () => {
    for (const f of ALL) {
      assert.ok(f.n && f.n.length, 'nom manquant');
      assert.ok(f.c >= 0 && f.c <= 100, `${f.n} : glucides ${f.c}`);
      assert.ok(f.ig >= 0 && f.ig <= 110, `${f.n} : IG ${f.ig}`);
      assert.ok(f.kcal >= 0 && f.kcal <= 900, `${f.n} : ${f.kcal} kcal`);
      assert.ok(f.pw > 0 && f.pw <= 900, `${f.n} : portion ${f.pw} g`);
      if (f.lip !== undefined) assert.ok(f.lip >= 0 && f.lip <= 100, `${f.n} : lipides ${f.lip}`);
    }
  });
  test('les glucides ne dépassent pas ce que les calories permettent', () => {
    /* Les polyols des produits « sans sucre » comptent 2,4 kcal/g et non 4 :
       ils sont bien des glucides mais rapportent moins d'énergie. Le
       chewing-gum sans sucre, 60 g pour 160 kcal, est correct à ce titre. */
    const POLYOLS = /sans sucre|edulcor|polyol|light|allege/i;
    for (const f of ALL) {
      if (!f.kcal) continue;
      const parGramme = POLYOLS.test(f.n) ? 2.4 : 4;
      assert.ok(f.c * parGramme <= f.kcal * 1.35 + 20, `${f.n} : ${f.c} g pour ${f.kcal} kcal`);
    }
  });
  test('la provenance est exploitable quand elle est là', () => {
    const sources = ALL.filter(f => f.ciq != null);
    assert.ok(sources.length > 100, `${sources.length} aliments sourcés Ciqual`);
    for (const f of sources) {
      assert.equal(typeof f.ciq, 'number', `${f.n} : code ${f.ciq}`);
      assert.ok(f.ciq > 0 && Number.isInteger(f.ciq), `${f.n} : code ${f.ciq}`);
    }
  });
  test('aucun doublon de nom', () => {
    const vus = new Set();
    for (const f of ALL) {
      const k = normalize(f.n);
      assert.ok(!vus.has(k), `doublon : ${f.n}`);
      vus.add(k);
    }
  });
});
