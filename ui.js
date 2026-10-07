/* Editor secondary UI: modals (export / project / settings / shortcuts) and the sampler tab. */
(function () {
  'use strict';
  const { t } = I18N, MM = window.MM;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (n) => NN[n % 12] + (Math.floor(n / 12) - 1);
  const dB = (x) => isFinite(x) ? (Math.round(x * 10) / 10).toFixed(1).replace('-', '−') : '−∞';

  /* ---------- modals ---------- */
  function open(id) { const d = $(id); if (!d.open) d.showModal(); if (id === 'dlgExport') refreshExport(); if (id === 'dlgProject') { $('prjMsg').hidden = true; } }
  document.querySelectorAll('dialog.modal').forEach(d => {
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
  });
  $('btnExport').addEventListener('click', () => open('dlgExport'));
  $('layersExport').addEventListener('click', () => open('dlgExport'));
  $('btnProject').addEventListener('click', () => open('dlgProject'));
  $('btnSettings').addEventListener('click', () => open('dlgSettings'));
  $('btnHelp').addEventListener('click', () => open('dlgKeys'));

  /* ---------- shortcuts table ---------- */
  function renderKeys() {
    const rows = [
      ['Space', 'sc.play'], ['Esc', 'sc.stop'], ['Home', 'sc.home'],
      [', .', 'sc.frame'], ['⇧ + , .', 'sc.frame10'], ['← →', 'sc.arrows'],
      ['M', 'sc.marker'], ['[ ]', 'sc.markerJump'], ['Z X', 'sc.octave'],
      ['A W S E D F T G Y H U J K', 'sc.notes'],
      ['⌘/Ctrl + C · V · D', 'sc.copy'], ['⌘/Ctrl + A', 'sc.selAll'], ['⌘/Ctrl + Z · ⇧Z', 'sc.undo'],
      ['Delete', 'sc.del'], ['↑ ↓ ← →', 'sc.nudge'], ['?', 'sc.help']
    ];
    const host = $('keysTable'); host.innerHTML = '';
    rows.forEach(([k, key]) => { const r = el('div', 'krow'); const kk = el('span', 'kk'); k.split(' ').forEach(p => { kk.appendChild(p === '+' || p === '·' ? document.createTextNode(' ' + p + ' ') : el('kbd', null, p)); }); r.append(kk, el('span', null, t(key))); host.appendChild(r); });
  }

  /* ---------- export ---------- */
  const expMode = () => $('expLoud').value;
  function syncLoudUI() { const lufs = expMode() === 'lufs'; $('expTargetWrap').hidden = !lufs; $('expChips').hidden = !lufs; }
  $('expLoud').addEventListener('change', () => { syncLoudUI(); try { localStorage.setItem('midimovie.loud', expMode()); } catch (e) { /* ignore */ } });
  $('expTarget').addEventListener('change', () => { try { localStorage.setItem('midimovie.lufs', $('expTarget').value); } catch (e) { /* ignore */ } });
  document.querySelectorAll('#expChips [data-lufs]').forEach(b => b.addEventListener('click', () => { $('expTarget').value = b.dataset.lufs; $('expTarget').dispatchEvent(new Event('change')); }));
  try { const m = localStorage.getItem('midimovie.loud'), v = localStorage.getItem('midimovie.lufs'); if (m) $('expLoud').value = m; if (v) $('expTarget').value = v; } catch (e) { /* ignore */ }
  syncLoudUI();
  function refreshExport() {
    const has = MM.S.layers.some(l => l.notes.length);
    ['expMix', 'expStems', 'expMidi'].forEach(id => { $(id).disabled = !has; });
    $('expResult').hidden = true; syncLoudUI();
  }
  const busy = (on) => { ['expMix', 'expStems', 'expMidi'].forEach(id => { $(id).disabled = on || !MM.S.layers.some(l => l.notes.length); }); };
  const baseName = () => MM.safeName(MM.S.videoName || MM.P.name || 'midimovie');

  async function exportWav(layers, label) {
    layers = layers.filter(l => l.notes.length);
    if (!layers.length) { MM.toast(t('exp.nothing')); return; }
    const sr = parseInt($('expRate').value, 10), mode = expMode(), target = clamp(parseFloat($('expTarget').value) || -14, -40, -6);
    busy(true); MM.toast(t('exp.rendering'));
    try {
      const buf = await MM.renderAudio(layers, sr);
      const res = Loudness.process(buf, mode, { target, ceilingDb: -1 });
      const name = baseName() + '-' + MM.safeName(label) + '.wav';
      MM.download(Synth.encodeWav(buf, false), name);
      const txt = t('exp.measured', { lufs: dB(res.after.lufs), peak: dB(res.after.peakDb) }) + (mode !== 'off' ? ' · ' + t('exp.was', { lufs: dB(res.before.lufs), peak: dB(res.before.peakDb) }) : '');
      const box = $('expResult'); box.textContent = txt; box.hidden = false;
      MM.toast(t('exp.done', { name }) + ' — ' + t('exp.measured', { lufs: dB(res.after.lufs), peak: dB(res.after.peakDb) }));
    } catch (err) { console.error(err); MM.toast(String(err && err.message || err)); }
    finally { busy(false); }
  }
  async function exportStems() {
    const layers = MM.S.layers.filter(l => l.notes.length); if (!layers.length) { MM.toast(t('exp.nothing')); return; }
    const sr = parseInt($('expRate').value, 10); busy(true);
    try {
      const files = [];
      for (let i = 0; i < layers.length; i++) {
        MM.toast(t('exp.stemProgress', { i: i + 1, n: layers.length }));
        const buf = await MM.renderAudio([layers[i]], sr);
        files.push({ name: String(i + 1).padStart(2, '0') + '-' + MM.safeName(MM.layerLabel(layers[i])) + '.wav', blob: Synth.encodeWav(buf, false) });
      }
      const name = baseName() + '-stems.zip';
      MM.download(await Zip.write(files), name); MM.toast(t('exp.done', { name }));
    } catch (err) { console.error(err); MM.toast(String(err && err.message || err)); }
    finally { busy(false); }
  }
  function exportMidi(layers, label) {
    layers = (layers || MM.S.layers).filter(l => l.notes.length);
    if (!layers.length) { MM.toast(t('exp.nothing')); return; }
    const blob = MidiFile.encode(layers.map(l => ({ name: MM.layerLabel(l), notes: l.notes, bends: l.bends, offsetMs: l.offsetMs })), MM.S.markers, MM.P.name);
    const name = baseName() + '-' + MM.safeName(label || 'midi') + '.mid';
    MM.download(blob, name); MM.toast(t('exp.done', { name }));
  }
  $('expMix').addEventListener('click', () => exportWav(MM.S.layers.filter(MM.isAudible), 'mix'));
  $('expStems').addEventListener('click', exportStems);
  $('expMidi').addEventListener('click', () => exportMidi(null, 'all'));

  /* ---------- project: backup / restore / MIDI import ---------- */
  const prjMsg = (txt, kind) => { const b = $('prjMsg'); b.hidden = !txt; b.textContent = txt || ''; b.className = 'result' + (kind ? ' ' + kind : ''); };
  const fmtMB = (b) => (b / 1e6 >= 10 ? Math.round(b / 1e6) : (b / 1e6).toFixed(1)) + ' MB';
  $('prjBackup').addEventListener('click', async () => {
    const btn = $('prjBackup'); btn.disabled = true; prjMsg(t('prj.packing'));
    try {
      await MM.saveNow(true);
      const { blob, name } = await Backup.exportProject(MM.getPID());
      MM.download(blob, name); prjMsg(t('prj.backupDone', { name, size: fmtMB(blob.size) }), 'ok');
    } catch (err) { console.error(err); prjMsg(String(err && err.message || err), 'bad'); }
    finally { btn.disabled = false; }
  });
  $('prjRestore').addEventListener('click', () => $('prjRestoreFile').click());
  $('prjRestoreFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    prjMsg(t('prj.importing'));
    try { await MM.saveNow(true); const id = await Backup.importFile(f); prjMsg(t('prj.restored'), 'ok'); setTimeout(() => { location.href = 'editor.html?p=' + encodeURIComponent(id); }, 600); }
    catch (err) { console.error(err); prjMsg(t('proj.invalid'), 'bad'); }
  });
  $('prjMidi').addEventListener('click', () => $('midiFile').click());
  $('midiFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const r = MidiFile.decode(await f.arrayBuffer());
      if (!r.layers.length) { prjMsg(t('prj.midiEmpty'), 'bad'); return; }
      MM.importedLayers(r.layers.map(l => ({ name: l.name || f.name.replace(/\.[^.]+$/, ''), notes: l.notes, bends: l.bends })));
      r.markers.forEach(m => { if (!MM.S.markers.some(x => Math.abs(x.t - m.t) < 0.01)) MM.S.markers.push({ t: m.t, name: String(m.name || '').slice(0, 24) }); });
      MM.S.markers.sort((a, b) => a.t - b.t);
      prjMsg(t('prj.midiDone', { n: r.layers.length }), 'ok'); $('dlgProject').close(); MM.toast(t('prj.midiDone', { n: r.layers.length }));
    } catch (err) { console.error(err); prjMsg(t('prj.midiBad'), 'bad'); }
  });

  /* ---------- sampler ---------- */
  const sc = $('smpWave'), sg = sc.getContext('2d');
  let waveId = null, wavePeaks = null, drag = null;
  const cur = () => MM.S.inst.params;
  const curSample = () => { const id = cur().sampleId; return id && Sampler.meta.has(id) ? id : null; };
  const toneToPos = (c) => Math.round(1000 * Math.log(clamp(c, 200, 18000) / 200) / Math.log(90));
  const posToTone = (p) => 200 * Math.pow(90, p / 1000);
  function buildRootSel() {
    const sel = $('smpRoot'); sel.innerHTML = '';
    const o0 = el('option', null, t('smp.rootNone')); o0.value = -1; sel.appendChild(o0);
    for (let n = 24; n <= 96; n++) { const o = el('option', null, noteName(n) + (n === 60 ? '  (default)' : '')); o.value = n; sel.appendChild(o); }
  }
  function refreshSampler() {
    const list = $('smpList'); list.innerHTML = '';
    const all = Sampler.list();
    if (!all.length) list.appendChild(el('div', 'grid-empty', t('smp.empty')));
    all.forEach(s => {
      const b = el('button', 'smp-item', s.name); b.type = 'button'; b.setAttribute('aria-pressed', cur().sampleId === s.id);
      b.appendChild(el('span', 'dur mono', s.dur ? s.dur.toFixed(1) + ' s' : ''));
      b.addEventListener('click', () => chooseSample(s.id)); list.appendChild(b);
    });
    syncDetail();
  }
  function syncDetail() {
    const id = curSample(), box = $('smpDetail'); box.hidden = !id; if (!id) return;
    const p = cur(), m = Sampler.meta.get(id);
    $('smpName').textContent = m.name; $('smpDur').textContent = m.dur ? ' ' + m.dur.toFixed(2) + ' s' : '';
    $('smpRoot').value = p.smpRoot; $('smpLoop').checked = !!p.smpLoop;
    $('smpAtk').value = p.attack; $('smpRel').value = p.release; $('smpTone').value = toneToPos(p.cutoff); $('smpRev').value = p.reverb; $('smpGain').value = p.gain;
    loadWave(id);
  }
  async function loadWave(id) {
    if (waveId !== id || !wavePeaks) { await Sampler.ensure(id); waveId = id; wavePeaks = Sampler.peaks(id, 400); }
    drawWave();
  }
  function drawWave() {
    const id = curSample(); if (!id) return;
    const dpr = window.devicePixelRatio || 1, W = sc.clientWidth || 300, H = 86;
    if (sc.width !== Math.round(W * dpr)) { sc.width = Math.round(W * dpr); sc.height = Math.round(H * dpr); }
    sg.setTransform(dpr, 0, 0, dpr, 0, 0); sg.clearRect(0, 0, W, H);
    sg.fillStyle = '#0b0c0f'; sg.fillRect(0, 0, W, H);
    const buf = Synth.samples.get(id); const dur = buf ? buf.duration : 1, p = cur();
    const st = p.smpStart || 0, en = p.smpEnd > 0 ? p.smpEnd : dur;
    if (wavePeaks) {
      sg.fillStyle = '#ff7a45'; const n = wavePeaks.length;
      for (let x = 0; x < W; x++) { const a = wavePeaks[Math.min(n - 1, Math.floor(x / W * n))], h = Math.max(1, a * (H - 8)); sg.globalAlpha = (x / W * dur >= st && x / W * dur <= en) ? 1 : 0.25; sg.fillRect(x, (H - h) / 2, 1, h); }
      sg.globalAlpha = 1;
    }
    const xs = st / dur * W, xe = en / dur * W;
    sg.fillStyle = '#ffb347'; sg.fillRect(xs - 1, 0, 2, H); sg.fillRect(xe - 1, 0, 2, H);
    sg.beginPath(); sg.moveTo(xs, 0); sg.lineTo(xs + 8, 0); sg.lineTo(xs, 9); sg.fill(); sg.beginPath(); sg.moveTo(xe, 0); sg.lineTo(xe - 8, 0); sg.lineTo(xe, 9); sg.fill();
    sg.fillStyle = '#8b92a3'; sg.font = '10px ui-monospace, Menlo, monospace'; sg.textBaseline = 'bottom';
    sg.fillText(st.toFixed(2), Math.min(W - 44, xs + 4), H - 3); sg.textAlign = 'right'; sg.fillText(en.toFixed(2), Math.max(44, xe - 4), H - 3); sg.textAlign = 'left';
  }
  function waveX(e) { const r = sc.getBoundingClientRect(), buf = Synth.samples.get(curSample()), dur = buf ? buf.duration : 1; return clamp((e.clientX - r.left) / r.width, 0, 1) * dur; }
  sc.addEventListener('pointerdown', (e) => {
    const id = curSample(); if (!id) return; const buf = Synth.samples.get(id); if (!buf) return;
    sc.setPointerCapture(e.pointerId); const p = cur(), x = waveX(e), st = p.smpStart || 0, en = p.smpEnd > 0 ? p.smpEnd : buf.duration;
    drag = Math.abs(x - st) <= Math.abs(x - en) ? 'start' : 'end'; moveHandle(x);
  });
  function moveHandle(x) {
    const buf = Synth.samples.get(curSample()); if (!buf) return; const p = cur(), dur = buf.duration, min = 0.01;
    if (drag === 'start') p.smpStart = clamp(x, 0, (p.smpEnd > 0 ? p.smpEnd : dur) - min);
    else p.smpEnd = clamp(x, (p.smpStart || 0) + min, dur);
    drawWave();
  }
  sc.addEventListener('pointermove', (e) => { if (drag) moveHandle(waveX(e)); });
  const waveUp = () => { if (!drag) return; drag = null; MM.liveUpdate(); MM.auditionNote(false); };
  sc.addEventListener('pointerup', waveUp); sc.addEventListener('pointercancel', waveUp);

  async function chooseSample(id) {
    await Sampler.ensure(id);
    const prev = cur(); let p;
    if (prev.sampleId === id) p = prev;
    else p = Object.assign({}, Synth.BASE, { wave1: 'off', wave2: 'off', noise: 0, sampleId: id, smpStart: 0, smpEnd: 0, smpRoot: 60, smpLoop: 0, attack: 0.002, decay: 0.3, sustain: 1, release: 0.15, cutoff: 18000, resonance: 0.7, keytrack: 0, fEnv: 0, reverb: 0.1, gain: 0.8 });
    MM.setInstrument(p, 'smp:' + id); refreshSampler(); MM.auditionNote(false);
  }
  const edit = (fn) => () => { fn(cur()); MM.liveUpdate(); };
  $('smpRoot').addEventListener('change', (e) => { cur().smpRoot = parseInt(e.target.value, 10); MM.liveUpdate(); MM.auditionNote(false); });
  $('smpLoop').addEventListener('change', (e) => { cur().smpLoop = e.target.checked ? 1 : 0; MM.liveUpdate(); });
  $('smpAtk').addEventListener('input', edit(p => { p.attack = parseFloat($('smpAtk').value); }));
  $('smpRel').addEventListener('input', edit(p => { p.release = parseFloat($('smpRel').value); }));
  $('smpTone').addEventListener('input', edit(p => { p.cutoff = Math.round(posToTone(parseFloat($('smpTone').value))); }));
  $('smpRev').addEventListener('input', edit(p => { p.reverb = parseFloat($('smpRev').value); }));
  $('smpGain').addEventListener('input', edit(p => { p.gain = parseFloat($('smpGain').value); }));
  $('smpPlay').addEventListener('click', () => MM.auditionNote(false));
  $('smpRename').addEventListener('click', async () => { const id = curSample(); if (!id) return; const n = prompt(t('smp.renamePrompt'), Sampler.meta.get(id).name); if (n == null || !n.trim()) return; await Sampler.rename(id, n.trim()); refreshSampler(); MM.renderLayers(); MM.syncInstrumentUI(); });
  $('smpDelete').addEventListener('click', async () => {
    const id = curSample(); if (!id || !confirm(t('smp.deleteConfirm', { name: Sampler.meta.get(id).name }))) return;
    await Sampler.remove(id); MM.setInstrument(PresetLib.get('grandPiano').params, 'grandPiano'); refreshSampler(); MM.renderLayers();
  });

  async function addFiles(files) {
    let first = null;
    for (const f of files) {
      try { const id = await Sampler.add(f, f.name.replace(/\.[^.]+$/, ''), f.name); if (!first) first = id; }
      catch (err) { console.error(err); MM.toast(t('smp.decodeFail', { name: f.name })); }
    }
    refreshSampler(); if (first) chooseSample(first);
  }
  $('smpAdd').addEventListener('click', () => $('smpFile').click());
  $('smpFile').addEventListener('change', (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) addFiles(fs); });
  let mic = null, micTimer = null;
  $('smpMic').addEventListener('click', async () => {
    const btn = $('smpMic');
    if (mic) { clearInterval(micTimer); const m = mic; mic = null; btn.textContent = t('smp.mic'); btn.classList.remove('rec-on'); try { const blob = await m.stop(); const id = await Sampler.add(blob, t('smp.micName') + ' ' + new Date().toLocaleTimeString().replace(/[: ]/g, '.'), 'mic.webm'); refreshSampler(); chooseSample(id); } catch (err) { console.error(err); MM.toast(t('smp.decodeFail', { name: 'mic' })); } return; }
    try { mic = await Sampler.startMic(); } catch (err) { MM.toast(t('smp.micDenied')); return; }
    const t0 = performance.now(); btn.classList.add('rec-on');
    micTimer = setInterval(() => { const s = (performance.now() - t0) / 1000; btn.textContent = '■ ' + t('smp.stop') + ' ' + s.toFixed(1) + ' s'; if (s >= 30) btn.click(); }, 100);
  });
  $('smpVideo').addEventListener('click', async () => {
    if (!MM.S.videoUrl) { MM.toast(t('smp.noVideo')); return; }
    const btn = $('smpVideo'); btn.disabled = true; MM.toast(t('smp.extracting'));
    try { const blob = await (await fetch(MM.S.videoUrl)).blob(); const id = await Sampler.fromVideo(blob, (MM.S.videoName || 'Video') + ' (audio)'); refreshSampler(); chooseSample(id); }
    catch (err) { console.error(err); MM.toast(t('smp.videoFail')); }
    finally { btn.disabled = false; }
  });
  function onSamplerShown() { Sampler.refresh().then(refreshSampler).catch(() => {}); }
  window.addEventListener('resize', () => { if (!$('tabSampler').hidden) drawWave(); });

  buildRootSel();
  function renderAll() { renderKeys(); buildRootSel(); if (curSample()) $('smpRoot').value = cur().smpRoot; refreshSampler(); if (!$('smpMic').classList.contains('rec-on')) $('smpMic').textContent = t('smp.mic'); }
  I18N.onChange(renderAll);
  renderAll();
  if (MM.S.tab === 'sampler') onSamplerShown();

  window.UI = { open, exportWav, exportMidi, refreshSampler, onSamplerShown };
})();
