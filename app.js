/* MidiMovie — main app */
(function () {
  'use strict';
  const { t } = I18N;
  const $ = (id) => document.getElementById(id);
  const BLANK_DURATION = 60;
  const LOOKAHEAD = 0.1;
  const COLORS = ['#ff7a45', '#4cc9f0', '#b794f6', '#41d392', '#ffd166', '#ff6b9d', '#6ee7ff', '#a3e635'];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmtTime = (s) => { s = Math.max(0, s || 0); const m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(1).padStart(4, '0'); };

  /* ================= state ================= */
  const S = {
    layers: [], pending: null, nextNum: 1,
    inst: { presetId: 'grandPiano', params: Object.assign({}, PresetLib.get('grandPiano').params), base: Object.assign({}, PresetLib.get('grandPiano').params) },
    simpleCat: 'keys', tab: 'simple',
    octave: 0, transpose: 0, channel: 0, velFixed: false, typing: true,
    latencyMs: 0, recFrom: 'start', countIn: 3, monitor: true,
    recording: false, counting: false, rec: null, countToken: 0,
    videoName: '', videoUrl: null
  };

  /* ================= audio ================= */
  let ctx = null, bus = null, liveCh = null;
  function initAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    bus = Synth.createBus(ctx);
    liveCh = Synth.createChannel(bus, S.inst.params, 1);
    ctx.onstatechange = updateAudioBanner;
    updateAudioBanner();
  }
  function ensureAudio() { initAudio(); if (ctx.state !== 'running') ctx.resume().catch(() => {}); }
  function updateAudioBanner() { $('audioBanner').hidden = !ctx || ctx.state === 'running'; }
  ['pointerdown', 'keydown', 'touchend'].forEach(ev => window.addEventListener(ev, () => { if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {}); }, { capture: true }));
  $('audioBanner').addEventListener('click', () => ensureAudio());

  /* ================= transport (video or virtual clock) ================= */
  const video = $('video');
  const T = {
    hasVideo: false, vPlaying: false, vOffset: 0, vBase: 0, vDuration: BLANK_DURATION, rate: 1,
    onEnded: null,
    get duration() { return this.hasVideo ? (isFinite(video.duration) ? video.duration : 0) : this.vDuration; },
    get time() {
      if (this.hasVideo) return video.currentTime;
      return this.vPlaying ? Math.min(this.vDuration, this.vOffset + (performance.now() - this.vBase) / 1000) : this.vOffset;
    },
    get playing() { return this.hasVideo ? (!video.paused && !video.ended) : this.vPlaying; },
    play() {
      if (this.hasVideo) { video.play().catch(() => {}); }
      else { if (this.vOffset >= this.vDuration) this.vOffset = 0; this.vBase = performance.now(); this.vPlaying = true; resetScheduler(); onPlayState(); }
    },
    pause() {
      if (this.hasVideo) video.pause();
      else { if (this.vPlaying) this.vOffset = this.time; this.vPlaying = false; killAllVoices(); onPlayState(); }
    },
    seek(s) {
      s = clamp(s, 0, this.duration || 0);
      if (this.hasVideo) video.currentTime = s;
      else { this.vOffset = s; this.vBase = performance.now(); resetScheduler(); }
    }
  };
  video.addEventListener('play', () => { resetScheduler(); onPlayState(); });
  video.addEventListener('pause', () => { killAllVoices(); onPlayState(); });
  video.addEventListener('seeking', () => resetScheduler());
  video.addEventListener('ended', () => { killAllVoices(); onPlayState(); if (T.onEnded) T.onEnded(); });
  video.addEventListener('loadedmetadata', () => { updateStageUI(); });
  video.addEventListener('error', () => { /* unsupported codec etc. */ if (S.videoUrl) { toast(I18N.lang === 'ja' ? 'この動画は再生できません。別の形式(MP4/H.264, WebM)をお試しください。' : I18N.lang === 'zh' ? '无法播放此视频。请尝试其他格式 (MP4/H.264, WebM)。' : 'This video cannot be played. Try MP4 (H.264) or WebM.'); unloadVideo(); } });

  /* ================= layer runtime & scheduler ================= */
  function rtOf(l) { if (!l._rt) l._rt = { ch: null, ev: null, ptr: 0, voices: new Map() }; return l._rt; }
  function anySolo() { return S.layers.some(l => l.solo); }
  function isAudible(l) { return l === S.pending ? true : (!l.mute && (!anySolo() || l.solo)); }
  function chanFor(l) {
    const r = rtOf(l);
    if (!r.ch) r.ch = Synth.createChannel(bus, l.params, l.volume);
    return r.ch;
  }
  function refreshChannel(l) {
    const r = rtOf(l); if (!r.ch) return;
    r.ch.params = l.params;
    Synth.updateChannel(r.ch, { volume: l.volume, audible: isAudible(l) });
  }
  function refreshAllChannels() { S.layers.forEach(refreshChannel); if (S.pending) refreshChannel(S.pending); }
  function invalidate(l) { rtOf(l).ev = null; }
  function disposeLayer(l) {
    const r = l._rt; if (!r) return;
    r.voices.forEach(v => v.kill(ctx ? ctx.currentTime : 0)); r.voices.clear();
    if (r.ch) Synth.disposeChannel(r.ch);
    l._rt = null;
  }
  function playLayers() { return S.pending ? S.layers.concat([S.pending]) : S.layers; }
  function lowerBound(arr, tt) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].t < tt) lo = m + 1; else hi = m; } return lo; }
  function killAllVoices() {
    if (!ctx) return;
    const now = ctx.currentTime;
    playLayers().forEach(l => { const r = l._rt; if (!r) return; r.voices.forEach(v => v.kill(now)); r.voices.clear(); if (r.ch) Synth.setBend(r.ch, 0, now); });
  }
  function resetScheduler() {
    killAllVoices();
    const vt = T.time;
    playLayers().forEach(l => { const r = rtOf(l); r.ev = Synth.buildEvents(l); r.ptr = lowerBound(r.ev, vt - 0.004); });
  }
  function schedTick() {
    if (!ctx || !T.playing) return;
    const vt = T.time, rate = T.rate || 1, now = ctx.currentTime, horizon = vt + LOOKAHEAD * rate;
    for (const l of playLayers()) {
      const r = rtOf(l);
      if (!r.ev) { r.ev = Synth.buildEvents(l); r.ptr = lowerBound(r.ev, vt - 0.004); }
      const audible = isAudible(l) && (l === S.pending || !(S.recording && !S.monitor));
      while (r.ptr < r.ev.length && r.ev[r.ptr].t <= horizon) {
        const ev = r.ev[r.ptr++];
        if (!audible) continue;
        const when = now + Math.max(0, (ev.t - vt) / rate) + 0.003;
        const ch = chanFor(l);
        if (ev.type === 'on') {
          const old = r.voices.get(ev.i); if (old) old.kill(when);
          r.voices.set(ev.i, Synth.startVoice(ch, Object.assign({}, Synth.BASE, l.params), ev.n, ev.v, when));
        } else if (ev.type === 'off') {
          const v = r.voices.get(ev.i); if (v) { v.release(when); r.voices.delete(ev.i); }
        } else if (ev.type === 'bend') {
          Synth.setBend(ch, ev.v * (l.params.bendRange || 0) * 100, when);
        }
      }
    }
  }
  setInterval(schedTick, 20);

  /* ================= live playing & recording ================= */
  const held = new Map();       // srcKey -> { note, voice, vel }
  const sustained = new Set();  // srcKeys waiting for pedal release
  let pedal = false;
  const litCount = new Array(128).fill(0);

  function mediaNow(ts) {
    let tt = T.time;
    if (T.playing && ts) { const lag = (performance.now() - ts) / 1000; if (lag > 0 && lag < 0.5) tt -= lag * (T.rate || 1); }
    return Math.max(0, tt - S.latencyMs / 1000);
  }
  function playNote(key, note, vel, ts) {
    ensureAudio();
    if (held.has(key)) releaseNow(key, ts);
    sustained.delete(key);
    const voice = Synth.startVoice(liveCh, Object.assign({}, S.inst.params), note, vel, ctx.currentTime + 0.001);
    held.set(key, { note, voice, vel });
    lit(note, 1);
    if (S.recording && S.rec) S.rec.open.set(key, { t: mediaNow(ts), n: note, v: vel });
  }
  function releaseNote(key, ts) {
    if (!held.has(key)) return;
    if (pedal) { sustained.add(key); return; }
    releaseNow(key, ts);
  }
  function releaseNow(key, ts) {
    const h = held.get(key); if (!h) return;
    held.delete(key); sustained.delete(key);
    h.voice.release(ctx ? ctx.currentTime : 0);
    lit(h.note, -1);
    if (S.recording && S.rec && S.rec.open.has(key)) {
      const o = S.rec.open.get(key); S.rec.open.delete(key);
      const end = mediaNow(ts);
      S.rec.notes.push({ t: o.t, d: Math.max(0.03, end - o.t), n: o.n, v: o.v });
    }
  }
  function setPedal(down, ts) {
    pedal = down;
    if (!down) Array.from(sustained).forEach(k => releaseNow(k, ts));
  }
  function panic() {
    pedal = false; Array.from(held.keys()).forEach(k => releaseNow(k)); sustained.clear();
    if (ctx && liveCh) Synth.setBend(liveCh, 0, ctx.currentTime);
    litCount.fill(0); refreshKeys();
  }
  function setBendLive(v, ts) {
    if (!ctx) return;
    const cents = v * (S.inst.params.bendRange || 0) * 100;
    if (liveCh.bend) liveCh.bend.offset.setTargetAtTime(cents, ctx.currentTime, 0.004);
    if (S.recording && S.rec) {
      const tt = mediaNow(ts), b = S.rec.bends, last = b[b.length - 1];
      if (last && tt - last.t < 0.008) last.v = v; else b.push({ t: tt, v });
    }
  }
  const transform = (raw) => clamp(raw + 12 * S.octave + S.transpose, 0, 127);

  /* ================= recording flow ================= */
  function startRecording() {
    if (S.pending || S.recording || S.counting) return;
    ensureAudio();
    T.pause();
    if (S.recFrom === 'start' || T.time >= T.duration - 0.15) T.seek(0);
    const n = S.countIn;
    if (n > 0) {
      S.counting = true; const token = ++S.countToken;
      let left = n;
      const step = () => {
        if (token !== S.countToken) return;
        if (left === 0) { $('countOverlay').hidden = true; beginRecording(); return; }
        $('countOverlay').textContent = left; $('countOverlay').hidden = false;
        beep(left === 1 ? 1320 : 880);
        left--; setTimeout(step, 1000);
      };
      step(); updateUI();
    } else beginRecording();
  }
  function beep(freq) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), now = ctx.currentTime;
    o.frequency.value = freq; g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.25, now + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.connect(g); g.connect(ctx.destination); o.start(now); o.stop(now + 0.15);
  }
  function beginRecording() {
    S.counting = false; S.recording = true;
    S.rec = { notes: [], open: new Map(), bends: [], startT: T.time };
    T.onEnded = () => { if (S.recording) stopRecording(); };
    T.play(); updateUI();
  }
  function stopRecording() {
    if (S.counting) { S.counting = false; S.countToken++; $('countOverlay').hidden = true; updateUI(); return; }
    if (!S.recording) return;
    const end = mediaNow();
    T.pause();
    Array.from(S.rec.open.keys()).forEach(k => { const o = S.rec.open.get(k); S.rec.open.delete(k); S.rec.notes.push({ t: o.t, d: Math.max(0.03, end - o.t), n: o.n, v: o.v }); });
    const rec = S.rec; S.recording = false; S.rec = null; T.onEnded = null;
    rec.notes.sort((a, b) => a.t - b.t);
    if (!rec.notes.length) { toast(t('take.empty')); updateUI(); return; }
    S.pending = { id: 'p' + Date.now(), notes: rec.notes, bends: rec.bends, params: Object.assign({}, S.inst.params), presetId: S.inst.presetId, volume: 1, mute: false, solo: false, offsetMs: 0, name: null, num: 0, color: '#ffffff' };
    updateUI();
  }
  function keepTake() {
    const p = S.pending; if (!p) return;
    T.pause();
    p.num = S.nextNum++; p.color = COLORS[(p.num - 1) % COLORS.length]; p.id = 'l' + p.num + '_' + Date.now();
    disposeLayer(p);
    S.layers.push(p); S.pending = null;
    resetScheduler(); refreshAllChannels(); updateUI();
  }
  function discardTake() {
    if (!S.pending) return;
    T.pause(); disposeLayer(S.pending); S.pending = null; updateUI();
  }
  function previewTake() { if (!S.pending) return; ensureAudio(); T.pause(); T.seek(0); T.play(); }

  /* ================= video loading ================= */
  function loadVideoFile(file) {
    if (!file) return;
    if (S.recording || S.counting) stopRecording();
    T.pause();
    if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
    S.videoUrl = URL.createObjectURL(file); S.videoName = file.name.replace(/\.[^.]+$/, '');
    video.src = S.videoUrl; T.hasVideo = true; video.load();
    video.volume = parseFloat($('videoVol').value); video.muted = vMuted;
    updateStageUI(); resetScheduler();
  }
  function unloadVideo() {
    if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
    S.videoUrl = null; S.videoName = ''; T.hasVideo = false; video.removeAttribute('src'); video.load(); updateStageUI();
  }
  $('loadVideoBtn').addEventListener('click', () => $('videoFile').click());
  $('changeVideoBtn').addEventListener('click', () => $('videoFile').click());
  $('videoFile').addEventListener('change', (e) => { loadVideoFile(e.target.files[0]); e.target.value = ''; });
  const wrap = $('videoWrap');
  ['dragenter', 'dragover'].forEach(ev => window.addEventListener(ev, (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); wrap.classList.add('dragover'); } }));
  ['dragleave', 'drop'].forEach(ev => window.addEventListener(ev, (e) => { if (ev === 'dragleave' && e.relatedTarget) return; wrap.classList.remove('dragover'); }));
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = Array.from((e.dataTransfer && e.dataTransfer.files) || []).find(f => f.type.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv)$/i.test(f.name));
    if (f) loadVideoFile(f);
  });

  let vMuted = false;
  $('btnMute').addEventListener('click', () => { vMuted = !vMuted; video.muted = vMuted; updateStageUI(); });
  $('videoVol').addEventListener('input', (e) => { video.volume = parseFloat(e.target.value); if (vMuted && video.volume > 0) { vMuted = false; video.muted = false; updateStageUI(); } });

  /* ================= UI: stage & transport ================= */
  function updateStageUI() {
    $('dropZone').hidden = T.hasVideo;
    $('changeVideoBtn').hidden = !T.hasVideo;
    $('stageStatus').textContent = T.hasVideo ? S.videoName : t('stage.noVideo', { n: BLANK_DURATION });
    $('syncInfo').hidden = !T.hasVideo;
    $('btnMute').title = vMuted ? t('stage.unmute') : t('stage.mute');
    $('btnMute').setAttribute('aria-label', $('btnMute').title);
    document.querySelector('.vol').classList.toggle('muted-state', vMuted);
  }
  function onPlayState() { updateTransportUI(); }
  function updateTransportUI() {
    const playing = T.playing;
    $('icoPlay').hidden = playing; $('icoPause').hidden = !playing;
    $('btnPlay').title = playing ? t('tr.pause') : t('tr.play'); $('btnPlay').setAttribute('aria-label', $('btnPlay').title);
    const rec = S.recording || S.counting;
    $('btnRec').classList.toggle('on', rec);
    $('btnRec').title = rec ? t('tr.stopRec') : t('tr.record'); $('btnRec').setAttribute('aria-label', $('btnRec').title);
    $('btnRec').disabled = !!S.pending && !rec;
    $('btnPlay').disabled = rec; $('btnStart').disabled = rec; $('btnStop').disabled = false;
    $('recBadge').hidden = !S.recording;
    ['recFrom', 'countIn', 'latency'].forEach(id => { $(id).disabled = rec; });
  }
  $('btnPlay').addEventListener('click', togglePlay);
  function togglePlay() {
    if (S.recording || S.counting) return;
    ensureAudio();
    if (T.playing) T.pause(); else { if (T.time >= T.duration - 0.05) T.seek(0); T.play(); }
  }
  $('btnStart').addEventListener('click', () => { if (!(S.recording || S.counting)) T.seek(0); });
  $('btnStop').addEventListener('click', stopAll);
  function stopAll() {
    if (S.recording || S.counting) { stopRecording(); return; }
    T.pause();
  }
  $('btnRec').addEventListener('click', () => { if (S.recording || S.counting) stopRecording(); else startRecording(); });

  $('recFrom').addEventListener('change', (e) => { S.recFrom = e.target.value; });
  $('countIn').addEventListener('change', (e) => { S.countIn = parseInt(e.target.value, 10); });
  $('latency').addEventListener('change', (e) => { S.latencyMs = clamp(parseFloat(e.target.value) || 0, -300, 300); e.target.value = S.latencyMs; });
  $('monitorLayers').addEventListener('change', (e) => { S.monitor = e.target.checked; });
  function buildCountIn() {
    const sel = $('countIn'); sel.innerHTML = '';
    [0, 1, 2, 3, 5].forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n === 0 ? t('rec.off') : t('rec.sec', { n }); sel.appendChild(o); });
    sel.value = S.countIn;
  }

  /* take card */
  $('takePreview').addEventListener('click', previewTake);
  $('takeKeep').addEventListener('click', keepTake);
  $('takeDiscard').addEventListener('click', discardTake);
  $('takeRerec').addEventListener('click', () => { discardTake(); startRecording(); });
  function renderTake() {
    const p = S.pending; $('takeCard').hidden = !p;
    if (!p) return;
    const last = p.notes.reduce((m, n) => Math.max(m, n.t + n.d), 0);
    $('takeInfo').textContent = t('take.info', { n: p.notes.length, d: last.toFixed(1) });
  }

  /* ================= layers UI ================= */
  function layerLabel(l) { return l.name || (t('layer') + ' ' + l.num); }
  function soundLabel(l) { return (l.presetId && PresetLib.name(l.presetId, I18N.lang)) || t('pr.custom'); }
  function renderLayers() {
    const list = $('layerList'); list.innerHTML = '';
    if (!S.layers.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = t('layers.empty'); list.appendChild(d); }
    S.layers.forEach(l => list.appendChild(layerEl(l)));
    $('expMix').disabled = !S.layers.length;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function layerEl(l) {
    const root = el('div', 'layer' + (isAudible(l) ? '' : ' dim')); root.style.setProperty('--c', l.color);
    const head = el('div', 'l-head');
    const name = el('input', 'name'); name.type = 'text'; name.value = l.name || ''; name.placeholder = t('layer') + ' ' + l.num; name.setAttribute('aria-label', t('layer.name'));
    name.addEventListener('input', () => { l.name = name.value.trim() || null; });
    const meta = el('span', 'l-meta', soundLabel(l) + ' · ' + t('layer.notes', { n: l.notes.length }));
    const bm = el('button', 'ms m' + (l.mute ? ' on' : ''), 'M'); bm.title = t('layer.mute'); bm.setAttribute('aria-label', t('layer.mute')); bm.setAttribute('aria-pressed', l.mute);
    const bs = el('button', 'ms s' + (l.solo ? ' on' : ''), 'S'); bs.title = t('layer.solo'); bs.setAttribute('aria-label', t('layer.solo')); bs.setAttribute('aria-pressed', l.solo);
    const bd = el('button', 'ms del', '×'); bd.title = t('layer.delete'); bd.setAttribute('aria-label', t('layer.delete'));
    bm.addEventListener('click', () => { l.mute = !l.mute; refreshAllChannels(); renderLayers(); });
    bs.addEventListener('click', () => { l.solo = !l.solo; refreshAllChannels(); renderLayers(); });
    bd.addEventListener('click', () => { if (!confirm(t('layer.deleteConfirm'))) return; disposeLayer(l); S.layers = S.layers.filter(x => x !== l); refreshAllChannels(); renderLayers(); });
    head.append(name, meta, bm, bs, bd);

    const body = el('div', 'l-body');
    const lv = el('label'); lv.append(el('span', null, t('layer.volume')));
    const vr = el('input'); vr.type = 'range'; vr.min = 0; vr.max = 1.5; vr.step = 0.01; vr.value = l.volume;
    vr.addEventListener('input', () => { l.volume = parseFloat(vr.value); refreshChannel(l); });
    lv.append(vr);
    const ln = el('label'); ln.append(el('span', null, t('layer.nudge')));
    const nu = el('input', 'nudge'); nu.type = 'number'; nu.step = 10; nu.value = l.offsetMs || 0;
    nu.addEventListener('change', () => { l.offsetMs = clamp(parseFloat(nu.value) || 0, -2000, 2000); nu.value = l.offsetMs; invalidate(l); if (T.playing) resetScheduler(); });
    ln.append(nu);
    const acts = el('div', 'l-actions');
    const use = el('button', 'btn small', t('layer.useSound')); use.title = t('layer.useSoundTip');
    use.addEventListener('click', () => { setInstrument(Object.assign({}, l.params), l.presetId); });
    const apply = el('button', 'btn small', t('layer.applySound')); apply.title = t('layer.applySoundTip');
    apply.addEventListener('click', () => { l.params = Object.assign({}, S.inst.params); l.presetId = S.inst.presetId; refreshChannel(l); if (T.playing) resetScheduler(); renderLayers(); });
    const ex = el('button', 'btn small', t('layer.export')); ex.title = t('layer.exportTip');
    ex.addEventListener('click', () => exportLayers([l], layerLabel(l), ex));
    acts.append(use, apply, ex);
    body.append(lv, ln, acts);
    root.append(head, body);
    return root;
  }

  /* ================= timeline canvas ================= */
  const cv = $('timeline'), g2 = cv.getContext('2d');
  const RULER = 22, LANE = 22;
  function drawTimeline() {
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 600;
    const lanes = S.layers.slice(); if (S.pending) lanes.push(S.pending); if (S.recording) lanes.push({ _rec: true });
    const nLanes = Math.max(1, lanes.length);
    const H = RULER + nLanes * LANE + 2;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px'; }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.clearRect(0, 0, W, H);
    const dur = T.duration || BLANK_DURATION;
    const x = (s) => (s / dur) * W;
    // ruler
    g2.fillStyle = '#14171d'; g2.fillRect(0, 0, W, RULER);
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const step = steps.find(s => x(s) >= 70) || 600;
    g2.font = '10px ui-monospace, Menlo, monospace'; g2.textBaseline = 'middle';
    for (let s = 0; s <= dur + 1e-6; s += step) {
      const px = Math.round(x(s)) + 0.5;
      g2.strokeStyle = '#2a2f3a'; g2.beginPath(); g2.moveTo(px, 0); g2.lineTo(px, H); g2.stroke();
      g2.fillStyle = '#8b92a3'; g2.fillText(fmtTime(s).replace(/\.0$/, ''), px + 4, RULER / 2);
    }
    // lanes
    lanes.forEach((l, i) => {
      const y0 = RULER + i * LANE;
      g2.fillStyle = i % 2 ? '#101318' : '#12151b'; g2.fillRect(0, y0, W, LANE);
      if (l._rec) {
        g2.fillStyle = 'rgba(255,59,74,.10)'; g2.fillRect(0, y0, W, LANE);
        const now = T.time;
        S.rec.notes.forEach(n => drawNote(n.t, n.d, n.n, y0, '#ff3b4a', 1));
        S.rec.open.forEach(o => drawNote(o.t, Math.max(0.03, now - o.t), o.n, y0, '#ff3b4a', 1));
        return;
      }
      const off = (l.offsetMs || 0) / 1000, dim = !isAudible(l) ? 0.3 : 1;
      let lo = 127, hi = 0; l.notes.forEach(n => { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); });
      l.notes.forEach(n => drawNote(n.t + off, n.d, n.n, y0, l.color, dim, lo, hi));
      g2.fillStyle = 'rgba(8,9,12,.65)'; const label = layerLabel(l);
      g2.font = '600 10px system-ui, sans-serif'; const w = g2.measureText(label).width + 10;
      g2.fillRect(0, y0 + 3, w, 14); g2.fillStyle = l === S.pending ? '#ffb347' : '#cfd3de'; g2.fillText(l === S.pending ? t('take.title') : label, 5, y0 + 10.5);
    });
    function drawNote(tt, d, n, y0, color, alpha, lo, hi) {
      if (lo === undefined) { lo = 36; hi = 96; }
      const span = Math.max(12, hi - lo), py = y0 + LANE - 5 - ((n - lo) / span) * (LANE - 10);
      g2.globalAlpha = alpha; g2.fillStyle = color; g2.fillRect(x(tt), Math.round(py) - 1, Math.max(2, x(d)), 3); g2.globalAlpha = 1;
    }
    // playhead
    const px = Math.round(x(T.time)) + 0.5;
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 1.5; g2.beginPath(); g2.moveTo(px, 0); g2.lineTo(px, H); g2.stroke(); g2.lineWidth = 1;
    g2.fillStyle = '#fff'; g2.beginPath(); g2.moveTo(px - 5, 0); g2.lineTo(px + 5, 0); g2.lineTo(px, 7); g2.fill();
  }
  let scrubbing = false;
  function scrubTo(e) { const r = cv.getBoundingClientRect(); T.seek(((e.clientX - r.left) / r.width) * (T.duration || 0)); }
  cv.addEventListener('pointerdown', (e) => { if (S.recording || S.counting) return; scrubbing = true; cv.setPointerCapture(e.pointerId); scrubTo(e); });
  cv.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
  ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { scrubbing = false; }));

  function frame() {
    drawTimeline();
    $('timeDisplay').textContent = fmtTime(T.time) + ' / ' + fmtTime(T.duration);
    if (!T.hasVideo && T.vPlaying && T.time >= T.vDuration) { T.vOffset = T.vDuration; T.vPlaying = false; killAllVoices(); onPlayState(); if (T.onEnded) T.onEnded(); }
    requestAnimationFrame(frame);
  }
  setInterval(() => {
    if (!T.hasVideo || !video.getVideoPlaybackQuality) return;
    const q = video.getVideoPlaybackQuality();
    $('syncInfo').textContent = t('stage.dropped') + ': ' + q.droppedVideoFrames;
    $('syncInfo').title = t('stage.syncNote');
  }, 500);

  /* ================= keyboard (on-screen) ================= */
  const piano = $('piano'), keyEls = {};
  (function buildPiano() {
    const LO = 36, HI = 96, isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
    let whites = 0; for (let n = LO; n <= HI; n++) if (!isBlack(n)) whites++;
    const ww = 100 / whites; let wi = 0;
    for (let n = LO; n <= HI; n++) {
      const k = el('div', 'key ' + (isBlack(n) ? 'black' : 'white')); k.dataset.note = n;
      if (isBlack(n)) { k.style.left = (wi * ww - ww * 0.3) + '%'; k.style.width = (ww * 0.6) + '%'; }
      else { k.style.left = (wi * ww) + '%'; k.style.width = ww + '%'; wi++; if (n % 12 === 0) k.append(el('span', 'lbl', 'C' + (Math.floor(n / 12) - 1))); }
      piano.appendChild(k); keyEls[n] = k;
    }
  })();
  let pointerNotes = new Map();
  piano.addEventListener('pointerdown', (e) => {
    const k = e.target.closest('.key'); if (!k) return;
    piano.setPointerCapture(e.pointerId);
    const n = +k.dataset.note; const key = 'ui:' + e.pointerId;
    pointerNotes.set(e.pointerId, key); playNote(key, n, 100, e.timeStamp);
  });
  const upPiano = (e) => { const key = pointerNotes.get(e.pointerId); if (key) { pointerNotes.delete(e.pointerId); releaseNote(key, e.timeStamp); } };
  piano.addEventListener('pointerup', upPiano); piano.addEventListener('pointercancel', upPiano);
  function lit(note, d) { litCount[note] = Math.max(0, litCount[note] + d); const k = keyEls[note]; if (k) k.classList.toggle('on', litCount[note] > 0); }
  function refreshKeys() { Object.keys(keyEls).forEach(n => keyEls[n].classList.toggle('on', litCount[n] > 0)); }

  function updateOct() { if (typeof updateKeyLabels === 'function') updateKeyLabels(); $('octVal').textContent = (S.octave > 0 ? '+' : '') + S.octave; $('trVal').textContent = (S.transpose > 0 ? '+' : '') + S.transpose; }
  $('octDown').addEventListener('click', () => { S.octave = clamp(S.octave - 1, -4, 4); updateOct(); });
  $('octUp').addEventListener('click', () => { S.octave = clamp(S.octave + 1, -4, 4); updateOct(); });
  $('trDown').addEventListener('click', () => { S.transpose = clamp(S.transpose - 1, -12, 12); updateOct(); });
  $('trUp').addEventListener('click', () => { S.transpose = clamp(S.transpose + 1, -12, 12); updateOct(); });

  /* computer keyboard */
  const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  const isTextTarget = (e) => { const tg = e.target; return tg && (tg.tagName === 'TEXTAREA' || tg.tagName === 'SELECT' || (tg.tagName === 'INPUT' && ['text', 'number'].includes(tg.type))); };
  function updateKeyLabels() {
    piano.querySelectorAll('.klet').forEach(x => x.remove());
    if (!S.typing) return;
    Object.keys(KEYMAP).forEach(k => { const n = transform(60 + KEYMAP[k]), kel = keyEls[n]; if (kel) kel.appendChild(el('span', 'klet', k.toUpperCase())); });
  }
  window.addEventListener('keydown', (e) => {
    if (isTextTarget(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
    if (e.key === 'Escape') { stopAll(); return; }
    if (e.key === 'Home') { e.preventDefault(); if (!(S.recording || S.counting)) T.seek(0); return; }
    if (!S.typing) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { S.octave = clamp(S.octave - 1, -4, 4); updateOct(); return; }
    if (k === 'x') { S.octave = clamp(S.octave + 1, -4, 4); updateOct(); return; }
    if (k in KEYMAP && !e.repeat) { e.preventDefault(); playNote('kb:' + k, transform(60 + KEYMAP[k]), 100, e.timeStamp); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && !isTextTarget(e)) { e.preventDefault(); return; }
    const k = e.key.toLowerCase(); if (k in KEYMAP) releaseNote('kb:' + k, e.timeStamp);
  });
  window.addEventListener('blur', () => { Array.from(held.keys()).filter(k => k.startsWith('kb:')).forEach(k => releaseNow(k)); });
  $('typing').addEventListener('change', (e) => { S.typing = e.target.checked; updateKeyLabels(); });
  $('panic').addEventListener('click', panic);

  /* ================= MIDI ================= */
  let midiAccess = null; const inputEnabled = new Map(); const monLines = []; let monDirty = false;
  function setMidiMsg(key, kind) { const m = $('midiMsg'); if (!key) { m.hidden = true; return; } m.hidden = false; m.className = 'note-msg' + (kind === 'info' ? ' info' : ''); m.textContent = t(key); m.dataset.key = key; }
  async function connectMIDI() {
    if (!navigator.requestMIDIAccess) { setMidiMsg('midi.unsupported'); return; }
    ensureAudio();
    $('midiConnect').disabled = true; $('midiConnect').textContent = t('midi.connecting');
    try { midiAccess = await navigator.requestMIDIAccess({ sysex: false }); }
    catch (err) { setMidiMsg('midi.denied'); $('midiConnect').disabled = false; $('midiConnect').textContent = t('midi.connect'); return; }
    midiAccess.onstatechange = refreshInputs;
    $('midiConnect').hidden = true; setMidiMsg(null); refreshInputs();
  }
  $('midiConnect').addEventListener('click', connectMIDI);
  function refreshInputs() {
    if (!midiAccess) return;
    const list = $('midiInputs'); list.innerHTML = '';
    const ins = Array.from(midiAccess.inputs.values());
    ins.forEach(inp => {
      if (!inputEnabled.has(inp.id)) inputEnabled.set(inp.id, true);
      inp.onmidimessage = inputEnabled.get(inp.id) ? (ev) => onMidi(inp, ev) : null;
      const row = el('label', 'inp'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = inputEnabled.get(inp.id);
      cb.addEventListener('change', () => { inputEnabled.set(inp.id, cb.checked); refreshInputs(); });
      const led = el('span', 'led'); led.dataset.id = inp.id;
      row.append(cb, el('span', 'nm', inp.name || inp.id), led);
      list.appendChild(row);
    });
    const n = ins.filter(i => i.state === 'connected').length;
    const pill = $('midiPill'); pill.classList.toggle('ok', n > 0);
    pill.textContent = n > 0 ? t('midi.connected') + ' · ' + n : t('midi.connected') + ' · 0';
    if (!ins.length) setMidiMsg('midi.noDevices', 'info'); else if ($('midiMsg').dataset.key === 'midi.noDevices') setMidiMsg(null);
  }
  function flashLed(id) { const led = document.querySelector('.led[data-id="' + CSS.escape(id) + '"]'); if (!led) return; led.classList.add('flash'); clearTimeout(led._t); led._t = setTimeout(() => led.classList.remove('flash'), 90); }
  function onMidi(input, ev) {
    const d = ev.data; if (!d || !d.length) return;
    const status = d[0]; if (status >= 0xF8) return; // clock, active sensing, etc.
    flashLed(input.id);
    const type = status & 0xF0, ch = (status & 0x0F) + 1;
    if (status < 0xF0 && S.channel && ch !== S.channel) return;
    const ts = ev.timeStamp;
    const d1 = d[1], d2 = d[2];
    if (type === 0x90 && d2 > 0) {
      logMidi({ kind: 'on', input, ch, text: noteName(d1) + ' (' + d1 + ')  vel ' + d2 });
      playNote('m:' + input.id + ':' + ch + ':' + d1, transform(d1), S.velFixed ? 100 : d2, ts);
    } else if (type === 0x80 || type === 0x90) {
      logMidi({ kind: 'off', input, ch, text: noteName(d1) + ' (' + d1 + ')' });
      releaseNote('m:' + input.id + ':' + ch + ':' + d1, ts);
    } else if (type === 0xB0) {
      logMidi({ kind: 'cc', input, ch, text: 'CC ' + d1 + ' = ' + d2 });
      if (d1 === 64) setPedal(d2 >= 64, ts);
      else if (d1 === 123 || d1 === 120) panic();
    } else if (type === 0xE0) {
      const v = (((d2 << 7) | d1) - 8192) / 8192;
      logMidi({ kind: 'pb', input, ch, text: v.toFixed(3) });
      setBendLive(v, ts);
    } else if (type === 0xC0) logMidi({ kind: 'pc', input, ch, text: '#' + d1 });
    else if (type === 0xD0 || type === 0xA0) logMidi({ kind: 'at', input, ch, text: String(d2 != null ? d2 : d1) });
    else logMidi({ kind: 'other', input, ch, text: Array.from(d).join(' ') });
  }
  const KIND_KEY = { on: 'msg.noteOn', off: 'msg.noteOff', cc: 'msg.cc', pb: 'msg.pb', pc: 'msg.pc', at: 'msg.at', other: 'msg.other' };
  function logMidi(m) {
    const last = monLines[monLines.length - 1];
    m.time = new Date();
    if (last && (m.kind === 'pb' || m.kind === 'at') && last.kind === m.kind && last.ch === m.ch && last.input === m.input) monLines[monLines.length - 1] = m;
    else monLines.push(m);
    if (monLines.length > 10) monLines.shift();
    monDirty = true;
  }
  function renderMonitor() {
    const box = $('monitor'); box.innerHTML = '';
    if (!monLines.length) { box.appendChild(el('div', 'empty-m', t('midi.waiting'))); return; }
    monLines.slice().reverse().forEach(m => {
      const ln = el('div', 'ln ' + m.kind);
      const tm = m.time, ts = [tm.getHours(), tm.getMinutes(), tm.getSeconds()].map(v => String(v).padStart(2, '0')).join(':') + '.' + String(tm.getMilliseconds()).padStart(3, '0');
      const i = el('i', null, ts + '  '); const b = el('b', null, t(KIND_KEY[m.kind]));
      ln.append(i, b, document.createTextNode('  ch' + m.ch + '  ' + m.text + '  '), el('i', null, m.input.name || ''));
      box.appendChild(ln);
    });
  }
  setInterval(() => { if (monDirty) { monDirty = false; renderMonitor(); } }, 60);
  $('monClear').addEventListener('click', () => { monLines.length = 0; renderMonitor(); });
  function buildChannelSel() {
    const sel = $('midiChannel'); sel.innerHTML = '';
    const o0 = el('option', null, t('midi.allChannels')); o0.value = 0; sel.appendChild(o0);
    for (let i = 1; i <= 16; i++) { const o = el('option', null, String(i)); o.value = i; sel.appendChild(o); }
    sel.value = S.channel;
  }
  $('midiChannel').addEventListener('change', (e) => { S.channel = parseInt(e.target.value, 10); });
  $('velMode').addEventListener('change', (e) => { S.velFixed = e.target.value === 'fixed'; });

  /* ================= instrument panel ================= */
  const paramEls = {};
  function fmtVal(def, v) {
    switch (def.fmt) {
      case 'pct': return Math.round(v * 100) + '%';
      case 'sec': return v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s';
      case 'hz': return v >= 1000 ? (v / 1000).toFixed(1) + ' kHz' : Math.round(v) + ' Hz';
      case 'hzs': return v.toFixed(1) + ' Hz';
      case 'int': return (v > 0 ? '+' : '') + Math.round(v);
      default: return v.toFixed(2);
    }
  }
  const toPos = (def, v) => def.scale === 'log' ? Math.round(1000 * Math.log(v / def.min) / Math.log(def.max / def.min)) : v;
  const fromPos = (def, p) => {
    if (def.scale === 'log') return def.min * Math.pow(def.max / def.min, p / 1000);
    return p;
  };
  function buildInstrument() {
    const host = $('instParams'); host.innerHTML = '';
    Synth.GROUPS.forEach((gid, gi) => {
      const det = el('details', 'grp'); if (gi < 1 || gid === 'env') det.open = true;
      const sum = el('summary'); sum.dataset.i18n = 'g.' + gid; det.appendChild(sum);
      Synth.PARAM_DEFS.filter(d => d.group === gid).forEach(def => {
        const row = el('div', 'prow' + (def.type === 'select' ? ' sel' : ''));
        const lab = el('label'); lab.dataset.i18n = 'p.' + def.key; lab.htmlFor = 'p_' + def.key; row.appendChild(lab);
        if (def.type === 'select') {
          const sel = el('select'); sel.id = 'p_' + def.key;
          def.options.forEach(o => { const op = el('option'); op.value = o; op.dataset.i18n = def.opt + '.' + o; sel.appendChild(op); });
          sel.addEventListener('change', () => { S.inst.params[def.key] = sel.value; onParamEdited(); });
          row.appendChild(sel); paramEls[def.key] = { input: sel };
        } else {
          const inp = el('input'); inp.type = 'range'; inp.id = 'p_' + def.key;
          if (def.scale === 'log') { inp.min = 0; inp.max = 1000; inp.step = 1; } else { inp.min = def.min; inp.max = def.max; inp.step = def.step; }
          const val = el('span', 'val');
          inp.addEventListener('input', () => {
            let v = fromPos(def, parseFloat(inp.value));
            if (def.scale === 'log') v = Math.round(v * 1000) / 1000;
            S.inst.params[def.key] = v; val.textContent = fmtVal(def, v); onParamEdited();
          });
          row.append(val, inp); paramEls[def.key] = { input: inp, val, def };
        }
        det.appendChild(row);
      });
      host.appendChild(det);
    });
    I18N.applyStatic(host);
    syncInstrumentUI();
  }
  function syncInstrumentUI() {
    Synth.PARAM_DEFS.forEach(def => {
      const pe = paramEls[def.key]; const v = S.inst.params[def.key];
      if (def.type === 'select') pe.input.value = v;
      else { pe.input.value = toPos(def, v); pe.val.textContent = fmtVal(def, v); }
    });
    $('presetSel').value = S.inst.presetId in presetOptionIds() ? S.inst.presetId : 'custom';
    $('curSound').textContent = (PresetLib.name(S.inst.presetId, I18N.lang)) || t('pr.custom');
    document.querySelectorAll('.pcard').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === S.inst.presetId));
  }
  function presetOptionIds() { const o = {}; PresetLib.list.concat(PresetLib.mine()).forEach(p => { o[p.id] = 1; }); return o; }
  function buildPresetSel() {
    const sel = $('presetSel'); sel.innerHTML = '';
    PresetLib.CATS.forEach(cat => {
      const og = el('optgroup'); og.label = t('cat.' + cat);
      PresetLib.list.filter(p => p.cat === cat).forEach(p => { const o = el('option', null, p.names[I18N.lang] || p.names.en); o.value = p.id; og.appendChild(o); });
      sel.appendChild(og);
    });
    const mine = PresetLib.mine();
    if (mine.length) { const og = el('optgroup'); og.label = t('cat.mine'); mine.forEach(m => { const o = el('option', null, m.name); o.value = m.id; og.appendChild(o); }); sel.appendChild(og); }
    const c = el('option', null, t('pr.custom')); c.value = 'custom'; sel.appendChild(c);
    sel.value = S.inst.presetId in presetOptionIds() ? S.inst.presetId : 'custom';
  }

  /* ---- simple tab ---- */
  const macroEls = { bright: $('mBright'), length: $('mLength'), space: $('mSpace') };
  function resetMacros() { Object.values(macroEls).forEach(e => { e.value = 0.5; }); }
  function applyMacros() {
    const b = S.inst.base, p = S.inst.params;
    const bv = parseFloat(macroEls.bright.value), lv = parseFloat(macroEls.length.value), sv = parseFloat(macroEls.space.value);
    p.cutoff = clamp(b.cutoff * Math.pow(2, (bv - 0.5) * 4), 40, 18000);
    p.decay = clamp(b.decay * Math.pow(2, (lv - 0.5) * 2), 0.01, 3);
    p.release = clamp(b.release * Math.pow(2, (lv - 0.5) * 3), 0.01, 5);
    p.reverb = clamp(b.reverb + (sv - 0.5), 0, 1);
    if (liveCh) Synth.updateChannel(liveCh);
    syncInstrumentUI();
  }
  Object.values(macroEls).forEach(e => e.addEventListener('input', applyMacros));
  function auditionNote(low) {
    ensureAudio();
    const key = 'aud', note = low ? 36 : 60;
    playNote(key, note, 100); setTimeout(() => releaseNote(key), 650);
  }
  function renderSimple() {
    const chips = $('catChips'); chips.innerHTML = '';
    const cats = PresetLib.CATS.concat(['mine']);
    cats.forEach(c => {
      const b = el('button', 'chip', t('cat.' + c)); b.type = 'button'; b.setAttribute('aria-pressed', S.simpleCat === c);
      b.addEventListener('click', () => { S.simpleCat = c; renderSimple(); });
      chips.appendChild(b);
    });
    const grid = $('presetGrid'); grid.innerHTML = '';
    if (S.simpleCat === 'mine') {
      const mine = PresetLib.mine();
      if (!mine.length) grid.appendChild(el('div', 'grid-empty', t('mine.empty')));
      mine.forEach(m => {
        const c = el('div', 'pcard', m.name); c.dataset.id = m.id; c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-pressed', S.inst.presetId === m.id);
        const del = el('span', 'del', '×'); del.title = t('mine.delete');
        del.addEventListener('click', (e) => { e.stopPropagation(); PresetLib.deleteMine(m.id); buildPresetSel(); renderSimple(); syncInstrumentUI(); });
        c.appendChild(del);
        const go = () => { chooseSound(m.id, m.params, false); };
        c.addEventListener('click', go); c.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
        grid.appendChild(c);
      });
    } else {
      PresetLib.list.filter(p => p.cat === S.simpleCat).forEach(p => {
        const c = el('button', 'pcard', p.names[I18N.lang] || p.names.en); c.type = 'button'; c.dataset.id = p.id; c.setAttribute('aria-pressed', S.inst.presetId === p.id);
        if (p.low) c.appendChild(el('span', 'low', '♪ ' + t('simple.low')));
        c.addEventListener('click', () => chooseSound(p.id, p.params, p.low));
        grid.appendChild(c);
      });
    }
  }
  function chooseSound(id, params, low) { setInstrument(params, id); auditionNote(low); }
  $('mineSave').addEventListener('click', () => {
    const name = $('mineName').value.trim() || ((PresetLib.name(S.inst.presetId, I18N.lang) || t('pr.custom')) + ' *');
    const m = PresetLib.saveMine(name, S.inst.params);
    S.inst.presetId = m.id; $('mineName').value = ''; S.simpleCat = 'mine';
    buildPresetSel(); renderSimple(); syncInstrumentUI();
  });
  function setTab(tab) {
    S.tab = tab; try { localStorage.setItem('midimovie.tab', tab); } catch (e) { /* ignore */ }
    $('tabSimple').hidden = tab !== 'simple'; $('tabPro').hidden = tab !== 'pro';
    $('tabBtnSimple').setAttribute('aria-selected', tab === 'simple'); $('tabBtnPro').setAttribute('aria-selected', tab === 'pro');
  }
  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

  function setInstrument(params, presetId) {
    S.inst.params = Object.assign({}, Synth.BASE, params); S.inst.presetId = presetId || 'custom';
    S.inst.base = Object.assign({}, S.inst.params); resetMacros();
    if (liveCh) { liveCh.params = S.inst.params; Synth.updateChannel(liveCh); }
    syncInstrumentUI();
  }
  function onParamEdited() {
    S.inst.presetId = 'custom'; S.inst.base = Object.assign({}, S.inst.params); resetMacros();
    $('presetSel').value = 'custom'; $('curSound').textContent = t('pr.custom');
    document.querySelectorAll('.pcard').forEach(c => c.setAttribute('aria-pressed', 'false'));
    if (liveCh) { liveCh.params = S.inst.params; Synth.updateChannel(liveCh); }
  }
  $('presetSel').addEventListener('change', (e) => { const id = e.target.value; if (id === 'custom') return; const p = PresetLib.get(id); if (p) { setInstrument(p.params, id); auditionNote(p.low); } });
  $('randBtn').addEventListener('click', () => {
    const r = Math.random, pick = (a) => a[Math.floor(r() * a.length)], lr = (a, b) => a * Math.pow(b / a, r());
    const W = ['sine', 'triangle', 'sawtooth', 'square'];
    const p = Object.assign({}, Synth.BASE, {
      wave1: pick(W), wave2: r() < 0.6 ? pick(W) : 'off', osc2Level: 0.2 + r() * 0.8, osc2Semi: pick([-12, -7, 0, 0, 5, 7, 12]), osc2Detune: Math.round(-30 + r() * 60),
      noise: r() < 0.3 ? r() * 0.5 : 0, fmAmount: r() < 0.4 ? +(r() * 4).toFixed(2) : 0, fmRatio: pick([0.5, 1, 1.5, 2, 3, 3.5, 5]), fmDecay: +(0.05 + r() * 1.5).toFixed(2),
      filterType: r() < 0.85 ? 'lowpass' : pick(['highpass', 'bandpass']), cutoff: Math.round(lr(400, 12000)), resonance: +(0.5 + r() * 7).toFixed(1), keytrack: +r().toFixed(2), fEnv: +(-2 + r() * 6).toFixed(1), fDecay: +(0.05 + r() * 1.2).toFixed(2),
      attack: +(r() < 0.65 ? lr(0.001, 0.03) : lr(0.05, 1)).toFixed(3), decay: +(0.05 + r() * 1.2).toFixed(2), sustain: r() < 0.3 ? 0 : +(0.2 + r() * 0.8).toFixed(2), release: +(0.05 + r() * 1.4).toFixed(2),
      pitchEnv: r() < 0.25 ? Math.round(-24 + r() * 48) : 0, pitchDecay: +(0.03 + r() * 0.3).toFixed(2), vibDepth: r() < 0.3 ? Math.round(5 + r() * 40) : 0, vibRate: +(3 + r() * 5).toFixed(1),
      reverb: +(r() * 0.6).toFixed(2), gain: 0.5
    });
    if (p.wave1 === 'off' && p.wave2 === 'off') p.wave1 = 'sawtooth';
    setInstrument(p, 'custom');
  });

  /* ================= export / project ================= */
  function toast(msg) { const e = $('toast'); e.textContent = msg; e.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { e.hidden = true; }, 3200); }
  function safeName(s) { return (s || 'midimovie').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'midimovie'; }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000); }
  async function exportLayers(layers, label, btn) {
    layers = layers.filter(l => l.notes.length);
    if (!layers.length) { toast(t('exp.nothing')); return; }
    const sr = parseInt($('expRate').value, 10);
    let end = 0;
    layers.forEach(l => { const off = (l.offsetMs || 0) / 1000; l.notes.forEach(n => { end = Math.max(end, n.t + n.d + off + l.params.release * 2 + (l.params.reverb > 0 ? 2.4 : 0.1)); }); });
    const length = Math.max(T.hasVideo ? T.duration : 0, end);
    const prev = btn ? btn.textContent : ''; if (btn) { btn.disabled = true; btn.textContent = t('exp.rendering'); }
    toast(t('exp.rendering'));
    try {
      const buf = await Synth.renderOffline(layers, { sampleRate: sr, length });
      const blob = Synth.encodeWav(buf, $('expNorm').checked);
      const name = safeName(S.videoName || 'midimovie') + '-' + safeName(label) + '.wav';
      download(blob, name); toast(t('exp.done', { name }));
    } catch (err) { console.error(err); toast(String(err && err.message || err)); }
    finally { if (btn) { btn.disabled = false; btn.textContent = prev; } }
  }
  $('expMix').addEventListener('click', () => {
    const audible = S.layers.filter(isAudible);
    exportLayers(audible, 'mix', $('expMix'));
  });
  $('saveProj').addEventListener('click', () => {
    const data = { app: 'MidiMovie', version: 1, nextNum: S.nextNum, inst: S.inst, layers: S.layers.map(l => ({ num: l.num, name: l.name, color: l.color, notes: l.notes, bends: l.bends, params: l.params, presetId: l.presetId, volume: l.volume, mute: l.mute, solo: l.solo, offsetMs: l.offsetMs })) };
    download(new Blob([JSON.stringify(data)], { type: 'application/json' }), safeName(S.videoName || 'midimovie') + '.midimovie.json');
  });
  $('openProj').addEventListener('click', () => $('projFile').click());
  $('projFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'MidiMovie' || !Array.isArray(data.layers)) throw new Error('bad');
      T.pause(); S.layers.forEach(disposeLayer);
      S.layers = data.layers.map((l, i) => ({
        id: 'l' + i + '_' + Date.now(), num: l.num || i + 1, name: l.name || null, color: l.color || COLORS[i % COLORS.length],
        notes: (l.notes || []).map(n => ({ t: +n.t, d: +n.d, n: +n.n, v: +n.v })).filter(n => isFinite(n.t + n.d + n.n + n.v)),
        bends: (l.bends || []).map(b => ({ t: +b.t, v: +b.v })).filter(b => isFinite(b.t + b.v)),
        params: Object.assign({}, Synth.BASE, l.params), presetId: l.presetId || 'custom', volume: l.volume == null ? 1 : +l.volume, mute: !!l.mute, solo: !!l.solo, offsetMs: +l.offsetMs || 0
      }));
      S.nextNum = data.nextNum || S.layers.length + 1;
      if (data.inst && data.inst.params) setInstrument(data.inst.params, data.inst.presetId);
      ensureAudio(); resetScheduler(); refreshAllChannels(); updateUI(); toast(t('proj.loaded'));
    } catch (err) { toast(t('proj.invalid')); }
  });
  window.addEventListener('beforeunload', (e) => { if (S.layers.length || S.pending) { e.preventDefault(); e.returnValue = ''; } });

  /* ================= language ================= */
  function buildLang() {
    const host = $('langSwitch'); host.innerHTML = '';
    I18N.LANGS.forEach(L => {
      const b = el('button', null, L.label); b.type = 'button'; b.lang = L.htmlLang;
      b.setAttribute('aria-pressed', I18N.lang === L.id);
      b.addEventListener('click', () => { I18N.setLang(L.id); });
      host.appendChild(b);
    });
  }
  function updateUI() { updateTransportUI(); renderTake(); renderLayers(); updateStageUI(); }
  function renderAllText() {
    buildLang(); buildCountIn(); buildChannelSel(); buildPresetSel(); renderSimple(); syncInstrumentUI();
    updateUI(); updateOct(); renderMonitor(); I18N.applyStatic();
    refreshInputs();
    if (!midiAccess) { $('midiConnect').textContent = t('midi.connect'); $('midiPill').textContent = t('midi.notConnected'); }
    const m = $('midiMsg'); if (!m.hidden && m.dataset.key) m.textContent = t(m.dataset.key);
    $('recBadge').querySelector('span:last-child').textContent = t('rec.recording');
    updateTransportUI();
  }
  I18N.onChange(renderAllText);

  /* ================= init ================= */
  (function init() {
    buildInstrument();
    try { const tb = localStorage.getItem('midimovie.tab'); if (tb === 'pro' || tb === 'simple') S.tab = tb; } catch (e) { /* ignore */ }
    setTab(S.tab);
    initAudio();
    I18N.setLang(I18N.lang);   // applies static strings + calls renderAllText
    syncInstrumentUI();
    if (!navigator.requestMIDIAccess) setMidiMsg('midi.unsupported');
    else if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connectMIDI(); }).catch(() => {});
    }
    updateKeyLabels();
    requestAnimationFrame(frame);
    // test hook
    window.__mm = { S, T, Synth, playNote, releaseNote, startRecording, stopRecording, keepTake, onMidi, exportLayers, connectMIDI };
  })();
})();
