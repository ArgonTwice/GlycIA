# Feuille de route

Spécifications prêtes à implémenter. Chaque bloc est autonome : à donner tel quel
à Claude Code avec `CLAUDE.md`, sans avoir à re-déduire le contexte.

Ordre = priorité décroissante.

---

## 1. Capteur de glycémie — le seul vrai changement de nature

**Pourquoi.** L'app sait ce que tu manges, pas ce que ça produit. Sans la courbe réelle,
tout reste une estimation.

**Fait.** Les trois fournisseurs sont branchés : Nightscout en direct depuis le navigateur,
LibreLinkUp et Dexcom par la route `/cgm` du Worker. Courbe 24 h sur l'accueil, réponse des
3 h sous chaque repas, table d'IG personnelle. La courbe s'accumule localement, parce que
LibreLinkUp ne rend que les 12 dernières heures.

**Sources.** Dexcom a une API publique (OAuth 2, sandbox disponible).
Abbott expose LibreLinkUp, non officiel mais stable : `POST /llu/auth/login`
puis `GET /llu/connections/{id}/graph`. Nightscout couvre les bricoleurs, une seule URL suffit.

**Implémentation.**
- Réglages → « Connecter un capteur » : Dexcom (OAuth), LibreLinkUp (identifiants), Nightscout (URL).
- Les identifiants passent par le Worker, jamais stockés côté navigateur — étendre `worker/worker.js`
  avec une route `/cgm` sur le modèle de la route Anthropic existante.
- Nouvelle table dans le state : `glucose: [{t, mgdl}]`, fenêtre de 24 h.
- Sur chaque repas du journal, tracer la courbe des 3 h suivantes avec le même moteur SVG
  que `renderWeek()` — pic, delta, temps de retour à la base.

**Table d'IG personnelle.** Après ≥ 5 occurrences d'un même aliment, comparer le delta observé
au delta attendu (`glucides × IG / 100`). Le ratio donne un facteur correctif par aliment,
stocké dans `store` et appliqué dans `computeTotals()`. Afficher « IG chez toi : 48 (base : 55) ».
C'est la fonction que personne n'a.

**Ligne rouge.** Affichage et corrélation uniquement. Aucune suggestion de dose,
aucune alerte prédictive : ce sont des fonctions de dispositif médical.

---

## 2. Mode hypo

**Pourquoi.** C'est le moment où l'app sert le plus et où elle est la moins utilisable :
mains qui tremblent, vue brouillée, concentration en berne.

**Implémentation.** Un bouton dans la modale SOS bascule `body.hypo` :
- Taille de base 24 px, boutons ≥ 72 px de haut, 3 éléments à l'écran maximum.
- Contraste renforcé, animations coupées.
- `SpeechSynthesis` en `fr-FR` lit le protocole des 15 g puis le décompte à 10, 5 et 0 minute.
- Sortie du mode par un appui long de 2 s, pour éviter la sortie accidentelle.

Environ 80 lignes, dont 30 de CSS. Le meilleur rapport valeur/effort de la liste.

---

## 3. Échelle sur la photo

Ajouter à l'écran de capture : « Pose une carte bancaire ou une fourchette à côté de l'assiette ».
Puis dans `VISION_RULES()`, une consigne : si un objet de référence est visible
(carte bancaire = 85,6 × 54 mm, fourchette ≈ 19 cm, pièce de 2 € = 25,75 mm),
s'en servir pour calibrer les volumes et renvoyer `"echelle": true`.

Afficher un badge « volumes calibrés » quand c'est le cas. Divise l'erreur d'estimation par deux
pour trois lignes de prompt.

---

## 4. Onboarding de 30 secondes

Au premier lancement, 3 questions : type 1 ou 2 · traitement (insuline, oral, alimentaire) ·
gastroparésie oui/non. Stocker dans `store`, activer `state.gp` en conséquence,
ajuster le repère quotidien et le contexte envoyé à Claude dans `dayContext()`.

