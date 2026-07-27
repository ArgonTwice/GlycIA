# Proxy GlycIA — Cloudflare Worker

Garde la clé API côté serveur. Sans ça, une clé collée dans les réglages de l'app
est lisible par n'importe quel script de la page — acceptable sur ton téléphone,
pas si tu partages l'URL.

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
