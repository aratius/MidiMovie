// Cloudflare Worker: turns a paid Stripe Checkout into a signed MidiMovie Pro key (MMF1…, same format as gift keys).
// No database: the key id is derived from the Checkout Session id, so the same purchase always yields the same key.
//
// Secrets (wrangler secret put …):
//   STRIPE_RAK            restricted key (rk_…) with ONLY "Checkout Sessions: Read"
//   STRIPE_WEBHOOK_SECRET whsec_… of the webhook endpoint  <worker-url>/webhook
//   GIFT_PRIVATE_PEM      contents of ~/.midimovie/gift-private.pem  (same key pair as license-keys.mjs)
//   ADMIN_TOKEN           password for admin.html (issuing free gift keys); pick a long random string
//   RESEND_API_KEY        optional: emails the key to the buyer (otherwise only the success page shows it)
// KV namespace binding LICENSES: device registry (limits how many devices one key can be active on) + server-side revocations.
// Vars: DEVICE_LIMIT (default 3), SITE (e.g. https://aratius.github.io/MidiMovie/), FROM_EMAIL (optional), ALLOW_ORIGIN (https://aratius.github.io)
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function signKey(env, sessionId, name, opts) {
  opts = opts || {};
  const idBuf = await crypto.subtle.digest('SHA-256', enc.encode(sessionId));
  const id = opts.id || hex(idBuf).slice(0, 8);
  const now = Math.floor(Date.now() / 1000);
  const payload = b64u(enc.encode(JSON.stringify({ n: name || 'buyer', i: id, t: now, e: opts.days > 0 ? Math.floor(now + opts.days * 86400) : 0 })));
  const body = 'MMF1.' + payload;
  const der = Uint8Array.from(atob(env.GIFT_PRIVATE_PEM.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(body)); // WebCrypto = raw r||s (p1363)
  return body + '.' + b64u(sig);
}

async function getPaidSession(env, sessionId) {
  const mode = /^rk_live_|^sk_live_/.test(env.STRIPE_RAK || '') ? 'live' : 'test'; // a live Worker never accepts test sessions
  if (!new RegExp('^cs_' + mode + '_[A-Za-z0-9]+$').test(sessionId)) return null;
  const r = await fetch('https://api.stripe.com/v1/checkout/sessions/' + sessionId, { headers: { Authorization: 'Bearer ' + env.STRIPE_RAK } });
  if (!r.ok) return null;
  const s = await r.json();
  return s.payment_status === 'paid' || s.payment_status === 'no_payment_required' ? s : null;
}

async function verifyWebhook(env, raw, header) {
  const parts = Object.fromEntries((header || '').split(',').map((p) => p.split('=')));
  if (!parts.t || !parts.v1 || Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const k = await crypto.subtle.importKey('raw', enc.encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', k, enc.encode(parts.t + '.' + raw)));
  return mac.length === parts.v1.length && mac.split('').every((c, i) => c === parts.v1[i]); // length-checked compare
}

async function emailKey(env, to, name, key) {
  if (!env.RESEND_API_KEY || !to) return;
  const link = (env.SITE || '') + 'editor.html#gift=' + key;
  await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + env.RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject: 'MidiMovie Pro license / ライセンスキー',
      text: 'Thank you! Open this link to unlock Pro:\n' + link + '\n\nOr paste this key in the Pro dialog:\n' + key + '\n\nご購入ありがとうございます。上のリンクを開くだけで Pro が有効になります。' }),
  });
}


