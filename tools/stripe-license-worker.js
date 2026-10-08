// Cloudflare Worker: turns a paid Stripe Checkout into a signed MidiMovie Pro key (MMF1…, same format as gift keys).
// No database: the key id is derived from the Checkout Session id, so the same purchase always yields the same key.
//
// Secrets (wrangler secret put …):
//   STRIPE_RAK            restricted key (rk_…) with ONLY "Checkout Sessions: Read"
//   STRIPE_WEBHOOK_SECRET whsec_… of the webhook endpoint  <worker-url>/webhook
//   GIFT_PRIVATE_PEM      contents of ~/.midimovie/gift-private.pem  (same key pair as license-keys.mjs)
//   RESEND_API_KEY        optional: emails the key to the buyer (otherwise only the success page shows it)
// Vars: SITE (e.g. https://aratius.github.io/MidiMovie/), FROM_EMAIL (optional), ALLOW_ORIGIN (https://aratius.github.io)
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function signKey(env, sessionId, name) {
  const idBuf = await crypto.subtle.digest('SHA-256', enc.encode(sessionId));
  const id = hex(idBuf).slice(0, 8);
  const payload = b64u(enc.encode(JSON.stringify({ n: name || 'buyer', i: id, t: Math.floor(Date.now() / 1000), e: 0 })));
  const body = 'MMF1.' + payload;
  const der = Uint8Array.from(atob(env.GIFT_PRIVATE_PEM.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(body)); // WebCrypto = raw r||s (p1363)
  return body + '.' + b64u(sig);
}

async function getPaidSession(env, sessionId) {
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) return null;
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

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*', 'Access-Control-Allow-Methods': 'GET', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (url.pathname === '/key' && req.method === 'GET') { // success page calls this with ?session_id=cs_…
      const s = await getPaidSession(env, url.searchParams.get('session_id') || '');
      if (!s) return new Response(JSON.stringify({ ok: false }), { status: 402, headers: { ...cors, 'Content-Type': 'application/json' } });
      const key = await signKey(env, s.id, s.customer_details && s.customer_details.name);
      return new Response(JSON.stringify({ ok: true, key }), { headers: { ...cors, 'Content-Type': 'application/json' } });
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
