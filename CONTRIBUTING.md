# Contribuer à GlycIA

Merci d'être là. Ce projet est né d'un besoin simple : suivre ses repas sans culpabiliser.

## Les retours qui valent le plus

**Les valeurs nutritionnelles fausses.** 1042 aliments saisis à la main, il y a forcément des erreurs.
Une ligne fausse dans `db.json` est plus utile à signaler qu'un bug d'affichage.

**Le vécu de la gastroparésie.** Le classement de tolérance repose sur des règles générales.
Si un aliment marqué ✅ ne passe jamais chez toi, dis-le : c'est exactement le genre de chose
qu'aucune table ne capture.

**Ce qui culpabilise.** Si une phrase de l'app te fait te sentir mal, c'est un bug. Signale-le comme tel.

## Ajouter ou corriger un aliment

Tout est dans `db.json`. Format :

```json
["Nom de l'aliment", glucides_100g, IG, kcal_100g, poids_portion_g, "libellé portion"]
```

Une source vérifiable dans la PR : étiquette du produit, table CIQUAL, ou fiche du fabricant.
Pas de valeur au jugé.

## Code

Pas de framework, pas de bundler, pas de dépendance npm. Vanilla JS, c'est volontaire.

```bash
node --check app.js
node build.mjs --check
python3 -m http.server 8000
git config core.hooksPath .githooks   # une fois
```

- `standalone.html` est **généré**. Ne jamais le modifier.
- Toute donnée alimentaire va dans `db.json`, jamais en dur dans `app.js`.
- Chaque appel réseau doit dégrader proprement : base locale en secours, jamais d'écran vide.
- Aucune clé API dans le code.

## La ligne rouge

GlycIA ne donne **jamais** de dose d'insuline ni de consigne médicale — ni dans le code,
ni dans les prompts envoyés à Claude. Une PR qui franchit cette ligne sera refusée,
même bien intentionnée. On parle d'assiettes, de textures et d'ordre des aliments. Rien d'autre.
