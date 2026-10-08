/* MidiMovie service worker: network-first (always fresh when online), cached copy when offline. */
const CACHE = 'midimovie-v3j';
const SHELL = ['./', 'index.html', 'editor.html', 'style.css', 'i18n.js', 'save.js', 'license-config.js', 'pro.js', 'db.js', 'zip.js', 'midi-file.js', 'loudness.js', 'backup.js', 'synth.js', 'sampler.js', 'pitch.js', 'poly.js', 'video-export.js', 'trim.js', 'presets.js', 'app.js', 'ui.js', 'projects.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('editor.html') : undefined))));
});
