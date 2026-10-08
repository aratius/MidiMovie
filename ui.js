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
    ['expMix', 'expStems', 'expMidi'].forEach(id => { $(id).disabled = !has && !(id === 'expStems' && proLocked()); });
    $('expVideo').disabled = (!has || !MM.S.videoUrl) && !proLocked(); $('expVideoMsg').hidden = true;
    $('expResult').hidden = true; syncLoudUI();
  }
  const proLocked = () => document.documentElement.classList.contains('not-pro'); /* free users can still click Pro actions: the click opens the upgrade dialog */
  const busy = (on) => { ['expMix', 'expStems', 'expMidi'].forEach(id => { $(id).disabled = on || (!MM.S.layers.some(l => l.notes.length) && !(id === 'expStems' && proLocked())); }); $('expVideo').disabled = on || ((!MM.S.videoUrl || !MM.S.layers.some(l => l.notes.length)) && !proLocked()); };
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
    if (!Pro.require('stems')) return;
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
  async function exportVideo() {
    if (!Pro.require('video')) return;
    const msg = (txt, kind) => { const m = $('expVideoMsg'); m.hidden = !txt; m.textContent = txt || ''; m.className = 'result' + (kind ? ' ' + kind : ''); };
    if (!MM.S.videoUrl) { msg(t('exp.videoNeed'), 'bad'); return; }
    const layers = MM.S.layers.filter(MM.isAudible).filter(l => l.notes.length); if (!layers.length) { MM.toast(t('exp.nothing')); return; }
    const prog = $('expVideoProg'); busy(true); prog.hidden = false; prog.value = 0; msg('');
    try {
      const sr = parseInt($('expRate').value, 10), mode = expMode(), target = clamp(parseFloat($('expTarget').value) || -14, -40, -6);
      msg(t('exp.rendering'));
      const buf = await MM.renderAudio(layers, sr); Loudness.process(buf, mode, { target, ceilingDb: -1 });
      const src = await (await fetch(MM.S.videoUrl)).blob();
      const r = await VideoExport.mux(src, buf, (p) => { prog.value = p; msg(t('exp.videoWorking', { p: Math.round(p * 100) })); });
      const name = baseName() + '-scored.mp4';
      MM.download(r.blob, name); msg(t('exp.videoDone', { name, size: fmtMB(r.blob.size), codec: r.audioCodec.toUpperCase() }) + (r.audioCodec === 'opus' ? ' ' + t('exp.videoOpus') : ''), 'ok');
    } catch (err) {
      console.error(err); const m = String(err && err.message || err);
      msg(m === 'missing' ? t('exp.videoNoEngine') : m === 'unsupported' ? t('exp.videoUnsupported') : m === 'noaudiocodec' ? t('exp.videoNoCodec') : t('exp.videoFail'), 'bad');
    } finally { prog.hidden = true; busy(false); }
  }
  $('expVideo').addEventListener('click', exportVideo);
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

  /* ---------- audio -> MIDI (monophonic melody) ---------- */
  const aufMsg = (txt, kind) => { const m = $('aufMsg'); m.hidden = !txt; m.textContent = txt || ''; m.className = 'result' + (kind ? ' ' + kind : ''); };
  const aufLabels = () => { $('aufSensVal').textContent = Math.round($('aufSens').value * 100) + '%'; $('aufMinVal').textContent = $('aufMin').value + ' ms'; };
  const aufModeSync = () => { const poly = $('aufMode').value === 'poly'; $('aufRangeRow').hidden = poly; $('aufModeNote').textContent = t(poly ? 'aud.notePoly' : 'aud.noteMono'); aufMsg(''); };
  $('aufMode').addEventListener('change', aufModeSync);
  $('aufSens').addEventListener('input', aufLabels); $('aufMin').addEventListener('input', aufLabels); aufLabels();
  $('prjAudio').addEventListener('click', () => { if (!Pro.require('audio')) return; $('dlgProject').close(); aufModeSync(); open('dlgAudio'); });
  async function audioToLayer(blob, name) {
    const prog = $('aufProg'), btns = [$('aufFileBtn'), $('aufVideo')]; btns.forEach(b => { b.disabled = true; }); aufMsg('');
    prog.hidden = false; prog.value = 0;
    try {
      let buf; try { buf = await Sampler.decode(blob); } catch (err) { aufMsg(t('aud.fail'), 'bad'); return; }
      const poly = $('aufMode').value === 'poly', maxMin = poly ? 5 : 10, o = { range: $('aufRange').value, sens: parseFloat($('aufSens').value), minMs: parseFloat($('aufMin').value), maxSec: maxMin * 60 };
      let r; try { r = await (poly ? Poly : Pitch).analyze(buf, o, (p) => { prog.value = p; }); }
      catch (err) { console.error(err); aufMsg(poly && err && err.message === 'missing' ? t('aud.noEngine') : t('aud.fail'), 'bad'); return; }
      if (!r.notes.length) { aufMsg(t('aud.none'), 'bad'); return; }
      MM.importedLayers([{ name, notes: r.notes }]);
      const msg = t('aud.done', { name, n: r.notes.length, lo: noteName(r.lo), hi: noteName(r.hi) }) + (buf.duration > maxMin * 60 ? ' ' + t('aud.long', { m: maxMin }) : '');
      aufMsg(msg, 'ok'); MM.toast(t('aud.done', { name, n: r.notes.length, lo: noteName(r.lo), hi: noteName(r.hi) }));
      setTimeout(() => { if ($('dlgAudio').open) $('dlgAudio').close(); }, 900);
    } catch (err) { console.error(err); aufMsg(t('aud.fail'), 'bad'); }
    finally { prog.hidden = true; btns.forEach(b => { b.disabled = false; }); }
  }
  $('aufFileBtn').addEventListener('click', () => $('aufFile').click());
  $('aufFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) audioToLayer(f, f.name.replace(/\.[^.]+$/, '')); });
  $('aufVideo').addEventListener('click', async () => {
    if (!MM.S.videoUrl) { aufMsg(t('aud.noVideo'), 'bad'); return; }
    try { const blob = await (await fetch(MM.S.videoUrl)).blob(); await audioToLayer(blob, (MM.S.videoName || 'Video').replace(/\.[^.]+$/, '') + ' (melody)'); }
    catch (err) { console.error(err); aufMsg(t('aud.fail'), 'bad'); }
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
    const sl = p.smpMode === 1;
    $('smpModeSeg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((+b.dataset.mode) === (sl ? 1 : 0))));
    $('smpSlicePane').hidden = !sl; $('smpRootLab').hidden = sl;
    $('smpSens').value = p.smpSens; $('smpSensVal').textContent = Math.round(p.smpSens * 100) + '%';
    $('smpBase').value = p.smpBase; $('smpOne').checked = !!p.smpOne;
    $('smpWaveHint').textContent = t(sl ? 'smp.hintSlice' : 'smp.hintPitch');
    updateSliceInfo();
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
    if (p.smpMode === 1) { drawSlices(W, H, dur, p); return; }
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
  /* ---- slice mode ---- */
  const getCuts = () => String(cur().smpCuts || '').split(',').map(parseFloat).filter(x => isFinite(x) && x > 0).sort((a, b) => a - b);
  const putCuts = (arr) => { cur().smpCuts = arr.map(x => x.toFixed(3)).join(','); };
  const maxSlices = () => Math.max(1, Math.min(72, 108 - (cur().smpBase | 0)));
  function updateSliceInfo() {
    const id = curSample(), box = $('smpSliceInfo'); if (!id || cur().smpMode !== 1) return;
    const buf = Synth.samples.get(id); if (!buf) return;
    const n = Synth.parseCuts(cur().smpCuts, buf.duration, cur().smpStart, cur().smpEnd).length - 1, b = cur().smpBase | 0;
    box.textContent = n > 1 ? t('smp.sliceInfo', { n, lo: noteName(b), hi: noteName(b + n - 1) }) : t('smp.sliceNone');
  }
  function drawSlices(W, H, dur, p) {
    const cuts = Synth.parseCuts(p.smpCuts, dur, p.smpStart, p.smpEnd), base = p.smpBase | 0;
    const dimA = cuts[0] / dur * W, dimB = cuts[cuts.length - 1] / dur * W;
    for (let i = 0; i < cuts.length - 1; i++) { const x0 = cuts[i] / dur * W, x1 = cuts[i + 1] / dur * W; sg.fillStyle = i % 2 ? 'rgba(255,122,69,.06)' : 'rgba(255,179,71,.13)'; sg.fillRect(x0, 0, x1 - x0, H); }
    if (wavePeaks) { sg.fillStyle = '#ff7a45'; const n = wavePeaks.length; for (let x = 0; x < W; x++) { const a = wavePeaks[Math.min(n - 1, Math.floor(x / W * n))], h = Math.max(1, a * (H - 26)); sg.fillRect(x, 8 + (H - 26 - h) / 2 + 9, 1, h); } }
    sg.fillStyle = 'rgba(0,0,0,.55)'; sg.fillRect(0, 0, dimA, H); sg.fillRect(dimB, 0, W - dimB, H);
    sg.font = '10px ui-monospace, Menlo, monospace'; sg.textBaseline = 'top';
    for (let i = 0; i < cuts.length; i++) {
      const x = cuts[i] / dur * W;
      if (i > 0 && i < cuts.length - 1) { sg.fillStyle = '#ffb347'; sg.fillRect(x - 1, 0, 2, H); }
      if (i === 0 || i === cuts.length - 1) { sg.fillStyle = '#ffb347'; if (x > 1 && x < W - 1) sg.fillRect(x - 1, 0, 2, H); }
      if (i < cuts.length - 1) { const w = (cuts[i + 1] - cuts[i]) / dur * W; if (w > 26) { sg.fillStyle = '#e6e8ee'; sg.fillText(noteName(base + i), x + 4, 3); } }
    }
  }
  function waveX(e) { const r = sc.getBoundingClientRect(), buf = Synth.samples.get(curSample()), dur = buf ? buf.duration : 1; return clamp((e.clientX - r.left) / r.width, 0, 1) * dur; }
  sc.addEventListener('pointerdown', (e) => {
    const id = curSample(); if (!id) return; const buf = Synth.samples.get(id); if (!buf) return;
    if (cur().smpMode === 1) { sliceDown(e, buf); return; }
    sc.setPointerCapture(e.pointerId); const p = cur(), x = waveX(e), st = p.smpStart || 0, en = p.smpEnd > 0 ? p.smpEnd : buf.duration;
    drag = Math.abs(x - st) <= Math.abs(x - en) ? 'start' : 'end'; moveHandle(x);
  });
  function moveHandle(x) {
    const buf = Synth.samples.get(curSample()); if (!buf) return; const p = cur(), dur = buf.duration, min = 0.01;
    if (drag === 'start') p.smpStart = clamp(x, 0, (p.smpEnd > 0 ? p.smpEnd : dur) - min);
    else p.smpEnd = clamp(x, (p.smpStart || 0) + min, dur);
    drawWave();
  }
  let cutDrag = null;
  function sliceDown(e, buf) {
    sc.setPointerCapture(e.pointerId);
    const dur = buf.duration, r = sc.getBoundingClientRect(), x = waveX(e), cuts = getCuts(), pxs = dur / r.width;
    let hit = -1, bd = 9 * pxs; cuts.forEach((c, i) => { const d = Math.abs(c - x); if (d < bd) { bd = d; hit = i; } });
    const p0 = cur(), eS = p0.smpStart || 0, eE = p0.smpEnd > 0 ? p0.smpEnd : dur;
    if (hit < 0 && (Math.abs(x - eS) < 9 * pxs || Math.abs(x - eE) < 9 * pxs)) { cutDrag = { edge: Math.abs(x - eS) <= Math.abs(x - eE) ? 'start' : 'end', moved: true, sx: e.clientX }; return; }
    if (hit >= 0) cutDrag = { i: hit, v: cuts[hit], moved: false, sx: e.clientX, existed: true };
    else { if (cuts.length + 1 >= maxSlices()) { MM.toast(t('smp.tooMany', { n: maxSlices() })); return; } cuts.push(x); cuts.sort((a, b) => a - b); putCuts(cuts); cutDrag = { i: cuts.indexOf(x), v: x, moved: true, sx: e.clientX, existed: false }; drawWave(); updateSliceInfo(); }
  }
  function sliceMove(e) {
    const d = cutDrag; if (!d) return; if (Math.abs(e.clientX - d.sx) > 3) d.moved = true; if (!d.moved) return;
    const buf = Synth.samples.get(curSample()); if (!buf) return;
    if (d.edge) { const p = cur(), x = waveX(e); if (d.edge === 'start') p.smpStart = clamp(x, 0, (p.smpEnd > 0 ? p.smpEnd : buf.duration) - 0.05); else p.smpEnd = clamp(x, (p.smpStart || 0) + 0.05, buf.duration); drawWave(); updateSliceInfo(); return; }
    const cuts = getCuts(), lo = (cuts[d.i - 1] || 0) + 0.01, hi = (cuts[d.i + 1] || buf.duration) - 0.01;
    cuts[d.i] = clamp(waveX(e), lo, Math.max(lo, hi)); d.v = cuts[d.i]; putCuts(cuts); drawWave();
  }
  function sliceUp() {
    const d = cutDrag; if (!d) return; cutDrag = null;
    if (d.edge) { const p = cur(), b = Synth.samples.get(curSample()); if (b && p.smpEnd >= b.duration - 0.02) p.smpEnd = 0; drawWave(); updateSliceInfo(); MM.liveUpdate(); MM.auditionNote(false); return; }
    if (d.existed && !d.moved) { const cuts = getCuts(); cuts.splice(d.i, 1); putCuts(cuts); }
    drawWave(); updateSliceInfo(); MM.liveUpdate();
    const buf = Synth.samples.get(curSample()); if (buf) { const cs = Synth.parseCuts(cur().smpCuts, buf.duration, cur().smpStart, cur().smpEnd); let k = 0; for (let j = 0; j < cs.length - 1; j++) if (d.v >= cs[j]) k = j; MM.auditionNote((cur().smpBase | 0) + Math.min(k, cs.length - 2)); }
  }
  sc.addEventListener('pointermove', (e) => { if (cutDrag) sliceMove(e); else if (drag) moveHandle(waveX(e)); });
  const waveUp = () => { if (cutDrag) { sliceUp(); return; } if (!drag) return; drag = null; MM.liveUpdate(); MM.auditionNote(false); };
  sc.addEventListener('pointerup', waveUp); sc.addEventListener('pointercancel', waveUp);

  async function chooseSample(id) {
    if (!Pro.require('sampler')) return;
    await Sampler.ensure(id);
    const prev = cur(); let p;
    if (prev.sampleId === id) p = prev;
    else p = Object.assign({}, Synth.BASE, { wave1: 'off', wave2: 'off', noise: 0, sampleId: id, smpStart: 0, smpEnd: 0, smpRoot: 60, smpLoop: 0, attack: 0.002, decay: 0.3, sustain: 1, release: 0.15, cutoff: 18000, resonance: 0.7, keytrack: 0, fEnv: 0, reverb: 0.1, gain: 0.8 });
    if (prev.sampleId !== id) { const b = Synth.samples.get(id); if (b && b.duration >= 5) { p.smpMode = 1; p.smpLoop = 0; autoCuts(id, p); } }
    MM.setInstrument(p, 'smp:' + id); refreshSampler(); MM.auditionNote(false);
  }
  const maxSlicesFor = (p) => Math.max(1, Math.min(72, 108 - (p.smpBase | 0))) - 1;
  /* mode / chop controls */
  const buildBaseSel = () => { const s = $('smpBase'); s.innerHTML = ''; for (let n = 12; n <= 96; n++) { const o = el('option', null, noteName(n) + (n === 48 ? '  (default)' : '')); o.value = n; s.appendChild(o); } };
  const autoCuts = (id, p) => { const b = Synth.samples.get(id), r = Sampler.activeRange(id); p.smpStart = r[0] > 0.02 ? r[0] : 0; p.smpEnd = b && r[1] < b.duration - 0.02 ? r[1] : 0; p.smpCuts = Sampler.detect(id, { sens: p.smpSens, max: maxSlicesFor(p) }).filter(x => x > p.smpStart + 0.06 && (!p.smpEnd || x < p.smpEnd - 0.06)).map(x => x.toFixed(3)).join(','); };
  const rechop = () => { const id = curSample(); if (!id) return; const p = cur(); autoCuts(id, p); MM.liveUpdate(); drawWave(); updateSliceInfo(); };
  $('smpModeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !curSample()) return; const p = cur(); p.smpMode = +b.dataset.mode;
    if (p.smpMode === 1 && !String(p.smpCuts || '').trim()) { rechop(); } MM.liveUpdate(); syncDetail(); MM.auditionNote(false);
  });
  $('smpSens').addEventListener('input', () => { cur().smpSens = parseFloat($('smpSens').value); $('smpSensVal').textContent = Math.round(cur().smpSens * 100) + '%'; clearTimeout(rechop.tm); rechop.tm = setTimeout(rechop, 60); });
  $('smpChop').addEventListener('click', () => { rechop(); MM.auditionNote(false); });
  $('smpEven').addEventListener('click', () => { const id = curSample(); if (!id) return; const n = parseInt(prompt(t('smp.evenPrompt'), '16'), 10); if (!(n >= 2)) return; const q = cur(), b0 = Synth.samples.get(id), s0 = q.smpStart || 0, e0 = q.smpEnd > 0 ? q.smpEnd : b0.duration, k = Math.min(n, maxSlices()); q.smpCuts = Array.from({ length: k - 1 }, (_, j) => s0 + (e0 - s0) * (j + 1) / k).map(x => x.toFixed(3)).join(','); MM.liveUpdate(); drawWave(); updateSliceInfo(); });
  $('smpClearCuts').addEventListener('click', () => { cur().smpCuts = ''; cur().smpStart = 0; cur().smpEnd = 0; MM.liveUpdate(); drawWave(); updateSliceInfo(); });
  $('smpBase').addEventListener('change', (e) => { cur().smpBase = parseInt(e.target.value, 10); MM.liveUpdate(); drawWave(); updateSliceInfo(); MM.auditionNote(false); });
  $('smpOne').addEventListener('change', (e) => { cur().smpOne = e.target.checked ? 1 : 0; MM.liveUpdate(); });
  buildBaseSel();
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
  $('smpAdd').addEventListener('click', () => { if (Pro.require('sampler')) $('smpFile').click(); });
  $('smpFile').addEventListener('change', (e) => { const fs = Array.from(e.target.files || []); e.target.value = ''; if (fs.length) addFiles(fs); });
  let mic = null, micTimer = null;
  $('smpMic').addEventListener('click', async () => {
    const btn = $('smpMic'); if (!mic && !Pro.require('sampler')) return;
    if (mic) { clearInterval(micTimer); const m = mic; mic = null; btn.textContent = t('smp.mic'); btn.classList.remove('rec-on'); try { const blob = await m.stop(); const id = await Sampler.add(blob, t('smp.micName') + ' ' + new Date().toLocaleTimeString().replace(/[: ]/g, '.'), 'mic.webm'); refreshSampler(); chooseSample(id); } catch (err) { console.error(err); MM.toast(t('smp.decodeFail', { name: 'mic' })); } return; }
    try { mic = await Sampler.startMic(); } catch (err) { MM.toast(t('smp.micDenied')); return; }
    const t0 = performance.now(); btn.classList.add('rec-on');
    micTimer = setInterval(() => { const s = (performance.now() - t0) / 1000; btn.textContent = '■ ' + t('smp.stop') + ' ' + s.toFixed(1) + ' s'; if (s >= 30) btn.click(); }, 100);
  });
  $('smpVideo').addEventListener('click', async () => {
    if (!Pro.require('sampler')) return;
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