/* ---- device limit: a key can be active on at most DEVICE_LIMIT devices (default 3) ---- */
let _pub;
async function pubKey(env) {
  if (_pub) return _pub;
  const der = Uint8Array.from(atob(env.GIFT_PRIVATE_PEM.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
  const jwk = await crypto.subtle.exportKey('jwk', priv); delete jwk.d; jwk.key_ops = ['verify'];
  return (_pub = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));
}
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };
async function parseKey(env, key) {
  const m = /^MMF1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(key || '').replace(/\s+/g, ''));
  if (!m) return null;
  try {
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey(env), unb64u(m[2]), enc.encode('MMF1.' + m[1])))) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(m[1])));
  } catch (e) { return null; }
}
const json = (cors, status, o) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
async function deviceCall(req, env, cors, action) {
  if (!env.LICENSES) return json(cors, 500, { ok: false, error: 'noserver' });
  const b = await req.json().catch(() => ({}));
  const device = String(b.device || '').slice(0, 64);
  const pl = await parseKey(env, b.key);
  if (!pl || !pl.i || !/^[\w-]{8,64}$/.test(device)) return json(cors, 403, { ok: false, error: 'rejected' });
  const id = String(pl.i), limit = Math.max(1, +env.DEVICE_LIMIT || 3);
  if (pl.e && Date.now() / 1000 > pl.e) return json(cors, 403, { ok: false, error: 'expired' });
  if (await env.LICENSES.get('rev:' + id)) return json(cors, 403, { ok: false, error: 'revoked' });
  let list = []; try { list = JSON.parse((await env.LICENSES.get('dev:' + id)) || '[]'); } catch (e) { /* reset */ }
  const has = list.some((x) => x.d === device);
  if (action === 'deactivate') { list = list.filter((x) => x.d !== device); await env.LICENSES.put('dev:' + id, JSON.stringify(list)); return json(cors, 200, { ok: true }); }
  if (!has) {
    if (list.length >= limit) return json(cors, 409, { ok: false, error: 'limit', limit });
    list.push({ d: device, t: Date.now() });
  } else list = list.map((x) => (x.d === device ? { d: x.d, t: x.t, s: Date.now() } : x));
  await env.LICENSES.put('dev:' + id, JSON.stringify(list));
  return json(cors, 200, { ok: true, name: pl.n || '', exp: pl.e || 0, devices: list.length, limit });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/key' && req.method === 'GET') { // success page calls this with ?session_id=cs_…
      const s = await getPaidSession(env, url.searchParams.get('session_id') || '');
      if (!s) return new Response(JSON.stringify({ ok: false }), { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } });
      const key = await signKey(env, s.id, s.customer_details && s.customer_details.name);
      return new Response(JSON.stringify({ ok: true, key }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (url.pathname === '/issue' && req.method === 'POST') { // admin.html: issue a free gift key (needs ADMIN_TOKEN)
      const given = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      const [a, b] = await Promise.all([given, env.ADMIN_TOKEN || '\u0000never'].map((x) => crypto.subtle.digest('SHA-256', enc.encode(x))));
      if (!env.ADMIN_TOKEN || hex(a) !== hex(b)) return new Response(JSON.stringify({ ok: false }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
      const body = await req.json().catch(() => ({}));
      const name = String(body.name || 'friend').slice(0, 40), days = Math.max(0, Math.min(3650, +body.days || 0));
      const id = hex(crypto.getRandomValues(new Uint8Array(3)));
      const key = await signKey(env, id, name, { id, days });
      return new Response(JSON.stringify({ ok: true, key, id, name, days, link: (env.SITE || '') + 'editor.html#gift=' + key }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }
    if (req.method === 'POST' && (url.pathname === '/activate' || url.pathname === '/deactivate')) return deviceCall(req, env, cors, url.pathname.slice(1));
    if (url.pathname === '/revoke' && req.method === 'POST') { // admin.html: switch a key off for good (needs ADMIN_TOKEN)
      const given = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
      const [a, b] = await Promise.all([given, env.ADMIN_TOKEN || '\u0000never'].map((x) => crypto.subtle.digest('SHA-256', enc.encode(x))));
      if (!env.ADMIN_TOKEN || !env.LICENSES || hex(a) !== hex(b)) return json(cors, 401, { ok: false });
      const body = await req.json().catch(() => ({})); const id = String(body.id || '');
      if (!/^[\w-]{4,64}$/.test(id)) return json(cors, 400, { ok: false });
      if (body.undo) await env.LICENSES.delete('rev:' + id); else await env.LICENSES.put('rev:' + id, '1');
      return json(cors, 200, { ok: true, id, revoked: !body.undo });
    }
    if (url.pathname === '/webhook' && req.method === 'POST') {
      const raw = await req.text();
      if (!(await verifyWebhook(env, raw, req.headers.get('Stripe-Signature')))) return new Response('bad signature', { status: 400 });
      const ev = JSON.parse(raw);
      if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
        const s = await getPaidSession(env, ev.data.object.id); // re-fetch: fulfil only when really paid
        if (s) await emailKey(env, s.customer_details && s.customer_details.email, s.customer_details && s.customer_details.name, await signKey(env, s.id, s.customer_details && s.customer_details.name));
      }
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  },
};
