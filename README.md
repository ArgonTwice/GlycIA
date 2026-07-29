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
| 🩸 **Capteur de glycémie** | Nightscout, LibreLinkUp ou Dexcom : courbe des 24 h, réponse des 3 h sous chaque repas, et un IG recalculé sur tes propres relevés. Affichage seulement — jamais de dose, jamais d'alerte. |

## Installer

### En ligne
GitHub Pages est configuré : chaque `push` sur `main` déploie automatiquement.

Réglages → Pages → Source : **GitHub Actions**. Puis `https://argontwice.github.io/GlycIA/`

Sur mobile, « Ajouter à l'écran d'accueil » installe l'app en PWA : plein écran, et elle fonctionne hors ligne.

Sur Android, le bouton retour du système ferme un écran ouvert au lieu de quitter l'app : une modale d'abord, puis l'onglet en cours, et seulement ensuite l'app elle-même. Une exception assumée : en mode hypo, il ne fait rien — on en sort par un appui long de 2 secondes, et ce n'est pas le moment de sortir par accident.

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
| Index glycémique, 70 aliments courants | [Atkinson, Foster-Powell & Brand-Miller](https://doi.org/10.2337/dc08-1239), *International Tables of Glycemic Index and Glycemic Load Values*, Diabetes Care 31(12):2281-2283 | 2008 |
| Index glycémique, reste du noyau | **Indicatif, non tracé — voir ci-dessous** | — |
| Seuils IG (bas ≤ 55, moyen 56–69, élevé ≥ 70) | Convention internationale, [Atkinson & Brand-Miller 2021](https://ajcn.nutrition.org/article/S0002-9165(22)00494-4/fulltext) | 2021 |
| Repères fibres (25 g/j) et fruits-légumes (400 g/j) | [OMS, apports en glucides](https://www.who.int/news/item/17-07-2023-who-updates-guidelines-on-fats-and-carbohydrates) | 2023 |
| Repère sucres libres (< 10 % de l'apport) | [OMS, *Guideline: sugars intake for adults and children*](https://www.who.int/publications/i/item/9789241549028) | 2015 |
| Produits emballés scannés | [Open Food Facts](https://world.openfoodfacts.org/) (ODbL) | en ligne |
| Complément international | [FoodData Central](https://fdc.nal.usda.gov/), USDA | en ligne |

### Quatre niveaux de recherche

L'app cherche du moins cher au plus cher, et s'arrête dès qu'elle a de quoi répondre :

1. **`db.json`** — 1 042 aliments choisis, portions réalistes, chargé au démarrage.
2. **`ciqual.json`** — les 3 128 autres aliments de la table de l'ANSES, 196 Ko chargés en tâche de fond une fois la page affichée, donc sans peser sur l'affichage initial. Ils sont cherchables mais ne remplissent pas la liste par défaut : parcourir « Tout » donnerait sinon « Abricot au sirop, appertisé, non égoutté » avant les aliments courants. Ils ont leur propre catégorie 📗.
3. **`off-fr.json`** — les produits de supermarché vendus en France, extraits de l'export Open Food Facts et **classés par nombre de scans réels**. Chargé seulement quand la recherche dépasse les deux premiers niveaux. Le classement par scans est ce qui distingue une base utile d'une base volumineuse : ce sont les produits que les gens ont vraiment dans leur placard.
4. **Open Food Facts en ligne** — le reste du catalogue, par nom ou par code-barres. Les produits trouvés sont conservés, donc disponibles hors ligne ensuite.
5. **FoodData Central** — ~600 000 aliments, surtout américains, pour ce qui manque ailleurs. Fonctionne sans configuration via un quota partagé ; une [clé gratuite](https://fdc.nal.usda.gov/api-key-signup.html) lève la limite.

Les aliments venus des niveaux 2 à 5 n'ont pas d'IG : aucune de ces sources n'en publie, et la fiche affiche un tiret plutôt qu'un chiffre inventé.

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

### L'index glycémique : trois régimes, et la fiche dit toujours lequel

Ciqual ne publie pas d'index glycémique, et il n'existe **pas de base d'IG libre, exploitable par machine et faisant autorité**. Celle de l'[Université de Sydney](https://glycemicindex.com/) est un site de consultation sans export ; les tables publiées sont des suppléments d'article sous droits, non redistribuables dans un dépôt MIT. L'IG varie de surcroît d'un laboratoire à l'autre, avec la maturité, la cuisson et la personne — ces tables séparent elles-mêmes leurs valeurs « précises » de leurs « moins robustes ».

D'où trois régimes, visibles sur chaque fiche :

| | Aliments | Affichage |
|---|---|---|
| **Mesuré** | 70 | `53` — la fiche cite la publication, le journal, le DOI, et le nom exact de l'aliment testé |
| **Indicatif** | reste du noyau | `~53` — valeur héritée, arrondie, jamais confrontée à une table |
| **Inconnu** | 53 115 des bases étendues | `—` — aucune de ces sources ne publie d'IG |

**Les 70 valeurs mesurées** sont saisies à la main dans [`tools/ig-ref.mjs`](tools/ig-ref.mjs), une par une, chacune rattachée à sa publication et à l'aliment réellement mesuré (« Riz blanc cuit » → *White rice, boiled*). Ce n'est pas une copie de table : une valeur isolée est un fait, c'est la sélection et l'agencement d'une table entière qui sont protégés. Le rapprochement lui-même est écrit en clair, pour qu'il soit vérifiable et contestable.

Ces valeurs **remplacent** celles saisies à la main, et l'écart est instructif : quinoa 35 → 53, riz complet 50 → 68, patate douce 50 → 63, pommes de terre vapeur 65 → 78. Il va presque toujours dans le même sens — les valeurs héritées flattaient les aliments réputés « à IG bas ».

```bash
node tools/ig-ref.mjs           # couverture, recoupement et écarts, n'écrit rien
node tools/ig-ref.mjs --apply   # écrit la table IG_SRC dans db.json
```

**Ce que la citation garantit, et ce qu'elle ne garantit pas.** Elle dit d'où la valeur est censée venir. Elle ne dit pas qu'elle a été recopiée sans faute — et la distinction n'est pas theorique.

**36 des 69 valeurs sont recoupées** contre la table A1 de l'article elle-même. La table liste chaque étude séparément, puis une ligne « mean of N studies » quand il y en a plusieurs : c'est cette moyenne qui fait foi, une entrée isolée ne valant que pour son échantillon. Le pain blanc sort ainsi à 75 sur seize études, quand les entrées individuelles vont de 59 à 89.

**Deux corrections et un retrait en sont sortis.** La carotte crue passe de 16 à 35 et le pain pita de 57 à 68 — deux valeurs d'une table antérieure reprises sans vérification. La patate douce, elle, quitte la table des IG tracés : ses quatre entrées vont de 44 à 77 sans ligne de moyenne, et c'est précisément le cas que ce travail s'était donné pour règle d'écarter.

Un piège à connaître avant d'automatiser ce travail : la ligne de moyenne ne se rattache pas au groupe le plus proche. Chercher « Pita bread, white » puis prendre la première « mean of N studies » qui suit renvoie 44 — qui est la moyenne d'All-Bran, le groupe suivant. Il faut lire la fenêtre.

Les 33 restantes sont citées mais pas reconfrontées. Six d'entre elles ont une entrée de table qui ne concorde pas — pomme, orange, ananas, banane, raisin, lentilles vertes — et deux n'ont pas été localisées du tout. Toutes sont listées en tête de `tools/ig-ref.mjs`, à trancher plutôt qu'à corriger sur une lecture partielle.

```bash
node tools/ig-verifier.mjs --extraire tableA1.pdf > a1.txt   # la table n'est pas au dépôt : elle n'est pas redistribuable
node tools/ig-verifier.mjs a1.txt                            # fenêtres des valeurs restantes
```

L'outil rappelle les deux pièges qui coûtent cher : la colonne de gauche est l'IG sur base glucose, celle de droite sur base pain — les confondre fait passer une patate douce de 44 à 63 — et la ligne « mean of N studies » ne se rattache pas au groupe le plus proche dans le texte extrait. `node tools/audit-sources.mjs` donne le compte à chaque exécution. C'est un chantier ouvert, écrit comme tel plutôt que passé sous silence.

**L'IG indicatif** du reste du noyau est resté tel quel, et l'audit dit pourquoi s'en méfier : **82 % de ces valeurs sont des multiples de 5**, les plus fréquentes étant 60, 55, 50, 65, 45. Des mesures de laboratoire ne se distribuent pas ainsi. Elles restent vraisemblables, elles ne sont pas traçables — le `~` et le mot « indicatif » sont là pour ça.

**Aucun IG sur les bases étendues.** Une fonction `guessIG()` le devinait auparavant à partir de mots-clés du nom — « chocolat » → 60, « riz » → 68, sinon 55. Elle fabriquait un chiffre d'apparence mesurée pour chaque produit : un « Danette café » ressortait à IG 60 sans que personne n'ait jamais testé ce produit. Elle est supprimée.

La charge glycémique suit la même règle : elle n'est calculée que là où l'IG existe, et n'est dite « glycémique » plutôt qu'« indicative » que là où l'IG est mesuré.

### Le classement gastroparésie s'explique et se conteste

Chaque aliment écarté nomme le frein en cause et l'explique : ce que les lipides déclenchent dans le duodénum, pourquoi les fibres insolubles s'agglomèrent quand les contractions faiblissent, pourquoi le gaz occupe du volume là où le liquide, lui, sort normalement. **15 des 18 mécanismes citent leur source** — [recommandation ACG 2022](https://doi.org/10.14309/ajg.0000000000001874) sur la gastroparésie, et l'[essai contrôlé d'Olausson 2014](https://doi.org/10.1038/ajg.2013.453) sur le régime à petites particules. Les trois autres — la distension par le gaz, l'air avalé en mâchant, et le cas où rien ne tranche — n'en citent aucune, et le disent, plutôt que d'emprunter une référence qui parle d'autre chose.

Ces explications décrivent un fonctionnement digestif. Elles ne prescrivent rien et ne fixent aucun seuil : elles donnent de quoi comprendre un classement, et donc de quoi le contester.

```bash
node tools/audit-gastro.mjs   # relit les 1 043 classements, cherche l'incohérent
```

L'outil ne juge pas aliment par aliment — ce serait refaire la table à la main. Il vérifie des **règles de famille** : tout ce qui est alcoolisé doit être écarté pour l'alcool, tout ce qui pétille pour le gaz, et un jus filtré ne doit jamais l'être pour des peaux et des pépins qu'il n'a plus. C'est ainsi qu'on a vu que les boissons énergisantes, le kombucha, le panaché et le gin tonic passaient pour bien tolérés : aucun ne contient le mot « soda » ni le mot « alcool ».

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
