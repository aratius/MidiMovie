// OPTIONAL. Only needed if the browser blocks calls from midimovie to api.lemonsqueezy.com (CORS).
// Deploy as a free Cloudflare Worker, then put its URL in license-config.js as `proxy`. It forwards only the three licence endpoints.
const ALLOWED_ORIGINS = ['https://aratius.github.io']; // add your own domain here
const ALLOWED_PATHS = ['/v1/licenses/activate', '/v1/licenses/validate', '/v1/licenses/deactivate'];
export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const cors = { 'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0], 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Vary': 'Origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (req.method !== 'POST' || !ALLOWED_PATHS.includes(url.pathname)) return new Response('Not found', { status: 404, headers: cors });
    const res = await fetch('https://api.lemonsqueezy.com' + url.pathname, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: await req.text() });
    return new Response(res.body, { status: res.status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors) });
  }
};
