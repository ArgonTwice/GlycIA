/**
 * GlycIA — proxy Anthropic + passerelle capteur de glycémie
 *
 * Deux routes, un seul but : que rien de secret ne transite par le navigateur.
 *
 *   POST /            → Anthropic. La clé API reste ici, en secret de Worker.
 *   POST /cgm         → LibreLinkUp et Dexcom. Le mot de passe Abbott et le
 *                       client_secret Dexcom restent ici ; le navigateur ne
 *                       garde qu'un jeton de session révocable.
 *
 * Lecture seule dans les deux cas. Aucune écriture chez le fournisseur, aucune
 * interprétation des mesures : le Worker normalise des points et s'arrête là.
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

    const body = await req.text();
    if (body.length > MAX_BODY) return json({ error: 'Requête trop volumineuse' }, 413, cors);

    let payload;
    try { payload = JSON.parse(body); } catch { return json({ error: 'JSON invalide' }, 400, cors); }

    if (new URL(req.url).pathname.replace(/\/+$/, '') === '/cgm') {
      try { return await cgm(payload, env, cors); }
      catch (e) { return json({ error: String((e && e.message) || e) }, 502, cors); }
    }

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'Clé absente côté serveur' }, 500, cors);
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

/* ==========================================================================
   Aiguillage capteur
   ========================================================================== */
async function cgm(p, env, cors) {
  const prov = String(p.provider || '');
  if (prov === 'librelinkup') return json(await llu(p, env), 200, cors);
  if (prov === 'dexcom')      return json(await dexcom(p, env), 200, cors);
  return json({ error: 'Fournisseur inconnu' }, 400, cors);
}

/* ==========================================================================
   LibreLinkUp — API non officielle mais stable de l'application Abbott.
   Elle attend les en-têtes du client Android ; sans eux elle répond 400.
   ========================================================================== */
const LLU_REGIONS = ['eu', 'eu2', 'fr', 'de', 'us', 'ca', 'ap', 'au', 'jp', 'ae', 'la', 'ru'];
const lluBase = r => `https://api-${LLU_REGIONS.includes(r) ? r : 'eu'}.libreview.io`;

function lluHeaders(token, accountId) {
  const h = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'product': 'llu.android',
    'version': '4.12.0',
    'cache-control': 'no-cache'
  };
  if (token)     h['authorization'] = 'Bearer ' + token;
  if (accountId) h['account-id'] = accountId;
  return h;
}

/* Les versions récentes exigent l'identifiant de compte haché en SHA-256 */
async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function lluFetch(url, opts) {
  const r = await fetch(url, opts);
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error('Réponse illisible du serveur Abbott'); }
  return j;
}

async function llu(p, env) {
  const act = String(p.action || '');

  if (act === 'login') {
    const email = String(p.email || '').trim();
    const pass  = String(p.password || '');
    if (!email || !pass) return { error: 'Identifiants manquants' };

    // Abbott répond parfois « va voir dans ta région » : on suit une seule fois.
    let region = p.region || 'eu';
    let j = await lluLogin(region, email, pass);
    if (j && j.data && j.data.redirect && j.data.region) {
      region = String(j.data.region);
      j = await lluLogin(region, email, pass);
    }

    if (j && j.status === 4) return { error: 'Abbott demande d\'accepter ses conditions : ouvre l\'application LibreLinkUp une fois, puis reviens.' };
    if (!j || j.status !== 0 || !j.data || !j.data.authTicket) return { error: 'Identifiants refusés par Abbott.' };

    const token = j.data.authTicket.token;
    const expires = (j.data.authTicket.expires || 0) * 1000;
    const accountId = await sha256hex(String(j.data.user && j.data.user.id || ''));

    const c = await lluFetch(lluBase(region) + '/llu/connections', { headers: lluHeaders(token, accountId) });
    const conns = (c && Array.isArray(c.data) ? c.data : []).map(x => ({
      patientId: x.patientId,
      name: [x.firstName, x.lastName].filter(Boolean).join(' ').trim() || 'Capteur'
    }));
    if (!conns.length) return { error: 'Aucun capteur partagé avec ce compte LibreLinkUp. Dans l\'app LibreLink, partage tes données avec ce compte.' };

    return { token, expires, accountId, region, connections: conns };
  }

  if (act === 'graph') {
    const { token, accountId, region, patientId } = p;
    if (!token || !patientId) return { error: 'Session incomplète' };
    const j = await lluFetch(
      `${lluBase(region)}/llu/connections/${encodeURIComponent(patientId)}/graph`,
      { headers: lluHeaders(token, accountId) }
    );
    if (!j || j.status !== 0 || !j.data) return { error: j && j.status === 2 ? 'expired' : 'Lecture refusée par Abbott.' };

    const rows = Array.isArray(j.data.graphData) ? j.data.graphData.slice() : [];
    const now = j.data.connection && j.data.connection.glucoseMeasurement;
    if (now) rows.push(now);
    return { points: rows.map(lluPoint).filter(Boolean) };
  }

  return { error: 'Action inconnue' };
}

