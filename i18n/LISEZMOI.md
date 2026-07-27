# Traduction

## État

Amorce, pas une internationalisation terminée. Ce qui est prêt :

- `translate.mjs` — génère `db.<lang>.json` depuis `db.json` par lots de 60, via l'API Anthropic.
  Les nombres ne sont jamais envoyés au modèle : seuls les libellés partent, les valeurs sont
  réinjectées depuis la source. Un lot désaligné fait échouer le script plutôt que de corrompre la base.
- `fr.json` — amorce des chaînes d'interface.

Ce qui reste : extraire d'`app.js` les libellés encore en dur, et brancher un `t()` dessus.
C'est le gros du travail, environ 300 chaînes.

## Générer une base traduite

```bash
ANTHROPIC_API_KEY=sk-ant-... node i18n/translate.mjs en
```

Compter une dizaine de minutes et quelques dizaines de centimes pour 1042 aliments.
Langues prévues : `en`, `es`, `de`, `it`, `pt`.

## Attention

Les valeurs de composition sont calées sur le marché français. Un « Big Mac » n'a pas la même
recette partout, et les tailles de portion varient beaucoup d'un pays à l'autre.
Une base traduite doit être relue localement avant d'être proposée comme référence.
