/* node --test tools/test/
   Les fonctions testées sont celles de app.js, chargées telles quelles.
   Priorité aux régressions déjà survenues : elles sont annotées. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import api from './harness.mjs';

const {
  normalize, clamp, round, fmtQ, igLabel, guessIG, withBrand,
  gpLevel, gpReason, gpFat, gpRecipeLevel, gpRecipeReason,
  igKey, personalIg, mealResponse, matchShoppingItem,
  computeTotals, toGl, fmtDur, IGP, state, ALL
} = api;

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
  test('guessIG reste dans les bornes', () => {
    for (const [nom, c] of [['soda cola', 11], ['lentilles', 20], ['inconnu', 0], ['pain', 55]]) {
      const ig = guessIG(nom, c, 0, 0);
      assert.ok(ig >= 0 && ig <= 100, `${nom} -> ${ig}`);
    }
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
  test('aucun doublon de nom', () => {
    const vus = new Set();
    for (const f of ALL) {
      const k = normalize(f.n);
      assert.ok(!vus.has(k), `doublon : ${f.n}`);
      vus.add(k);
    }
  });
});
