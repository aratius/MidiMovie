/* Optional Google Analytics 4 with consent. Does nothing until window.MM_ANALYTICS.gaId (license-config.js) is set.
   Consent Mode: storage is denied until the visitor accepts the small banner. Never sends videos, MIDI, audio, project data or license keys. */
(function () {
  var cfg = window.MM_ANALYTICS || {}, KEY = 'midimovie.consent', ready = false;
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  window.mmTrack = function (name, params) { try { if (ready && window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* ignore */ } };
  if (!/^G-[A-Z0-9]{6,}$/.test(cfg.gaId || '')) return;
  window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
  var saved = ls(KEY);
  gtag('consent', 'default', { analytics_storage: saved === 'granted' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('js', new Date()); gtag('config', cfg.gaId, { page_location: location.origin + location.pathname, page_referrer: '', anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + cfg.gaId; document.head.appendChild(s); ready = true;
  if (saved) return;
  var T = {
    en: { t: 'May we use Google Analytics (cookies) to see how MidiMovie is used? Your videos and music are never sent.', y: 'Accept', n: 'Decline', p: 'Privacy' },
    ja: { t: '利用状況の把握のため、Google アナリティクス（Cookie）を使ってもよいですか？ 映像や演奏データは送信されません。', y: '同意する', n: '拒否する', p: 'プライバシー' },
    zh: { t: '我们可以使用 Google Analytics（Cookie）来了解 MidiMovie 的使用情况吗？你的视频和音乐不会被发送。', y: '同意', n: '拒绝', p: '隐私' } };
  var l = (ls('midimovie.lang') || (navigator.language || 'en').slice(0, 2)); l = T[l] ? l : 'en';
  function show() {
    var d = T[l], b = document.createElement('div'); b.setAttribute('role', 'dialog');
    b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:560px;margin:0 auto;background:#1b1b1f;color:#eee;border:1px solid #333;border-radius:12px;padding:12px 14px;font:13px/1.5 system-ui,sans-serif;box-shadow:0 8px 30px #0008;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    var base = (document.currentScript && document.currentScript.src || '').replace(/analytics\.js.*$/, '') || '';
    b.innerHTML = '<span style="flex:1;min-width:200px">' + d.t + ' <a href="' + base + 'privacy.html" style="color:#ff9a70">' + d.p + '</a></span>';
    function btn(txt, v, primary) { var x = document.createElement('button'); x.textContent = txt; x.style.cssText = 'padding:7px 14px;border-radius:8px;border:0;font-weight:700;cursor:pointer;background:' + (primary ? '#ff7a45;color:#fff' : '#2a2a30;color:#ddd'); x.onclick = function () { ls(KEY, v); gtag('consent', 'update', { analytics_storage: v }); b.remove(); }; return x; }
    b.appendChild(btn(d.n, 'denied')); b.appendChild(btn(d.y, 'granted', true)); document.body.appendChild(b);
  }
  if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
})();
