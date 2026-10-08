/* MidiMovie Pro: one-time purchase licence (Lemon Squeezy licence keys, activated from the browser, cached locally).
   Honest-buyer protection only — nothing here pretends to be unbreakable. Inactive until license-config.js sets enforce: true. */
(function () {
  'use strict';
  const cfg = Object.assign({ enforce: false, storeId: 0, productIds: [], checkoutUrl: '', price: '', proxy: '', giftPublicKey: '', revoked: [] }, window.MM_LICENSE || {});
  const KEY = 'midimovie.license', API = (cfg.proxy || 'https://api.lemonsqueezy.com').replace(/\/$/, '') + '/v1/licenses/';
  const DAY = 864e5, GRACE = 60 * DAY, RECHECK = 7 * DAY;
  const tr = (k, v) => I18N.t(k, v);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const store = (v) => { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } };
  let lic = load();

  const b64d = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const device = () => { try { let d = localStorage.getItem('midimovie.device'); if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (x) => x.toString(16).padStart(2, '0')).join(''); localStorage.setItem('midimovie.device', d); } return d; } catch (e) { return 'nostorage-' + Math.random().toString(16).slice(2, 12); } };
  /* signed keys are also registered on the license server (tools/stripe-license-worker.js) so one key works on a limited number of devices */
  async function server(path, key) {
    try {
      const r = await fetch(cfg.keyApi.replace(/\/$/, '') + '/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, device: device() }) });
      const j = await r.json().catch(() => null);
      if (r.status === 404 || (j && j.error === 'noserver')) return { ok: true, legacy: true }; /* Worker without device registry yet: keep working */
      if (!j || (r.status >= 500)) return { ok: false, error: 'network' };
      return j;
    } catch (e) { return { ok: false, error: 'network' }; }
  }
  const signedOk = (l) => !!l && l.kind === 'signed' && (!l.exp || Date.now() / 1000 < l.exp) && cfg.revoked.indexOf(l.id) < 0 && (!cfg.keyApi || Date.now() - (l.checked || 0) < GRACE);
  const licensed = () => !!lic && (lic.kind === 'signed' ? signedOk(lic) : !!(lic.instanceId && Date.now() - (lic.checked || 0) < GRACE));
  const isPro = () => !cfg.enforce || (lic && lic.kind === 'signed' ? signedOk(lic) : !!(lic && lic.instanceId && Date.now() - (lic.checked || 0) < GRACE));
  /* gift keys (MMF1.<payload>.<signature>): signed offline with tools/license-keys.mjs, verified here with the public key — no server involved */
  async function activateSigned(key) {
    const m = /^MMF1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key); if (!m) return null;
    if (!cfg.giftPublicKey || !(window.crypto && crypto.subtle)) return { ok: false, error: 'rejected' };
    let pl; try {
      const pub = await crypto.subtle.importKey('raw', b64d(cfg.giftPublicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64d(m[2]), new TextEncoder().encode('MMF1.' + m[1])))) return { ok: false, error: 'rejected' };
      pl = JSON.parse(new TextDecoder().decode(b64d(m[1])));
    } catch (e) { return { ok: false, error: 'rejected' }; }
    const l = { key, kind: 'signed', id: String(pl.i || ''), name: String(pl.n || ''), exp: pl.e || 0, instanceId: 'offline', checked: Date.now(), since: Date.now() };
    if (cfg.revoked.indexOf(l.id) >= 0) return { ok: false, error: 'revoked' };
    if (l.exp && Date.now() / 1000 >= l.exp) return { ok: false, error: 'expired' };
    if (cfg.keyApi) { const r = await server('activate', key); if (!r.ok) return { ok: false, error: r.error || 'network' }; }
    lic = l; store(lic); refresh(); return { ok: true };
  }
  const metaOk = (m) => !!m && (!cfg.storeId || m.store_id === cfg.storeId) && (!cfg.productIds.length || cfg.productIds.indexOf(m.product_id) >= 0);
  async function post(path, params) {
    const res = await fetch(API + path, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
    let j = null; try { j = await res.json(); } catch (e) { /* not JSON */ }
    return j || { error: 'bad response (' + res.status + ')' };
  }
  const mask = (k) => k ? '••••' + String(k).slice(-4) : '';

  async function activate(key) {
    key = String(key || '').replace(/\s+/g, ''); if (!key) return { ok: false, error: 'empty' };
    const sg = await activateSigned(key); if (sg) return sg;
    let j; try { j = await post('activate', { license_key: key, instance_name: 'MidiMovie ' + Math.random().toString(36).slice(2, 7) }); } catch (e) { return { ok: false, error: 'network' }; }
    if (!j.activated || !j.instance) return { ok: false, error: 'rejected', detail: j.error || '' };
    if (!metaOk(j.meta)) { try { await post('deactivate', { license_key: key, instance_id: j.instance.id }); } catch (e) { /* ignore */ } return { ok: false, error: 'product' }; }
    lic = { key, instanceId: j.instance.id, checked: Date.now(), since: Date.now() }; store(lic); refresh(); return { ok: true };
  }
  async function deactivate() {
    if (lic && lic.kind === 'signed' && cfg.keyApi) { await server('deactivate', lic.key); }
    if (lic && lic.kind !== 'signed') { try { await post('deactivate', { license_key: lic.key, instance_id: lic.instanceId }); } catch (e) { /* offline: just forget it here */ } }
    lic = null; store(null); refresh();
  }
  /* periodic re-check: a refunded / disabled key stops working; being offline never locks anyone out within the grace period */
  async function recheck() {
    if (cfg.enforce && lic && lic.kind === 'signed' && cfg.keyApi && Date.now() - (lic.checked || 0) >= RECHECK) {
      const r = await server('activate', lic.key);
      if (r.ok) { lic.checked = Date.now(); store(lic); } else if (r.error !== 'network') { lic = null; store(null); refresh(); }
      return;
    }
    if (!cfg.enforce || !lic || lic.kind === 'signed' || Date.now() - (lic.checked || 0) < RECHECK) return;
    let j; try { j = await post('validate', { license_key: lic.key, instance_id: lic.instanceId }); } catch (e) { return; }
    if (j.valid && metaOk(j.meta)) { lic.checked = Date.now(); store(lic); }
    else if (j.valid === false || (j.license_key && j.license_key.status && j.license_key.status !== 'active' && j.license_key.status !== 'inactive')) { lic = null; store(null); refresh(); }
  }

  /* ---------- UI ---------- */
  let dlg = null, btn = null, why = '';
  const $ = (id) => dlg.querySelector(id);
  function build() {
    dlg = document.createElement('dialog'); dlg.className = 'modal'; dlg.id = 'dlgPro'; dlg.setAttribute('aria-labelledby', 'dlgProT');
    dlg.innerHTML = '<div class="modal-in narrow"><header class="modal-head"><h2 id="dlgProT">MidiMovie Pro</h2><button class="x" type="button" data-close aria-label="Close">×</button></header>' +
      '<div class="modal-body"><section class="msec" id="proWhy" hidden></section>' +
      '<section class="msec"><ul class="pro-list" id="proList"></ul><div class="pro-price" id="proPrice"></div>' +
      '<div class="btnrow"><a class="btn primary" id="proBuy" target="_blank" rel="noopener"></a></div></section>' +
      '<section class="msec" id="proKeySec"><h3 id="proKeyH"></h3><div class="btnrow"><input type="text" id="proKey" autocomplete="off" spellcheck="false" style="flex:1;min-width:0"><button class="btn" type="button" id="proAct"></button></div></section>' +
      '<section class="msec" id="proOnSec" hidden><div class="result ok" id="proOn"></div><div class="btnrow"><button class="btn ghost" type="button" id="proOff"></button></div></section>' +
      '<div class="result" id="proMsg" hidden></div></div></div>';
    document.body.appendChild(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    $('[data-close]').addEventListener('click', () => dlg.close());
    $('#proAct').addEventListener('click', async () => {
      const b = $('#proAct'); b.disabled = true; msg(tr('pro.checking'));
      const r = await activate($('#proKey').value); b.disabled = false;
      if (r.ok) { msg(tr('pro.thanks'), 'ok'); fill(); setTimeout(() => { if (dlg.open) dlg.close(); }, 1200); }
      else msg(tr(r.error === 'network' ? 'pro.errNetwork' : r.error === 'product' ? 'pro.errProduct' : r.error === 'empty' ? 'pro.errEmpty' : r.error === 'limit' ? 'pro.errLimit' : r.error === 'expired' ? 'pro.errExpired' : r.error === 'revoked' ? 'pro.errRevoked' : 'pro.errRejected') + (r.detail ? ' (' + r.detail + ')' : ''), 'bad');
    });
    $('#proKey').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#proAct').click(); });
    $('#proOff').addEventListener('click', async () => { await deactivate(); msg(tr('pro.removed'), 'ok'); fill(); });
  }
  function msg(txt, kind) { const m = $('#proMsg'); m.hidden = !txt; m.textContent = txt || ''; m.className = 'result' + (kind ? ' ' + kind : ''); }
  function fill() {
    const pro = isPro();
    $('#proWhy').hidden = !why || pro; $('#proWhy').textContent = why ? tr('pro.why', { feature: why }) : '';
    const ul = $('#proList'); ul.innerHTML = ''; ['pro.f1', 'pro.f2', 'pro.f3', 'pro.f4', 'pro.f5'].forEach(k => { const li = document.createElement('li'); li.textContent = tr(k); ul.appendChild(li); });
    $('#proPrice').textContent = cfg.price ? tr('pro.price', { price: cfg.price }) : '';
    const buy = $('#proBuy'); buy.textContent = tr('pro.buy'); buy.hidden = !cfg.checkoutUrl || pro; if (cfg.checkoutUrl) buy.href = cfg.checkoutUrl;
    $('#proKeyH').textContent = tr('pro.haveKey'); $('#proKey').placeholder = tr('pro.keyPh'); $('#proAct').textContent = tr('pro.activate');
    $('#proKeySec').hidden = pro; $('#proOnSec').hidden = !pro || !lic;
    $('#proOn').textContent = lic ? (lic.kind === 'signed' ? tr('pro.activeGift', { name: lic.name || mask(lic.id) }) : tr('pro.active', { key: mask(lic.key) })) : ''; $('#proOff').textContent = tr('pro.deactivate');
  }
  function open(feature) { if (!dlg) build(); why = feature ? tr('pro.feat.' + feature) : ''; msg(''); fill(); if (!dlg.open) dlg.showModal(); }
  function require(feature) { if (isPro()) return true; open(feature); return false; }
  function refresh() {
    document.documentElement.classList.toggle('not-pro', cfg.enforce && !isPro());
    const on = licensed();
    document.documentElement.classList.toggle('is-pro', on);
    document.title = document.title.replace(/ Pro$/, '') + (on ? ' Pro' : '');
    const h1 = document.querySelector('.home h1'); if (h1) { const b = h1.querySelector('.pro-badge'); if (on && !b) { const e = document.createElement('span'); e.className = 'pro-badge'; e.textContent = 'PRO'; h1.appendChild(e); } else if (!on && b) b.remove(); }
    const ll = document.querySelector('.brand .logo-link'); if (ll) { const b = ll.parentNode.querySelector('.pro-badge'); if (on && !b) { const e = document.createElement('span'); e.className = 'pro-badge'; e.textContent = 'PRO'; ll.after(e); } else if (!on && b) b.remove(); }
    if (btn) { btn.textContent = isPro() ? 'Pro ✓' : tr('pro.upgrade'); btn.classList.toggle('on', isPro()); btn.classList.toggle('upgrade', !isPro()); }
    syncBar();
  }
  /* upgrade funnel: a dismissible top bar and an occasional dialog, each shown at most once every 5 days */
  const EVERY = 5 * DAY, K_BAR = 'midimovie.proBar', K_POP = 'midimovie.proPop';
  const seen = (k) => { try { return +localStorage.getItem(k) || 0; } catch (e) { return 0; } };
  const mark = (k) => { try { localStorage.setItem(k, String(Date.now())); } catch (e) { /* ignore */ } };
  let bar = null;
  function syncBar() {
    const want = cfg.enforce && !licensed() && Date.now() - seen(K_BAR) > EVERY;
    if (!want) { if (bar) { bar.remove(); bar = null; } return; }
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'proBar'; bar.className = 'pro-bar';
      bar.innerHTML = '<span class="pro-bar-t"></span><button type="button" class="btn small primary pro-bar-go"></button><button type="button" class="pro-bar-x"></button>';
      bar.querySelector('.pro-bar-go').addEventListener('click', () => open(''));
      bar.querySelector('.pro-bar-x').addEventListener('click', () => { mark(K_BAR); syncBar(); });
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.querySelector('.pro-bar-t').textContent = tr('pro.bar', { price: cfg.price || '' });
    bar.querySelector('.pro-bar-go').textContent = tr('pro.barBtn');
    const x = bar.querySelector('.pro-bar-x'); x.textContent = '×'; x.title = tr('pro.barClose'); x.setAttribute('aria-label', tr('pro.barClose'));
  }
  function maybePopup() { /* editor only, after the person has had a moment to look around */
    if (!cfg.enforce || licensed() || !document.getElementById('btnExport') || Date.now() - seen(K_POP) < EVERY) return;
    setTimeout(() => { if (licensed() || document.querySelector('dialog[open]')) return; mark(K_POP); open(''); }, 45000);
  }
  async function fromLink() {
    const m = /[#&]gift=([\w.-]+)/.exec(location.hash); if (!m) return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    const r = await activate(m[1]).catch(() => ({ ok: false }));
    const l = (window.I18N && I18N.lang) || 'en', el = document.getElementById('toast');
    const msg = r && r.ok ? ({ ja: 'Pro を有効にしました。ありがとう!', zh: 'Pro 已启用。', en: 'Pro unlocked. Enjoy!' })[l] : (r && r.error === 'limit' ? tr('pro.errLimit') : { ja: 'このリンクは無効か期限切れです。', zh: '此链接无效或已过期。', en: 'This link is invalid or expired.' }[l]);
    if (el) { el.textContent = msg; el.hidden = false; setTimeout(() => { el.hidden = true; }, 4000); }
    refresh();
  }
  function init() {
    fromLink(); refresh();
    if (!cfg.enforce) return;
    const host = document.querySelector('.top-actions') || document.getElementById('langSwitch') && document.getElementById('langSwitch').parentNode, ex = document.getElementById('btnExport') || document.getElementById('langSwitch');
    if (host) { btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn small pro-btn'; btn.id = 'btnPro'; btn.addEventListener('click', () => open('')); host.insertBefore(btn, ex || host.firstChild); }
    refresh(); recheck(); maybePopup();
    if (window.I18N && I18N.onChange) I18N.onChange(() => refresh());
  }
  window.Pro = { cfg, isPro, licensed, require, open, activate, deactivate, refresh, recheck };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
