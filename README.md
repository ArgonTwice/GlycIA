<div align="center">

# GlycIA

**Assistant repas pour personnes diabétiques — type 1 et type 2.**
Plaisir de manger, zéro culpabilité, zéro charge mentale.

[Ouvrir l'application](https://argontwice.github.io/GlycIA/) · [Version sans serveur](https://argontwice.github.io/GlycIA/standalone.html)

</div>

---

## Ce que fait l'app

| | |
|---|---|
| 📷 **Analyser une assiette** | Photo → aliments reconnus, glucides, IG, charge glycémique. Portions ajustables au ½. Analyse par Claude si une clé est configurée, estimation locale sinon. |
| 🔎 **1 042 aliments** | Recherche instantanée, insensible aux accents. Fast-food, cuisine du monde, spécialités régionales, produits de marque. Glucides, IG, CG et calories par portion **et** pour 100 g. |
| 🌐 **~4 millions de produits** | Bascule automatique sur Open Food Facts quand la base locale ne suffit pas. Scan de code-barres inclus. |
| ⚖️ **Comparateur** | Jusqu'à 4 aliments côte à côte pour trancher entre riz basmati et purée. |
| 🍽️ **Plateau** | Empiler des aliments, ajuster les portions, enregistrer le tout comme repas ou favori. |
| 👨‍🍳 **Recettes à IG bas** | À partir d'une envie ou de restes du frigo. Checklist et étapes minutées. |
| 🌀 **Mode gastroparésie** | Échelle des textures en 3 phases, 78 aliments classés, 8 recettes adaptées, journal de tolérance — et un filtre global qui reclasse les 1 042 aliments par tolérance. |
| ⚡ **SOS Hypo** | Règle des 15 g et minuteur de 15 minutes. |
| 📍 **Restaurant** | Décryptage d'une carte collée, ou géolocalisation pour trouver les restos autour. |
| 📊 **7 derniers jours** | Graphe SVG des glucides, sans librairie. |

## Installer

### En ligne
GitHub Pages est configuré : chaque `push` sur `main` déploie automatiquement.

Réglages → Pages → Source : **GitHub Actions**. Puis `https://argontwice.github.io/GlycIA/`

Sur mobile, « Ajouter à l'écran d'accueil » installe l'app en PWA : plein écran, et elle fonctionne hors ligne.

### En local
```bash
git clone https://github.com/ArgonTwice/GlycIA.git
cd GlycIA
python3 -m http.server 8000
```
→ http://localhost:8000

`standalone.html` s'ouvre directement par double-clic, sans serveur.

## Fonctions IA

Analyse photo, décryptage de carte, recherche d'un aliment inconnu et restos alentour appellent l'API Anthropic.

**Sans clé, tout le reste fonctionne** : 1 042 aliments, calculs, recettes, gastroparésie, SOS hypo, journal, hors ligne compris.

Deux façons de les activer, dans ⚙️ **Réglages** :

**Option 1 — Proxy (recommandé).** Déploie le Cloudflare Worker fourni, colle son URL. La clé reste côté serveur, l'app devient partageable sans risque.

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler deploy
```

Détails dans [`worker/LISEZMOI.md`](worker/LISEZMOI.md). Plan gratuit Cloudflare : 100 000 requêtes/jour.

**Option 2 — Clé directe.** Colle une clé `sk-ant-…` dans les réglages.

> **Attention.** Elle reste dans le stockage local du navigateur et n'est envoyée qu'à `api.anthropic.com`, mais tout script de la page peut la lire. À réserver à ton propre appareil. Si tu partages l'URL, prends l'option 1.

## Structure

```
index.html        structure + CSS          68 Ko   seul bloquant du premier rendu
app.js            logique, module ES      101 Ko   différé
db.json           1042 aliments + données  71 Ko   en parallèle
sw.js             Service Worker            1 Ko
standalone.html   tout-en-un              234 Ko   généré, usage sans serveur
build.mjs         générateur du standalone
worker/           proxy Cloudflare (optionnel)
```

Aucune dépendance, aucun `npm install`. Vanilla JS, SVG inline, Google Fonts en seule ressource externe.

### standalone.html est généré, pas écrit

Il ne se modifie jamais à la main : `build.mjs` l'assemble depuis `index.html` + `app.js` + `db.json`.

```bash
node build.mjs           # régénère
node build.mjs --check    # échoue s'il est périmé
```

Le workflow le régénère à chaque push, vérifie sa syntaxe et le recommite s'il a changé — impossible qu'il diverge d'`app.js`.

En local, un hook fait la même chose avant chaque commit :

```bash
git config core.hooksPath .githooks
```

`push.ps1` le configure tout seul.

## Publier une version

```bash
git tag -a v1.0.0 -m "Première version"
git push origin v1.0.0
```

Le workflow `release.yml` crée la release et y attache `standalone.html` ainsi qu'une archive de la version modulaire.

## Données

### Sources

| Donnée | Source | Version |
|---|---|---|
| Glucides et calories aux 100 g | [Table Ciqual](https://ciqual.anses.fr/), ANSES — [doi:10.57745/RDMHWY](https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY) | 2025 (3 484 aliments) |
| Index glycémique | **Aucune source vérifiée — voir ci-dessous** | — |
| Seuils IG (bas ≤ 55, moyen 56–69, élevé ≥ 70) | Convention internationale, [Atkinson & Brand-Miller 2021](https://ajcn.nutrition.org/article/S0002-9165(22)00494-4/fulltext) | 2021 |
| Repères fibres, fruits et légumes, sucres libres | [OMS, apports en glucides](https://www.who.int/news/item/17-07-2023-who-updates-guidelines-on-fats-and-carbohydrates) | 2023 |
| Produits emballés scannés | [Open Food Facts](https://world.openfoodfacts.org/) (ODbL) | en ligne |
| Complément international | [FoodData Central](https://fdc.nal.usda.gov/), USDA | en ligne |

### Quatre niveaux de recherche

L'app cherche du moins cher au plus cher, et s'arrête dès qu'elle a de quoi répondre :

1. **`db.json`** — 1 042 aliments choisis, portions réalistes, chargé au démarrage.
2. **`ciqual.json`** — les 3 128 autres aliments de la table de l'ANSES, 196 Ko chargés à la demande. Pas au démarrage : le budget de poids de la page est déjà presque atteint.
3. **Open Food Facts** — les produits emballés, par nom ou par code-barres.
4. **FoodData Central** — ~600 000 aliments, surtout américains, pour ce qui manque ailleurs. Fonctionne sans configuration via un quota partagé ; une [clé gratuite](https://fdc.nal.usda.gov/api-key-signup.html) lève la limite.

Soit **4 170 aliments hors ligne** et plusieurs millions en ligne. Les aliments venus des niveaux 2 à 4 portent un IG estimé, jamais mesuré : aucune de ces tables ne le publie, et la fiche le dit.

`standalone.html` n'embarque que le noyau : sans serveur, les trois autres niveaux ne répondent pas.

Ciqual est aussi la source de [Gluci-Chek](https://www.accu-chek.fr/produits/application/gluci-chek), l'application de comptage de Roche : ce n'est pas une base concurrente, c'est la même référence.

### ⚠️ L'index glycémique n'est pas sourcé

Ciqual ne publie pas d'index glycémique, et **aucune valeur d'IG de cette app n'a été vérifiée contre une source**. Une version antérieure de ce README citait les *International Tables of Glycemic Index 2021* : c'était faux, la vérification n'avait jamais été faite.

Ce que dit l'audit de la base : **82 % des IG sont des multiples de 5**, et les valeurs les plus fréquentes sont 60, 55, 50, 65, 45. Des mesures de laboratoire ne se distribuent pas ainsi. Les valeurs sont vraisemblables — pomme 38, lentilles 30, banane 52 sont dans les ordres de grandeur publiés — mais elles sont **arrondies et non traçables**.

Pour les aliments venus de Ciqual, d'Open Food Facts ou de l'USDA, l'IG est carrément calculé par `guessIG()`, une heuristique à base de mots-clés.

Il n'existe pas de base d'IG libre, exploitable par machine et faisant autorité : celle de l'[Université de Sydney](https://glycemicindex.com/) est un site de consultation sans export, et les tables 2021 sont un supplément d'article sous droits, non redistribuable. Par ailleurs l'IG varie d'un laboratoire à l'autre, avec la maturité, la cuisson et la personne — les tables 2021 séparent elles-mêmes les valeurs « précises » des « moins robustes ».

**Ne fonde aucune décision sur l'IG affiché ici.** Les glucides, eux, sont sourcés.

### Vérifier les valeurs

```bash
node tools/audit-ciqual.mjs          # rapport, n'écrit rien
node tools/audit-ciqual.mjs --apply  # aligne les valeurs sûres sur Ciqual
```

L'outil télécharge Ciqual, apparie les aliments par nom et signale les écarts. Il refuse les appariements douteux : un nom qui ressemble ne suffit pas (« Blanc d'œuf » s'apparie sinon à « Pain blanc »), l'état doit correspondre (le riz cru affiche trois fois les glucides du riz cuit) et les négations doivent concorder (« sans sucre » ≠ « sucré »). Les changements appliqués sont journalisés dans `tools/ciqual-corrections.json`.

### Ce que ces chiffres valent

Ce sont des **estimations**. Les valeurs de l'app décrivent l'aliment **prêt à manger**, pas cru — c'est ce qui compte dans une assiette, mais ça diffère de la ligne Ciqual correspondante pour tous les féculents. Recettes maison, marques et tailles de portion font varier le reste.

### État réel du sourçage

| | Aliments | Source |
|---|---|---|
| Tracés | **189** | Table Ciqual, code à l'appui, vérifiable en ligne |
| Non vérifiés | **853** | Saisis à la main, source non retrouvée |

La fiche affiche l'état de chaque aliment sans le maquiller. Un aliment non vérifié le dit en rouge et renvoie vers le scan du paquet.

**Pourquoi les 853 restent non vérifiés.** Ce sont des entrées génériques — « Pizza margherita », « Big Mac », « Kebab sandwich ». Ciqual ne les couvre pas. `tools/audit-etiquettes.mjs` a tenté de les rapprocher des étiquettes d'Open Food Facts : ça trouve des correspondances, mais un code-barres désigne *un produit précis*, pas une catégorie. Attacher le code d'une pizza surgelée particulière à la ligne générique donnerait l'apparence d'une source sans en être une. L'outil est là, ses garde-fous sont documentés, et **il n'a pas été appliqué** — délibérément.

Pour ces aliments, la réponse honnête de l'app est son bouton principal : **scanne le paquet**. Le code-barres donne la valeur déclarée du produit que tu as réellement en main, sous le règlement UE 1169/2011.

## Avertissement

GlycIA est un outil personnel de suivi, **pas un dispositif médical**. Les glucides, IG et CG affichés sont estimés et ne remplacent ni une glycémie mesurée, ni l'avis de ton équipe soignante.

L'application ne donne jamais de dose d'insuline ni de consigne médicale. En cas d'hypoglycémie sévère, de vomissements incoercibles ou de malaise : **15** (ou 112).

## Suite

[`ROADMAP.md`](ROADMAP.md) — spécifications prêtes à implémenter, par ordre de priorité.

## Licence

MIT — voir [LICENSE](LICENSE).