Aujourd'hui l'app démarre en configuration générique alors que ces trois réponses changent presque tout.

---

## 5. Saisie en 2 secondes

- **Widget** — Android via une TWA, iOS via un raccourci Siri. Une intention : « ajouter mon favori X ».
- **Web Share Target** dans le manifeste : partager une photo depuis la galerie ouvre directement l'analyse.
- **Notification programmable** aux heures de repas, avec les favoris en actions rapides.

La charge mentale, c'est le nombre de taps, pas la complexité de l'écran.

---

## 6. Compte-rendu pour la consultation

Un PDF sur 4 semaines : glucides par jour, répartition par moment, IG moyen, journal de tolérance
gastro, et 5 questions générées par Claude à partir des données. Génération côté client avec
l'API d'impression du navigateur et une feuille `@media print` — pas de librairie.

Les consultations durent 15 minutes. Arriver avec ça change la conversation.

---

## 7. Rétrospective hebdomadaire

Le dimanche, Claude relit la semaine et écrit 5 lignes : ce qui a bien marché, un motif récurrent,
une suggestion. Pas un bilan chiffré, un regard. Réutiliser `dayContext()` élargi à 7 jours,
avec les mêmes garde-fous de ton — jamais de score, jamais de reproche.

---

## 8. Modes situationnels

Ramadan (fractionnement inversé, repas nocturnes), sport d'endurance (glucides avant/pendant/après),
gastro-entérite (protocole de réhydratation), hospitalisation (export rapide pour l'équipe soignante).

Chacun bouleverse la gestion et aucune app ne les traite. Structure identique au mode gastroparésie :
un jeu de règles, un filtre, un jeu de recettes.

---

## 9. Liste de courses

Depuis les recettes et le plateau, groupée par rayon, avec substitutions à IG plus bas proposées
au moment d'acheter. C'est en magasin que la décision se prend, pas devant l'assiette.

---

## 10. Corrections d'aliments en boucle courte

Sur chaque fiche : « Cette valeur est fausse » → ouvre une issue GitHub pré-remplie via
`https://github.com/ArgonTwice/GlycIA/issues/new?template=valeur-incorrecte.yml&...`.
Une Action valide le format et ouvre la PR sur `db.json`. La base s'améliore sans intervention.

---

## 11. Multi-appareils sans serveur

Export chiffré du journal via WebCrypto (AES-GCM, clé dérivée d'une phrase de passe par PBKDF2),
sous forme de fichier ou de QR code. Import symétrique. Pas de compte, pas de serveur,
pas de RGPD à gérer.

---

---

## 12. Étendre les IG tracés

70 aliments courants portent un IG rattaché à sa publication (`tools/ig-ref.mjs`, table
`IG_SRC` de `db.json`). Le reste du noyau garde un IG indicatif, arrondi, non traçable.

Chaque valeur ajoutée demande la même chose : le nom de l'aliment tel qu'il est nommé dans
la publication, la publication elle-même, et un rapprochement qu'on puisse contester. Les
aliments dont les valeurs publiées divergent trop d'une étude à l'autre — le lait, le
chocolat noir, la banane très mûre, la courge — restent volontairement dehors : mieux vaut
un IG indicatif annoncé comme tel qu'un chiffre tracé qui ne tient pas.

`node tools/ig-ref.mjs` liste la couverture et les écarts avec les valeurs héritées.

---

## À ne pas faire

**Calcul de dose d'insuline.** Dispositif médical de classe IIb, marquage CE obligatoire,
responsabilité engagée. Le risque n'est pas théorique.

**Comptage de calories mis en avant.** Les données sont là et c'est utile en second plan,
mais en faire un objectif ramènerait exactement la culpabilité que l'app cherche à retirer.
Le principe fondateur passe avant la fonctionnalité.

**Objectifs, séries, badges.** La gamification transforme une maladie chronique en performance
à tenir. Pour quelqu'un qui vit avec ça tous les jours depuis vingt ans, c'est épuisant.
