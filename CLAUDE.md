# GlycIA — instructions Claude Code

## Architecture
Application web sans build, sans dependance npm.

- `index.html` — structure + CSS integral dans `<style>`. Seul fichier bloquant le premier rendu.
- `app.js` — logique complete, module ES, IIFE async. Numerotation par sections 1 a 21.
- `db.json` — 1042 aliments, recettes, donnees gastroparesie. Charge par `fetch` au demarrage.
- `sw.js` — Service Worker : shell cache-first, Open Food Facts stale-while-revalidate.
- `standalone.html` — tout-en-un, utilisable sans serveur. A regenerer si `app.js` change.

## Suite du projet
Voir `ROADMAP.md` : chaque bloc est une specification autonome, prete a implementer.

## Regles
- Aucune dependance externe hors Google Fonts. Pas de framework, pas de bundler.
- Toute donnee alimentaire va dans `db.json`, jamais en dur dans `app.js`.
- Format aliment : `[nom, glucides/100g, IG, kcal/100g, poids portion, libelle portion]`.
- Les appels a api.anthropic.com passent tous par `aiHeaders()`. Jamais de cle en dur.
- Chaque fonction reseau doit degrader proprement : base locale en secours, jamais d'ecran vide.
- Zero contenu culpabilisant : c'est le principe de l'app. Pas de score, pas d'interdit.
- Jamais de dose d'insuline ni de consigne medicale, ni dans le code ni dans les prompts.

## Genere, ne pas editer
`standalone.html` est produit par `build.mjs`. Ne jamais le modifier a la main.
Le hook `.githooks/pre-commit` le regenere automatiquement (`git config core.hooksPath .githooks`).

## Verifications avant commit
```bash
node --check app.js
node -e "JSON.parse(require('fs').readFileSync('db.json','utf8'))"
node build.mjs --check
python3 -m http.server 8000   # tester sur localhost
```
