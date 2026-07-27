/**
 * GlycIA — proxy Anthropic
 *
 * Sert un seul but : garder la clé API côté serveur. Le navigateur appelle
 * ce Worker, le Worker appelle Anthropic avec la clé stockée en secret.
 * L'app reste ainsi partageable sans exposer quoi que ce soit.
 */
const MAX_BODY = 6 * 1024 * 1024;   // 6 Mo : large pour une photo compressée
const UPSTREAM = 'https://api.anthropic.com/v1/messages';

export default {
  async fetch(req, env) {
    const allowed = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST')    return json({ error: 'POST uniquement' }, 405, cors);

    // Seule ton app peut appeler ce proxy
    const origin = req.headers.get('Origin') || '';
    if (allowed !== '*' && origin !== allowed) return json({ error: 'Origine non autorisée' }, 403, cors);

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Clé absente côté serveur' }, 500, cors);

    const body = await req.text();
    if (body.length > MAX_BODY) return json({ error: 'Requête trop volumineuse' }, 413, cors);

    let payload;
    try { payload = JSON.parse(body); } catch { return json({ error: 'JSON invalide' }, 400, cors); }
    payload.max_tokens = Math.min(payload.max_tokens || 1000, 2000);   // garde-fou sur le coût

    const r = await fetch(UPSTREAM, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });

    return new Response(r.body, {
      status: r.status,
      headers: { ...cors, 'content-type': 'application/json' }
    });
  }
};

const json = (o, status, cors) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'content-type': 'application/json' } });
