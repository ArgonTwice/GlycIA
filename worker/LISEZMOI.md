# Proxy GlycIA — Cloudflare Worker

Garde les secrets côté serveur : la clé Anthropic, et les identifiants de capteur
de glycémie. Sans ça, une clé collée dans les réglages de l'app est lisible par
n'importe quel script de la page — acceptable sur ton téléphone, pas si tu partages l'URL.

Deux routes :

| Route  | Rôle |
|--------|------|
| `POST /`    | Proxy Anthropic. La clé API reste ici. |
| `POST /cgm` | Capteurs LibreLinkUp et Dexcom. Le mot de passe Abbott et le `client_secret` Dexcom restent ici. |

La route `/cgm` est facultative : Nightscout se branche en direct depuis l'app,
sans Worker.

## Déployer

```bash
cd worker
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # colle la clé, elle n'apparaît nulle part ailleurs
npx wrangler deploy
```

Wrangler affiche l'URL déployée, du type `https://glycia-proxy.<toi>.workers.dev`.

Dans l'app : **⚙️ Réglages → Option 1 — Proxy**, coller cette URL. Laisser le champ clé vide.

## Ce que fait le Worker

- N'accepte que `POST` depuis l'origine déclarée dans `ALLOWED_ORIGIN`
- Refuse les corps de plus de 6 Mo
- Plafonne `max_tokens` à 2000, garde-fou contre une facture qui dérape
- Transmet la réponse d'Anthropic telle quelle, en streaming

## Brancher un capteur

### LibreLinkUp — rien à configurer

Aucun secret à poser : déployer le Worker suffit. Dans l'app, **Réglages → Capteur
de glycémie → LibreLinkUp**, saisir les identifiants du compte *LibreLinkUp*
(celui qui **reçoit** le partage, pas le compte LibreLink du capteur lui-même).

Le mot de passe part au Worker, qui le transmet à Abbott et n'en garde rien : seul
un jeton de session revient au navigateur. Ce jeton expire tout seul ; l'app
redemande alors le mot de passe.

Prérequis côté Abbott : depuis l'app LibreLink, partager ses données avec le compte
LibreLinkUp, et ouvrir l'app LibreLinkUp une fois pour accepter les conditions.
Sans ça, la connexion échoue avec un message explicite.

### Dexcom — OAuth, deux secrets

1. Créer une application sur [developer.dexcom.com](https://developer.dexcom.com),
   avec pour URL de redirection l'adresse exacte de ton déploiement
   (`https://argontwice.github.io/GlycIA/`).
2. Poser les deux secrets :

```bash
npx wrangler secret put DEXCOM_CLIENT_ID
npx wrangler secret put DEXCOM_CLIENT_SECRET
npx wrangler deploy
```

3. Pour tester sans capteur réel, décommenter `DEXCOM_BASE` dans `wrangler.toml`
   et pointer sur `https://sandbox-api.dexcom.com` : Dexcom fournit des comptes
   fictifs avec des courbes complètes.

L'app récupère `client_id` par `POST /cgm {provider:"dexcom",action:"config"}`,
construit l'écran de consentement, et renvoie le code d'autorisation au Worker,
qui seul détient le `client_secret`.

### Ce que la route `/cgm` ne fait pas

Lecture seule. Elle normalise des points `{t, mgdl}` et s'arrête là : aucune
écriture chez le fournisseur, aucune moyenne, aucun seuil, aucune interprétation.
Ces calculs-là sont des fonctions de dispositif médical.

## Coût

Le plan gratuit Cloudflare couvre 100 000 requêtes par jour. Pour un usage personnel,
c'est gratuit. Seuls les appels à l'API Anthropic sont facturés, comme d'habitude.

## Restreindre davantage

Pour du multi-utilisateur, ajouter un jeton partagé :

```js
if (req.headers.get('X-Glycia-Token') !== env.SHARED_TOKEN)
  return json({ error: 'Jeton invalide' }, 401, cors);
```

et poser `SHARED_TOKEN` en secret. Rate limiting : voir Cloudflare Rate Limiting Rules,
configurable depuis le tableau de bord sans toucher au code.
