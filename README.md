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
2. **`ciqual.json`** — les 3 128 autres aliments de la table de l'ANSES, 196 Ko chargés en tâche de fond une fois la page affichée, donc sans peser sur l'affichage initial. Ils sont cherchables mais ne remplissent pas la liste par défaut : parcourir « Tout » donnerait sinon « Abricot au sirop, appertisé, non égoutté » avant les aliments courants. Ils ont leur propre catégorie 📗.
3. **`off-fr.json`** — les produits de supermarché vendus en France, extraits de l'export Open Food Facts et **classés par nombre de scans réels**. Chargé seulement quand la recherche dépasse les deux premiers niveaux. Le classement par scans est ce qui distingue une base utile d'une base volumineuse : ce sont les produits que les gens ont vraiment dans leur placard.
4. **Open Food Facts en ligne** — le reste du catalogue, par nom ou par code-barres. Les produits trouvés sont conservés, donc disponibles hors ligne ensuite.
5. **FoodData Central** — ~600 000 aliments, surtout américains, pour ce qui manque ailleurs. Fonctionne sans configuration via un quota partagé ; une [clé gratuite](https://fdc.nal.usda.gov/api-key-signup.html) lève la limite.

Les aliments venus des niveaux 2 à 5 portent un IG estimé, jamais mesuré : aucune de ces sources ne le publie, et la fiche le dit.

### Régénérer les bases étendues

```bash
node tools/export-ciqual.mjs      # ciqual.json, depuis le cache de l'audit

curl -sL https://static.openfoodfacts.org/data/fr.openfoodfacts.org.products.csv.gz \
  | node --max-old-space-size=4096 tools/import-off-fr.mjs --max=50000
```

L'export d'Open Food Facts pèse 1,2 Go compressé. Il n'est jamais écrit sur disque : décompressé et filtré au fil du téléchargement, avec élagage périodique pour borner la mémoire — une première version sans cette borne mourait à 165 000 produits.

### Licence des données

Open Food Facts est publié sous [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/) : attribution et partage à l'identique. `off-fr.json` en dérive et porte son attribution. La table Ciqual de l'ANSES et FoodData Central de l'USDA sont librement réutilisables.

`standalone.html` n'embarque que le noyau : sans serveur, les trois autres niveaux ne répondent pas.

Ciqual est aussi la source de [Gluci-Chek](https://www.accu-chek.fr/produits/application/gluci-chek), l'application de comptage de Roche : ce n'est pas une base concurrente, c'est la même référence.

### L'index glycémique est indicatif

Ciqual ne publie pas d'index glycémique, et aucune valeur d'IG de cette app n'est traçable jusqu'à une source. Une version antérieure de ce README citait les *International Tables of Glycemic Index 2021* — la vérification n'avait jamais été faite, la mention est retirée.

L'audit de la base est parlant : **82 % des IG sont des multiples de 5**, les valeurs les plus fréquentes étant 60, 55, 50, 65, 45. Des mesures de laboratoire ne se distribuent pas ainsi. Les valeurs sont vraisemblables — pomme 38, lentilles 30, banane 52 correspondent aux ordres de grandeur publiés — mais arrondies. Pour les aliments venus de Ciqual, d'Open Food Facts ou de l'USDA, l'IG est calculé par `guessIG()`, une heuristique à base de mots-clés.

C'est une limite du domaine, pas seulement de cette app : il n'existe pas de base d'IG libre, exploitable par machine et faisant autorité. Celle de l'[Université de Sydney](https://glycemicindex.com/) est un site de consultation sans export, les tables 2021 sont un supplément d'article sous droits. Et l'IG varie d'un laboratoire à l'autre, avec la maturité, la cuisson et la personne — ces tables séparent elles-mêmes leurs valeurs « précises » de leurs « moins robustes ».

L'IG est donc affiché préfixé d'un `~` et libellé **indicatif**. Il sert à comparer deux aliments, pas à calculer.

### Vérifier les valeurs

```bash
node tools/audit-ciqual.mjs          # rapport, n'écrit rien
node tools/audit-ciqual.mjs --apply  # aligne les valeurs sûres sur Ciqual
```

L'outil télécharge Ciqual, apparie les aliments par nom et signale les écarts. Il refuse les appariements douteux : un nom qui ressemble ne suffit pas (« Blanc d'œuf » s'apparie sinon à « Pain blanc »), l'état doit correspondre (le riz cru affiche trois fois les glucides du riz cuit) et les négations doivent concorder (« sans sucre » ≠ « sucré »). Les changements appliqués sont journalisés dans `tools/ciqual-corrections.json`.

### Ce que ces chiffres valent

Ce sont des **estimations**. Les valeurs de l'app décrivent l'aliment **prêt à manger**, pas cru — c'est ce qui compte dans une assiette, mais ça diffère de la ligne Ciqual correspondante pour tous les féculents. Recettes maison, marques et tailles de portion font varier le reste.

### D'où vient chaque chiffre

| | Aliments | Ce que c'est |
|---|---|---|
| Table Ciqual | **189** | Mesuré en laboratoire, code à l'appui, vérifiable en ligne |
| Valeur générique | **853** | Moyenne de catégorie — « Pizza margherita », « Big Mac », « Kebab » |
| Scanné | à la demande | Valeur déclarée sur le paquet, règlement UE 1169/2011 |

Chaque fiche affiche son état. Une valeur générique le dit et propose de scanner le paquet pour obtenir celle du produit réel.

Les 853 génériques ne sont pas dans Ciqual, qui ne couvre pas les plats de chaîne. `tools/audit-etiquettes.mjs` sait les rapprocher d'étiquettes Open Food Facts, mais **il n'est pas appliqué** : un code-barres désigne un produit précis, pas une catégorie, et l'accrocher à une ligne générique donnerait l'apparence d'une source sans en être une. L'outil et ses garde-fous restent au dépôt pour les cas où la correspondance est réellement univoque.

## Avertissement

GlycIA est un outil personnel de suivi, **pas un dispositif médical**. Les glucides, IG et CG affichés sont estimés et ne remplacent ni une glycémie mesurée, ni l'avis de ton équipe soignante.

L'application ne donne jamais de dose d'insuline ni de consigne médicale. En cas d'hypoglycémie sévère, de vomissements incoercibles ou de malaise : **15** (ou 112).

## Suite

[`ROADMAP.md`](ROADMAP.md) — spécifications prêtes à implémenter, par ordre de priorité.

## Licence

MIT — voir [LICENSE](LICENSE).
