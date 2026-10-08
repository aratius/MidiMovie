/* Project list page */
(function () {
  'use strict';
  const { t } = I18N;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const LOCALES = { en: 'en-US', zh: 'zh-CN', ja: 'ja-JP' };
  const MANUALS = [['en', 'English', 'manual/MidiMovie-manual-en.pdf'], ['zh', '中文', 'manual/MidiMovie-manual-zh.pdf'], ['ja', '日本語', 'manual/MidiMovie-manual-ja.pdf']];
  let projects = [];

  function toast(msg) { const e = $('toast'); e.textContent = msg; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { e.hidden = true; }, 3000); }
  function fmtDate(ts) { try { return new Date(ts).toLocaleString(LOCALES[I18N.lang] || 'en-US', { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
  const fmtMB = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.round(b / 1e6) + ' MB';
  function download(blob, name) { Save.file(blob, name); }
  const safe = (s) => (s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';

  function buildLang() {
    const host = $('langSwitch'); host.innerHTML = '';
    I18N.LANGS.forEach(L => {
      const b = el('button', null, L.label); b.type = 'button'; b.lang = L.htmlLang; b.setAttribute('aria-pressed', I18N.lang === L.id);
      b.addEventListener('click', () => I18N.setLang(L.id)); host.appendChild(b);
    });
  }
  function buildManual() {
    const host = $('manualLinks'); host.innerHTML = '';
    MANUALS.slice().sort((a, b) => (a[0] === I18N.lang ? -1 : 0) - (b[0] === I18N.lang ? -1 : 0)).forEach(([id, label, href]) => {
      const a = el('a', 'btn' + (id === I18N.lang ? ' primary' : ''), 'PDF · ' + label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.lang = id; host.appendChild(a);
    });
  }

  function render() {
    const grid = $('projGrid'); grid.innerHTML = '';
    if (!Store.available) { const m = $('homeMsg'); m.hidden = false; m.textContent = t('proj.noStorage'); }
    if (!projects.length) { grid.appendChild(el('div', 'empty', t('home.empty'))); }
    projects.sort((a, b) => b.updated - a.updated).forEach(p => grid.appendChild(card(p)));
  }
  function card(p) {
    const c = el('article', 'pj');
    const open = el('a', 'pj-open'); open.href = 'editor.html?p=' + encodeURIComponent(p.id); open.setAttribute('aria-label', t('home.open') + ': ' + p.name);
    const th = el('div', 'pj-thumb');
    if (p.thumb) { const img = el('img'); img.src = p.thumb; img.alt = ''; th.appendChild(img); } else th.appendChild(el('span', 'pj-nothumb', '♪'));
    open.appendChild(th);
    const body = el('div', 'pj-body');
    body.appendChild(el('div', 'pj-name', p.name));
    body.appendChild(el('div', 'pj-meta', t('home.layers', { n: p.layerCount || 0 }) + (p.videoName ? ' · ' + p.videoName : '')));
    body.appendChild(el('div', 'pj-meta', t('home.updated') + ' ' + fmtDate(p.updated)));
    open.appendChild(body);
    c.appendChild(open);
    const acts = el('div', 'pj-acts');
    const mk = (key, fn, cls) => { const b = el('button', 'btn small ' + (cls || 'ghost'), t(key)); b.type = 'button'; b.addEventListener('click', fn); acts.appendChild(b); };
    mk('home.rename', async () => { const n = prompt(t('home.renamePrompt'), p.name); if (n == null) return; p.name = n.trim() || p.name; p.updated = Date.now(); await Store.put(p); load(); });
    mk('home.duplicate', async () => { await Store.duplicate(p.id, p.name + ' ' + t('home.copy')); load(); });
    mk('home.backup', async (ev) => { const b = ev.currentTarget; b.disabled = true; toast(t('prj.packing')); try { const { blob, name } = await Backup.exportProject(p.id); download(blob, name); toast(t('prj.backupDone', { name, size: (blob.size / 1e6).toFixed(1) + ' MB' })); } catch (err) { console.error(err); toast(String(err && err.message || err)); } b.disabled = false; });
    mk('home.export', async () => { const r = await Store.get(p.id); if (!r || !r.data) { toast(t('exp.nothing')); return; } download(new Blob([JSON.stringify(Object.assign({ projectName: r.name }, r.data))], { type: 'application/json' }), safe(r.name) + '.midimovie.json'); });
    mk('home.delete', async () => { if (!confirm(t('home.deleteConfirm', { name: p.name }))) return; await Store.del(p.id); load(); }, 'danger');
    c.appendChild(acts);
    return c;
  }

  async function load() {
    try { projects = Store.available ? await Store.list() : []; } catch (e) { projects = []; }
    render(); storageInfo();
  }
  async function storageInfo() {
    const e = await Store.estimate(); const box = $('storageInfo');
    box.textContent = e && e.quota ? t('home.storage', { used: fmtMB(e.usage || 0), total: fmtMB(e.quota) }) : '';
  }
  async function create(name, data) {
    if (!Store.available) { toast(t('proj.noStorage')); return; }
    const id = Store.newId();
    await Store.put({ id, name: name || t('proj.untitled'), created: Date.now(), updated: Date.now(), layerCount: data ? data.layers.length : 0, videoName: '', thumb: null, data: data || null });
    Store.persist();
    location.href = 'editor.html?p=' + encodeURIComponent(id);
  }
  $('newBtn').addEventListener('click', () => create(t('proj.untitled')));
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    if (!Store.available) { toast(t('proj.noStorage')); return; }
    toast(t('home.importing'));
    try { const id = await Backup.importFile(f); Store.persist(); location.href = 'editor.html?p=' + encodeURIComponent(id); }
    catch (err) { console.error(err); toast(t('proj.invalid')); }
  });

  function renderAll() { buildLang(); buildManual(); I18N.applyStatic(); render(); storageInfo(); }
  I18N.onChange(renderAll);
  I18N.setLang(I18N.lang);
  load();
})();