const lluLogin = (region, email, password) => lluFetch(lluBase(region) + '/llu/auth/login', {
  method: 'POST', headers: lluHeaders(), body: JSON.stringify({ email, password })
});

/* Abbott date en format américain, sans fuseau : « 7/29/2026 10:23:45 AM ».
   FactoryTimestamp est en UTC, Timestamp en heure locale du capteur — on prend
   le premier, le seul dont on connaisse le fuseau avec certitude. */
function lluPoint(m) {
  if (!m) return null;
  const t = usDateToMs(m.FactoryTimestamp) ?? usDateToMs(m.Timestamp);
  const mgdl = Math.round(Number(m.ValueInMgPerDl != null ? m.ValueInMgPerDl : m.Value));
  return (t && isFinite(mgdl) && mgdl > 0) ? { t, mgdl } : null;
}

/* Point d'accroche des tests. Cloudflare ignore les exports nommés : seul
   `export default` sert au déploiement. Voir tools/test/. */
export const __test = { usDateToMs, lluPoint, lluBase };

function usDateToMs(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?: (AM|PM))?$/.exec(String(s || ''));
  if (!m) return null;
  let h = +m[4];
  if (m[7] === 'PM' && h < 12) h += 12;
  if (m[7] === 'AM' && h === 12) h = 0;
  return Date.UTC(+m[3], +m[1] - 1, +m[2], h, +m[5], +m[6]);
}

/* ==========================================================================
   Dexcom — OAuth 2. Le client_secret ne quitte jamais le Worker ; le
   navigateur ne détient que les jetons, révocables depuis le compte Dexcom.
   ========================================================================== */
const dexBase = env => env.DEXCOM_BASE || 'https://api.dexcom.com';

async function dexToken(env, form) {
  const r = await fetch(dexBase(env) + '/v2/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DEXCOM_CLIENT_ID,
      client_secret: env.DEXCOM_CLIENT_SECRET,
      ...form
    })
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) return { error: 'Dexcom a refusé la connexion.' };
  return {
    access: j.access_token,
    refresh: j.refresh_token,
    expires: Date.now() + (Number(j.expires_in) || 7200) * 1000
  };
}

async function dexcom(p, env) {
  const act = String(p.action || '');

  // L'app a besoin du client_id public pour construire l'écran de consentement
  if (act === 'config') {
    return {
      clientId: env.DEXCOM_CLIENT_ID || '',
      base: dexBase(env),
      configured: !!(env.DEXCOM_CLIENT_ID && env.DEXCOM_CLIENT_SECRET)
    };
  }

  if (!env.DEXCOM_CLIENT_ID || !env.DEXCOM_CLIENT_SECRET) return { error: 'Dexcom non configuré sur ce Worker.' };

  if (act === 'exchange') {
    if (!p.code || !p.redirect_uri) return { error: 'Code d\'autorisation manquant' };
    return dexToken(env, { code: String(p.code), redirect_uri: String(p.redirect_uri), grant_type: 'authorization_code' });
  }

  if (act === 'refresh') {
    if (!p.refresh) return { error: 'Jeton de rafraîchissement manquant' };
    return dexToken(env, { refresh_token: String(p.refresh), grant_type: 'refresh_token' });
  }

  if (act === 'egvs') {
    if (!p.access) return { error: 'Session incomplète' };
    // Dexcom veut des dates locales sans fuseau, et refuse une fenêtre > 24 h
    const end = new Date(), start = new Date(+end - 24 * 3600e3);
    const fmt = d => d.toISOString().slice(0, 19);
    const r = await fetch(
      `${dexBase(env)}/v3/users/self/egvs?startDate=${fmt(start)}&endDate=${fmt(end)}`,
      { headers: { authorization: 'Bearer ' + String(p.access) } }
    );
    if (r.status === 401) return { error: 'expired' };
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { error: 'Lecture refusée par Dexcom.' };

    const rows = Array.isArray(j.records) ? j.records : (Array.isArray(j.egvs) ? j.egvs : []);
    return {
      points: rows.map(e => {
        const t = Date.parse(String(e.systemTime || e.displayTime || '').replace(/Z?$/, 'Z'));
        const mgdl = Math.round(Number(e.value != null ? e.value : e.realtimeValue));
        return (isFinite(t) && isFinite(mgdl) && mgdl > 0) ? { t, mgdl } : null;
      }).filter(Boolean)
    };
  }

  return { error: 'Action inconnue' };
}
