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
    videoName: '', videoUrl: null,
    markers: [], rate: 1
  };

  /* ================= audio ================= */
  let ctx = null, bus = null, liveCh = null;
  function initAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
    bus = Synth.createBus(ctx, { meter: true });
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
    hasVideo: false, vPlaying: false, vOffset: 0, vBase: 0, vDuration: BLANK_DURATION, rate: 1, fps: 30,
    onEnded: null,
    get duration() { return this.hasVideo ? (isFinite(video.duration) ? video.duration : 0) : this.vDuration; },
    get time() {
      if (this.hasVideo) return video.currentTime;
      return this.vPlaying ? Math.min(this.vDuration, this.vOffset + (performance.now() - this.vBase) / 1000 * this.rate) : this.vOffset;
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
    setRate(r) {
      if (!this.hasVideo && this.vPlaying) { this.vOffset = this.time; this.vBase = performance.now(); }
      this.rate = r; video.defaultPlaybackRate = r; video.playbackRate = r;
      if (this.playing) resetScheduler();
      updateSpeedUI();
    },
    seek(s) {
      s = clamp(s, 0, this.duration || 0);
      if (this.hasVideo) video.currentTime = s;
      else { this.vOffset = s; this.vBase = performance.now(); resetScheduler(); }
    }
  };
  video.addEventListener('play', () => { resetScheduler(); onPlayState(); watchFps(); });
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
    return Math.max(0, tt - (S.latencyMs / 1000) * (T.rate || 1));
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
    E.id = 'pending'; E.sel.clear(); E.hist = []; E.redo = []; fitRoll();
    updateUI();
  }
  function keepTake() {
    const p = S.pending; if (!p) return;
    T.pause();
    p.num = S.nextNum++; p.color = COLORS[(p.num - 1) % COLORS.length]; p.id = 'l' + p.num + '_' + Date.now();
    disposeLayer(p);
    const wasEditing = E.id === 'pending';
    S.layers.push(p); S.pending = null;
    if (wasEditing) E.id = p.id;
    resetScheduler(); refreshAllChannels(); updateUI();
  }
  function discardTake() {
    if (!S.pending) return;
    T.pause(); disposeLayer(S.pending); S.pending = null; updateUI();
  }
  function previewTake() { if (!S.pending) return; ensureAudio(); T.pause(); T.seek(0); T.play(); }

  /* ================= video loading ================= */
  function loadVideoFile(file, opts) {
    if (!file) return;
    opts = opts || {};
    if (S.recording || S.counting) stopRecording();
    T.pause();
    if (S.videoUrl) URL.revokeObjectURL(S.videoUrl);
    S.videoUrl = URL.createObjectURL(file); S.videoName = file.name.replace(/\.[^.]+$/, '');
    video.src = S.videoUrl; T.hasVideo = true; video.load();
    video.volume = parseFloat($('videoVol').value); video.muted = vMuted; video.defaultPlaybackRate = T.rate; video.playbackRate = T.rate; fpsBuf = []; T.fps = 30;
    if (opts.seek) video.addEventListener('loadedmetadata', () => { try { video.currentTime = Math.min(opts.seek, video.duration || opts.seek); } catch (e) { /* ignore */ } }, { once: true });
    if (!opts.fromStore && typeof persistVideo === 'function') persistVideo(file);
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
    updateSpeedUI();
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

  /* ---- speed, frame step, markers, meter ---- */
  function updateSpeedUI() {
    const lock = S.recording || S.counting;
    document.querySelectorAll('#speedSeg button').forEach(b => { b.setAttribute('aria-pressed', parseFloat(b.dataset.rate) === T.rate); b.disabled = lock; });
  }
  document.querySelectorAll('#speedSeg button').forEach(b => b.addEventListener('click', () => { T.setRate(parseFloat(b.dataset.rate)); S.rate = T.rate; }));
  const snapFps = (f) => { for (const c of [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]) if (Math.abs(f - c) / c < 0.03) return c; return Math.round(f * 100) / 100; };
  let fpsBuf = [], fpsPrev = null, fpsWatching = false;
  function watchFps() {
    if (fpsWatching || !video.requestVideoFrameCallback) return; fpsWatching = true; fpsPrev = null;
    const cb = (now, md) => {
      if (fpsPrev && md.presentedFrames === fpsPrev.pf + 1) {
        const d = md.mediaTime - fpsPrev.mt;
        if (d > 0.004 && d < 0.2) { fpsBuf.push(d); if (fpsBuf.length > 40) fpsBuf.shift(); if (fpsBuf.length >= 8) { const a = fpsBuf.slice().sort((x, y) => x - y); T.fps = snapFps(1 / a[a.length >> 1]); } }
      }
      fpsPrev = { pf: md.presentedFrames, mt: md.mediaTime };
      if (!video.paused && !video.ended) video.requestVideoFrameCallback(cb); else fpsWatching = false;
    };
    video.requestVideoFrameCallback(cb);
  }
  function stepFrames(n) {
    if (S.recording || S.counting) return;
    if (T.playing) T.pause();
    const fr = 1 / T.fps, k = Math.floor(T.time / fr + 1e-4);
    T.seek(Math.max(0, (k + n + 0.5) * fr));
  }
  $('btnFrameBack').addEventListener('click', (e) => stepFrames(e.shiftKey ? -10 : -1));
  $('btnFrameFwd').addEventListener('click', (e) => stepFrames(e.shiftKey ? 10 : 1));

  const markTol = () => Math.max(0.5 / T.fps, 0.02);
  function toggleMarker() {
    const tt = T.time, i = S.markers.findIndex(m => Math.abs(m.t - tt) <= markTol());
    if (i >= 0) S.markers.splice(i, 1); else { S.markers.push({ t: tt, name: '' }); S.markers.sort((a, b) => a.t - b.t); }
  }
  function jumpMarker(dir) {
    if (S.recording || S.counting) return;
    const tt = T.time;
    const m = dir > 0 ? S.markers.find(x => x.t > tt + 0.01) : S.markers.slice().reverse().find(x => x.t < tt - 0.01);
    if (m) T.seek(m.t);
  }
  $('btnMarker').addEventListener('click', toggleMarker);

  /* master meter */
  const mc = $('meter'), mg = mc.getContext('2d'); let mvL = 0, mvR = 0, mHold = 0, mHoldAt = 0, mMax = 0;
  const dbOf = (x) => x > 0.00001 ? 20 * Math.log10(x) : -Infinity;
  function drawMeter() {
    const dpr = window.devicePixelRatio || 1, W = 120, H = 22;
    if (mc.width !== W * dpr) { mc.width = W * dpr; mc.height = H * dpr; mc.style.width = W + 'px'; mc.style.height = H + 'px'; }
    let pl = 0, pr = 0; const m = bus && bus.meter;
    if (m) {
      m.aL.getFloatTimeDomainData(m.bL); m.aR.getFloatTimeDomainData(m.bR);
      for (let i = 0; i < m.bL.length; i++) { const a = Math.abs(m.bL[i]), b = Math.abs(m.bR[i]); if (a > pl) pl = a; if (b > pr) pr = b; }
    }
    mvL = Math.max(pl, mvL * 0.88); mvR = Math.max(pr, mvR * 0.88);
    const pk = Math.max(pl, pr), now = performance.now();
    if (pk >= mHold || now - mHoldAt > 1500) { mHold = Math.max(pk, now - mHoldAt > 1500 ? pk : mHold); mHoldAt = now; }
    mMax = Math.max(mMax, pk);
    mg.setTransform(dpr, 0, 0, dpr, 0, 0); mg.clearRect(0, 0, W, H);
    const pos = (v) => clamp((dbOf(v) + 60) / 60, 0, 1) * W;
    [[mvL, 3], [mvR, 12]].forEach(([v, y]) => {
      mg.fillStyle = '#1b1e25'; mg.fillRect(0, y, W, 7);
      const w = pos(v), g = mg.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#41d392'); g.addColorStop(0.72, '#41d392'); g.addColorStop(0.88, '#ffd166'); g.addColorStop(1, '#ff3b4a');
      mg.fillStyle = g; mg.fillRect(0, y, w, 7);
    });
    const hx = pos(mHold); if (hx > 2) { mg.fillStyle = '#fff'; mg.fillRect(Math.min(W - 2, hx), 1, 2, 20); }
    const dbv = dbOf(mMax); const txt = $('meterText'), s = isFinite(dbv) ? dbv.toFixed(1) : '−∞';
    if (txt.textContent !== s) { txt.textContent = s; txt.classList.toggle('clip', dbv > -0.3); }
  }
  mc.addEventListener('click', () => { mMax = 0; mHold = 0; });

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
  function soundName(id) { if (!id) return null; if (id.indexOf('smp:') === 0) return Sampler.name(id.slice(4)) || null; return PresetLib.name(id, I18N.lang); }
  function soundLabel(l) { return soundName(l.presetId) || t('pr.custom'); }
  function renderLayers() {
    const list = $('layerList'); list.innerHTML = '';
    if (!S.layers.length) { const d = document.createElement('div'); d.className = 'empty'; d.textContent = t('layers.empty'); list.appendChild(d); }
    S.layers.forEach(l => list.appendChild(layerEl(l)));
    $('expMix').disabled = !S.layers.length;
  }
  let menuEl = null;
  const onDocDown = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; document.removeEventListener('pointerdown', onDocDown, true); } }
  function popMenu(anchor, items) {
    closeMenu(); const m = el('div', 'popmenu'); m.setAttribute('role', 'menu');
    items.forEach(it => {
      if (it.sep) { m.appendChild(el('div', 'sep')); return; }
      const b = el('button', it.danger ? 'danger' : '', it.label); b.type = 'button'; b.setAttribute('role', 'menuitem'); if (it.tip) b.title = it.tip;
      b.addEventListener('click', () => { closeMenu(); it.fn(); }); m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    m.style.left = Math.max(8, r.right + window.scrollX - m.offsetWidth) + 'px'; m.style.top = (r.bottom + window.scrollY + 4) + 'px';
    menuEl = m; document.addEventListener('pointerdown', onDocDown, true);
  }
  function duplicateLayer(l) {
    const c = JSON.parse(JSON.stringify(layerData(l))); c.num = S.nextNum++; c.id = 'l' + c.num + '_' + Date.now();
    c.name = layerLabel(l) + ' ' + t('layer.copy'); c.color = COLORS[(c.num - 1) % COLORS.length];
    S.layers.push(buildLayer(c, S.layers.length)); refreshAllChannels(); renderLayers();
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function layerEl(l) {
    const root = el('div', 'layer' + (isAudible(l) ? '' : ' dim') + (typeof E !== 'undefined' && E.id === l.id ? ' editing' : '')); root.style.setProperty('--c', l.color);
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
    const ed = el('button', 'btn small', t('layer.edit')); ed.addEventListener('click', () => { setEditTarget(l.id); $('rollCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
    const more = el('button', 'btn small ghost', '⋯'); more.title = t('layer.more'); more.setAttribute('aria-label', t('layer.more')); more.setAttribute('aria-haspopup', 'menu');
    more.addEventListener('click', (ev) => {
      ev.stopPropagation();
      popMenu(more, [
        { label: t('layer.useSound'), tip: t('layer.useSoundTip'), fn: () => setInstrument(Object.assign({}, l.params), l.presetId) },
        { label: t('layer.applySound'), tip: t('layer.applySoundTip'), fn: () => { l.params = Object.assign({}, S.inst.params); l.presetId = S.inst.presetId; refreshChannel(l); if (T.playing) resetScheduler(); renderLayers(); } },
        { sep: true },
        { label: t('layer.exportWav'), fn: () => window.UI && UI.exportWav([l], layerLabel(l)) },
        { label: t('layer.exportMidi'), fn: () => window.UI && UI.exportMidi([l], layerLabel(l)) },
        { sep: true },
        { label: t('layer.duplicate'), fn: () => duplicateLayer(l) }
      ]);
    });
    acts.append(ed, more);
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
    // markers
    S.markers.forEach((m, i) => {
      const mx = Math.round(x(m.t)) + 0.5;
      g2.strokeStyle = 'rgba(76,201,240,.5)'; g2.setLineDash([3, 3]); g2.beginPath(); g2.moveTo(mx, RULER); g2.lineTo(mx, H); g2.stroke(); g2.setLineDash([]);
      g2.fillStyle = '#4cc9f0'; g2.beginPath(); g2.moveTo(mx, 3); g2.lineTo(mx + 8, 3); g2.lineTo(mx + 5, 7); g2.lineTo(mx + 8, 11); g2.lineTo(mx, 11); g2.closePath(); g2.fill();
      g2.fillRect(mx - 0.5, 3, 1.5, RULER - 3);
      g2.font = '600 9px system-ui, sans-serif'; g2.fillStyle = '#9fe3f7'; g2.fillText(m.name || String(i + 1), mx + 11, 8);
    });
    // playhead
    const px = Math.round(x(T.time)) + 0.5;
    g2.strokeStyle = '#ffffff'; g2.lineWidth = 1.5; g2.beginPath(); g2.moveTo(px, 0); g2.lineTo(px, H); g2.stroke(); g2.lineWidth = 1;
    g2.fillStyle = '#fff'; g2.beginPath(); g2.moveTo(px - 5, 0); g2.lineTo(px + 5, 0); g2.lineTo(px, 7); g2.fill();
  }
  let scrubbing = false;
  function scrubTo(e) { const r = cv.getBoundingClientRect(); T.seek(((e.clientX - r.left) / r.width) * (T.duration || 0)); }
  function markerAt(e) {
    const r = cv.getBoundingClientRect(), dur = T.duration || BLANK_DURATION;
    if (e.clientY - r.top > RULER) return -1;
    let best = -1, bd = 9;
    S.markers.forEach((m, i) => { const d = Math.abs(((m.t / dur) * r.width) - (e.clientX - r.left) + 4); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  cv.addEventListener('pointerdown', (e) => {
    if (S.recording || S.counting) return;
    const mi = markerAt(e);
    if (mi >= 0) { if (e.shiftKey) S.markers.splice(mi, 1); else T.seek(S.markers[mi].t); return; }
    scrubbing = true; cv.setPointerCapture(e.pointerId); scrubTo(e);
  });
  cv.addEventListener('dblclick', (e) => {
    const mi = markerAt(e); if (mi < 0) return;
    const n = prompt(t('mk.rename'), S.markers[mi].name || ''); if (n != null) S.markers[mi].name = n.trim().slice(0, 24);
  });
  cv.addEventListener('pointermove', (e) => { if (scrubbing) scrubTo(e); });
  ['pointerup', 'pointercancel'].forEach(ev => cv.addEventListener(ev, () => { scrubbing = false; }));

  function frame() {
    drawTimeline(); if (typeof drawRoll === 'function') drawRoll(); drawVel(); drawMeter();
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
  const piano = $('piano'), keyEls = {}, PK = { base: 48 };
  const isNarrow = () => window.innerWidth < 720;
  let lastNarrow = null;
  function buildPiano() {
    piano.innerHTML = ''; Object.keys(keyEls).forEach(k => { delete keyEls[k]; });
    const LO = isNarrow() ? PK.base : 36, HI = isNarrow() ? PK.base + 36 : 96, isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
    let whites = 0; for (let n = LO; n <= HI; n++) if (!isBlack(n)) whites++;
    const ww = 100 / whites; let wi = 0;
    for (let n = LO; n <= HI; n++) {
      const k = el('div', 'key ' + (isBlack(n) ? 'black' : 'white')); k.dataset.note = n;
      if (isBlack(n)) { k.style.left = (wi * ww - ww * 0.3) + '%'; k.style.width = (ww * 0.6) + '%'; }
      else { k.style.left = (wi * ww) + '%'; k.style.width = ww + '%'; wi++; if (n % 12 === 0) k.append(el('span', 'lbl', 'C' + (Math.floor(n / 12) - 1))); }
      piano.appendChild(k); keyEls[n] = k;
    }
    lastNarrow = isNarrow(); document.querySelector('.piano-wrap').classList.toggle('narrow', lastNarrow);
    refreshKeys(); updateKeyLabels();
  }
  window.addEventListener('resize', () => { if (isNarrow() !== lastNarrow) buildPiano(); });
  $('pianoLeft').addEventListener('click', () => { PK.base = clamp(PK.base - 12, 24, 84); buildPiano(); });
  $('pianoRight').addEventListener('click', () => { PK.base = clamp(PK.base + 12, 24, 84); buildPiano(); });
  const pKeys = new Map(); // pointerId -> { key, note }  (multi-touch + glissando)
  const keyAt = (x, y) => { const e = document.elementFromPoint(x, y), k = e && e.closest && e.closest('.key'); return k && piano.contains(k) ? k : null; };
  const velFrom = (k, y) => { const r = k.getBoundingClientRect(); return clamp(Math.round(45 + 82 * ((y - r.top) / Math.max(1, r.height))), 30, 127); };
  piano.addEventListener('pointerdown', (e) => {
    const k = keyAt(e.clientX, e.clientY); if (!k) return;
    e.preventDefault(); try { piano.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const n = +k.dataset.note, key = 'ui:' + e.pointerId + ':' + n;
    pKeys.set(e.pointerId, { key, note: n }); playNote(key, n, velFrom(k, e.clientY), e.timeStamp);
  });
  piano.addEventListener('pointermove', (e) => {
    const cur = pKeys.get(e.pointerId); if (!cur) return;
    const k = keyAt(e.clientX, e.clientY); if (!k) return; const n = +k.dataset.note; if (n === cur.note) return;
    releaseNote(cur.key, e.timeStamp); const key = 'ui:' + e.pointerId + ':' + n;
    pKeys.set(e.pointerId, { key, note: n }); playNote(key, n, velFrom(k, e.clientY), e.timeStamp);
  });
  const upPiano = (e) => { const cur = pKeys.get(e.pointerId); if (cur) { pKeys.delete(e.pointerId); releaseNote(cur.key, e.timeStamp); } };
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
    if (isTextTarget(e) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]')) return;
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) togglePlay(); return; }
    if (e.key === 'Escape') { closeMenu(); stopAll(); return; }
    if (e.key === 'Home') { e.preventDefault(); if (!(S.recording || S.counting)) T.seek(0); return; }
    if (e.key === ',' || e.key === '<') { e.preventDefault(); stepFrames(e.shiftKey ? -10 : -1); return; }
    if (e.key === '.' || e.key === '>') { e.preventDefault(); stepFrames(e.shiftKey ? 10 : 1); return; }
    if (e.key === '[') { jumpMarker(-1); return; }
    if (e.key === ']') { jumpMarker(1); return; }
    if (e.key.toLowerCase() === 'm' && !e.repeat) { toggleMarker(); return; }
    if (e.key === '?') { if (window.UI) UI.open('dlgKeys'); return; }
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
    $('curSound').textContent = soundName(S.inst.presetId) || t('pr.custom');
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
    $('tabSimple').hidden = tab !== 'simple'; $('tabPro').hidden = tab !== 'pro'; $('tabSampler').hidden = tab !== 'sampler';
    $('tabBtnSimple').setAttribute('aria-selected', tab === 'simple'); $('tabBtnPro').setAttribute('aria-selected', tab === 'pro'); $('tabBtnSampler').setAttribute('aria-selected', tab === 'sampler');
    if (tab === 'sampler' && window.UI && UI.onSamplerShown) UI.onSamplerShown();
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
  /* offline render of layers -> AudioBuffer (null if nothing to render) */
  async function renderAudio(layers, sr) {
    layers = layers.filter(l => l.notes.length); if (!layers.length) return null;
    await Sampler.ensureAll(Backup.sampleIds({ layers }));
    let end = 0;
    layers.forEach(l => { const off = (l.offsetMs || 0) / 1000; l.notes.forEach(n => { end = Math.max(end, n.t + n.d + off + l.params.release * 2 + (l.params.reverb > 0 ? 2.4 : 0.1)); }); });
    return Synth.renderOffline(layers, { sampleRate: sr || 48000, length: Math.max(T.hasVideo ? T.duration : 0, end) });
  }
  function importedLayers(list) {
    list.forEach(x => {
      const num = S.nextNum++;
      S.layers.push(buildLayer({ id: 'l' + num + '_' + Date.now() + Math.random().toString(36).slice(2, 4), num, name: x.name || null, color: COLORS[(num - 1) % COLORS.length], notes: x.notes, bends: x.bends || [], params: S.inst.params, presetId: S.inst.presetId }, S.layers.length));
    });
    refreshAllChannels(); resetScheduler(); updateUI();
  }
  /* ================= note editor (piano roll) ================= */
  const E = { clip: null, id: null, sel: new Set(), pps: 80, viewStart: 0, lo: 48, hi: 84, snap: 0.01, follow: true, hist: [], redo: [], mode: null, drag: null, pointer: null };
  const rc = $('roll'), rg = rc.getContext('2d');
  const GUT = 46, RH = 22;
  const BLACK = [1, 3, 6, 8, 10];
  const minPps = 8, maxPps = 800;
  const ppsToPos = (p) => Math.round(1000 * Math.log(p / minPps) / Math.log(maxPps / minPps));
  const posToPps = (v) => minPps * Math.pow(maxPps / minPps, v / 1000);

  function editLayer() {
    if (E.id === 'pending') return S.pending || null;
    return S.layers.find(l => l.id === E.id) || null;
  }
  function ensureEditTarget() {
    if (editLayer()) return;
    E.id = S.pending ? 'pending' : (S.layers.length ? S.layers[S.layers.length - 1].id : null);
    E.sel.clear(); fitRoll();
  }
  function setEditTarget(id) { E.id = id; E.sel.clear(); E.hist = []; E.redo = []; fitRoll(); renderLayers(); renderNoteForm(); updateRollHeader(); }
  function updateRollHeader() {
    const l = editLayer();
    $('rollTarget').textContent = l ? t('roll.editing') + ' ' + (l === S.pending ? t('roll.take') : layerLabel(l)) : '';
    $('rollEmpty').hidden = !!l;
  }
  const offOf = (l) => (l.offsetMs || 0) / 1000;
  function fitRoll() {
    const l = editLayer();
    if (l && l.notes.length) {
      let lo = 127, hi = 0, t0 = 1e9, t1 = 0;
      l.notes.forEach(n => { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); t0 = Math.min(t0, n.t); t1 = Math.max(t1, n.t + n.d); });
      lo = Math.max(0, lo - 4); hi = Math.min(127, hi + 4);
      while (hi - lo < 20) { if (lo > 0) lo--; if (hi - lo < 20 && hi < 127) hi++; }
      E.lo = lo; E.hi = hi;
      const W = (rc.clientWidth || 800) - GUT;
      E.pps = clamp(W / Math.max(2, (t1 - t0) * 1.15 + 0.5), minPps, maxPps);
      E.viewStart = Math.max(0, t0 + offOf(l) - 0.3);
    } else { E.lo = 48; E.hi = 84; E.pps = 80; E.viewStart = 0; }
    $('rollZoom').value = ppsToPos(E.pps);
  }
  const xOf = (tt) => GUT + (tt - E.viewStart) * E.pps;
  const tOf = (x) => (x - GUT) / E.pps + E.viewStart;
  function geom() { const H = rc.clientHeight || 250; const rows = E.hi - E.lo + 1; return { H, rows, rowH: (H - RH) / rows }; }
  const yOf = (n, g) => RH + (E.hi - n) * g.rowH;

  function pushHist() {
    const l = editLayer(); if (!l) return;
    E.hist.push({ id: E.id, notes: l.notes.map(n => Object.assign({}, n)) }); if (E.hist.length > 80) E.hist.shift(); E.redo = [];
  }
  function restore(from, to) {
    const h = from.pop(); const l = editLayer(); if (!h || !l || h.id !== E.id) return;
    to.push({ id: E.id, notes: l.notes.map(n => Object.assign({}, n)) });
    l.notes = h.notes; E.sel.clear(); afterEdit(); renderNoteForm();
  }
  $('rollUndo').addEventListener('click', () => restore(E.hist, E.redo));
  $('rollRedo').addEventListener('click', () => restore(E.redo, E.hist));
  function afterEdit(live) {
    const l = editLayer(); if (!l) return;
    if (!live) l.notes.sort((a, b) => a.t - b.t);
    if (ctx) { const r = rtOf(l); r.ev = null; if (T.playing && !live) resetScheduler(); }
    renderLayers(); updateTakeInfoSafe();
  }
  function updateTakeInfoSafe() { if (S.pending) renderTake(); }
  function snapT(v) {
    if (E.snap <= 0) return v;
    const tol = 6 / E.pps; let best = null, bd = tol;
    S.markers.forEach(m => { const d = Math.abs(m.t - v); if (d < bd) { bd = d; best = m.t; } });
    return best != null ? best : Math.round(v / E.snap) * E.snap;
  }
  /* ---- clipboard / transpose ---- */
  function copySel() {
    const sel = Array.from(E.sel); if (!sel.length) return;
    const base = Math.min.apply(null, sel.map(n => n.t));
    E.clip = { notes: sel.map(n => ({ dt: n.t - base, d: n.d, n: n.n, v: n.v })) };
    toast(t('roll.copied', { n: sel.length })); renderNoteForm();
  }
  function pasteClip() {
    const l = editLayer(); if (!l || !E.clip || !E.clip.notes.length) return;
    pushHist(); const base = Math.max(0, T.time - offOf(l));
    const added = E.clip.notes.map(c => ({ t: base + c.dt, d: c.d, n: c.n, v: c.v }));
    added.forEach(n => l.notes.push(n)); E.sel = new Set(added); afterEdit(); renderNoteForm();
  }
  function dupSel() {
    const l = editLayer(), sel = Array.from(E.sel); if (!l || !sel.length) return;
    const t0 = Math.min.apply(null, sel.map(n => n.t)), t1 = Math.max.apply(null, sel.map(n => n.t + n.d));
    pushHist(); const added = sel.map(n => ({ t: n.t + (t1 - t0), d: n.d, n: n.n, v: n.v }));
    added.forEach(n => l.notes.push(n)); E.sel = new Set(added); afterEdit(); renderNoteForm();
  }
  function transposeSel(st) {
    const l = editLayer(); if (!l || !E.sel.size) return;
    pushHist(); E.sel.forEach(n => { n.n = clamp(n.n + st, 0, 127); });
    let lo = 127, hi = 0; E.sel.forEach(n => { lo = Math.min(lo, n.n); hi = Math.max(hi, n.n); });
    if (hi > E.hi - 1) E.hi = Math.min(127, hi + 3); if (lo < E.lo + 1) E.lo = Math.max(0, lo - 3);
    audNote(l, Array.from(E.sel)[0].n, Array.from(E.sel)[0].v); afterEdit(); renderNoteForm();
  }
  $('selCopy').addEventListener('click', copySel);
  $('selPaste').addEventListener('click', pasteClip);
  $('selDup').addEventListener('click', dupSel);
  document.querySelectorAll('[data-st]').forEach(b => b.addEventListener('click', () => transposeSel(parseInt(b.dataset.st, 10))));

  function hit(px, py) {
    const l = editLayer(); if (!l) return null; const g = geom(), off = offOf(l);
    for (let i = l.notes.length - 1; i >= 0; i--) {
      const n = l.notes[i], x0 = xOf(n.t + off), x1 = xOf(n.t + n.d + off), y0 = yOf(n.n, g);
      if (py >= y0 && py <= y0 + g.rowH && px >= x0 - 3 && px <= x1 + 3) {
        const edge = Math.min(7, Math.max(3, (x1 - x0) / 3));
        return { note: n, zone: px >= x1 - edge ? 'right' : (px <= x0 + edge ? 'left' : 'body') };
      }
    }
    return null;
  }
  function audNote(l, n, v) {
    if (!ctx || T.playing) return;
    ensureAudio(); const ch = chanFor(l), now = ctx.currentTime;
    const voice = Synth.startVoice(ch, Object.assign({}, Synth.BASE, l.params), n, v || 100, now + 0.001);
    setTimeout(() => voice.release(ctx.currentTime), 220);
  }
  let lastSeek = 0;
  function seekToNote(l, n) { if (T.playing || S.recording) return; const now = performance.now(); if (now - lastSeek < 50) return; lastSeek = now; T.seek(n.t + offOf(l)); }

  function localXY(e) { const r = rc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  rc.addEventListener('pointerdown', (e) => {
    const l = editLayer(); if (!l) return; rc.focus(); rc.setPointerCapture(e.pointerId);
    const [x, y] = localXY(e); const g = geom();
    if (y < RH) { E.mode = 'scrub'; if (!(S.recording || S.counting)) T.seek(Math.max(0, tOf(x))); return; }
    const h = hit(x, y);
    if (h) {
      if (e.shiftKey) { if (E.sel.has(h.note)) E.sel.delete(h.note); else E.sel.add(h.note); }
      else if (!E.sel.has(h.note)) { E.sel.clear(); E.sel.add(h.note); }
      pushHist(); E.mode = h.zone === 'body' ? 'move' : (h.zone === 'left' ? 'rl' : 'rr');
      E.drag = { x, y, prim: h.note, orig: new Map(Array.from(E.sel).map(n => [n, Object.assign({}, n)])), moved: false };
      audNote(l, h.note.n, h.note.v); seekToNote(l, h.note); renderNoteForm();
    } else {
      if (!e.shiftKey) E.sel.clear();
      E.mode = 'band'; E.drag = { x, y, x2: x, y2: y, base: new Set(E.sel) }; renderNoteForm();
    }
  });
  rc.addEventListener('pointermove', (e) => {
    const l = editLayer(); if (!l) return; const [x, y] = localXY(e); const g = geom(); const off = offOf(l);
    if (!E.mode) { const h = y < RH ? null : hit(x, y); rc.style.cursor = y < RH ? 'col-resize' : (h ? (h.zone === 'body' ? 'grab' : 'ew-resize') : 'crosshair'); return; }
    if (E.mode === 'scrub') { if (!(S.recording || S.counting)) T.seek(Math.max(0, tOf(x))); return; }
    const d = E.drag;
    if (E.mode === 'band') {
      d.x2 = x; d.y2 = y; const xa = Math.min(d.x, x), xb = Math.max(d.x, x), ya = Math.min(d.y, y), yb = Math.max(d.y, y);
      E.sel = new Set(d.base);
      l.notes.forEach(n => { const x0 = xOf(n.t + off), x1 = xOf(n.t + n.d + off), y0 = yOf(n.n, g); if (x1 >= xa && x0 <= xb && y0 + g.rowH >= ya && y0 <= yb) E.sel.add(n); });
      return;
    }
    d.moved = true;
    const dtRaw = (x - d.x) / E.pps, p0 = d.orig.get(d.prim);
    if (E.mode === 'move') {
      let ns = snapT(p0.t + off + dtRaw) - off; const dt = Math.max(ns - p0.t, -Math.min.apply(null, Array.from(d.orig.values()).map(o => o.t)));
      const dn = Math.round((d.y - y) / g.rowH);
      d.orig.forEach((o, n) => { n.t = o.t + dt; const nn = clamp(o.n + dn, 0, 127); if (nn !== n.n && n === d.prim) audNote(l, nn, n.v); n.n = nn; });
      if (E.hi < d.prim.n + 2) E.hi = Math.min(127, d.prim.n + 3); if (E.lo > d.prim.n - 2) E.lo = Math.max(0, d.prim.n - 3);
      seekToNote(l, d.prim);
    } else if (E.mode === 'rr') {
      const end = snapT(p0.t + off + p0.d + dtRaw) - off;
      d.orig.forEach((o, n) => { n.d = Math.max(0.02, o.d + (end - (p0.t + p0.d))); });
    } else if (E.mode === 'rl') {
      const ns = Math.max(0, snapT(p0.t + off + dtRaw) - off), dt = Math.min(ns - p0.t, p0.d - 0.02);
      d.orig.forEach((o, n) => { const k = Math.min(dt, o.d - 0.02); n.t = o.t + k; n.d = o.d - k; });
      seekToNote(l, d.prim);
    }
    renderNoteForm(true);
  });
  const endDrag = () => {
    if (!E.mode) return;
    const was = E.mode, moved = E.drag && E.drag.moved; E.mode = null; E.drag = null;
    if ((was === 'move' || was === 'rl' || was === 'rr')) { if (moved) afterEdit(); else { E.hist.pop(); } renderNoteForm(); }
  };
  rc.addEventListener('pointerup', endDrag); rc.addEventListener('pointercancel', endDrag);
  rc.addEventListener('dblclick', (e) => {
    const l = editLayer(); if (!l) return; const [x, y] = localXY(e); if (y < RH || hit(x, y)) return; const g = geom();
    pushHist();
    const nn = clamp(E.hi - Math.floor((y - RH) / g.rowH), 0, 127), off = offOf(l);
    const note = { t: Math.max(0, snapT(tOf(x)) - off), d: 0.25, n: nn, v: 100 };
    l.notes.push(note); E.sel.clear(); E.sel.add(note); afterEdit(); audNote(l, nn, 100); renderNoteForm();
  });
  rc.addEventListener('wheel', (e) => {
    e.preventDefault(); const [x] = localXY(e);
    if (e.ctrlKey || e.metaKey) {
      const tt = tOf(x); E.pps = clamp(E.pps * Math.exp(-e.deltaY * 0.0025), minPps, maxPps); E.viewStart = Math.max(0, tt - (x - GUT) / E.pps); $('rollZoom').value = ppsToPos(E.pps);
    } else E.viewStart = Math.max(0, E.viewStart + (e.deltaX || e.deltaY) / E.pps);
  }, { passive: false });
  $('rollZoom').addEventListener('input', (e) => { const mid = tOf(GUT + ((rc.clientWidth || 800) - GUT) / 2); E.pps = posToPps(+e.target.value); E.viewStart = Math.max(0, mid - ((rc.clientWidth || 800) - GUT) / 2 / E.pps); });
  $('rollSnap').addEventListener('change', (e) => { E.snap = parseFloat(e.target.value); });
  $('rollFollow').addEventListener('change', (e) => { E.follow = e.target.checked; });
  $('rollFit').addEventListener('click', fitRoll);
  function deleteSel() {
    const l = editLayer(); if (!l || !E.sel.size) return; pushHist();
    l.notes = l.notes.filter(n => !E.sel.has(n)); E.sel.clear(); afterEdit(); renderNoteForm();
  }
  $('rollDel').addEventListener('click', deleteSel);

  window.addEventListener('keydown', (e) => {
    if (isTextTarget(e) || document.querySelector('dialog[open]')) return;
    const l = editLayer(), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod) {
      if (!l) return;
      if (k === 'z') { e.preventDefault(); restore(e.shiftKey ? E.redo : E.hist, e.shiftKey ? E.hist : E.redo); }
      else if (k === 'c') { e.preventDefault(); copySel(); }
      else if (k === 'v') { e.preventDefault(); pasteClip(); }
      else if (k === 'd') { e.preventDefault(); dupSel(); }
      else if (k === 'a') { e.preventDefault(); E.sel = new Set(l.notes); renderNoteForm(); }
      return;
    }
    if (e.altKey) return;
    if (!l || !E.sel.size) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepFrames(e.shiftKey ? -10 : -1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepFrames(e.shiftKey ? 10 : 1); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
    const step = e.shiftKey ? 0.1 : 0.01;
    let dt = 0, dn = 0;
    if (e.key === 'ArrowLeft') dt = -step; else if (e.key === 'ArrowRight') dt = step;
    else if (e.key === 'ArrowUp') dn = e.shiftKey ? 12 : 1; else if (e.key === 'ArrowDown') dn = e.shiftKey ? -12 : -1; else return;
    e.preventDefault(); pushHist();
    const minT = Math.min.apply(null, Array.from(E.sel).map(n => n.t));
    E.sel.forEach(n => { n.t = Math.max(0, n.t + Math.max(dt, -minT)); n.n = clamp(n.n + dn, 0, 127); });
    if (dn) E.sel.forEach(n => audNote(l, n.n, n.v)); else { const f = Array.from(E.sel)[0]; seekToNote(l, f); }
    afterEdit(); renderNoteForm();
  });

  /* ---- velocity lane ---- */
  const vc = $('velLane'), vg = vc.getContext('2d'); let VD = null;
  const VH = 72;
  const yToVel = (y, H) => clamp(Math.round((1 - (y - 5) / (H - 10)) * 127), 1, 127);
  function drawVel() {
    const show = $('rollVel').checked; $('velWrap').hidden = !show; if (!show) return;
    const dpr = window.devicePixelRatio || 1, W = vc.clientWidth || 800, H = VH;
    if (vc.width !== Math.round(W * dpr) || vc.height !== Math.round(H * dpr)) { vc.width = Math.round(W * dpr); vc.height = Math.round(H * dpr); }
    vg.setTransform(dpr, 0, 0, dpr, 0, 0); vg.clearRect(0, 0, W, H);
    vg.fillStyle = '#0e1014'; vg.fillRect(0, 0, W, H);
    vg.strokeStyle = 'rgba(255,255,255,.05)'; [0.25, 0.5, 0.75].forEach(f => { const y = Math.round(5 + (H - 10) * f) + 0.5; vg.beginPath(); vg.moveTo(GUT, y); vg.lineTo(W, y); vg.stroke(); });
    const l = editLayer();
    if (l) {
      const off = offOf(l), col = l === S.pending ? '#ffb347' : l.color;
      vg.save(); vg.beginPath(); vg.rect(GUT, 0, W - GUT, H); vg.clip();
      l.notes.forEach(n => {
        const x = Math.round(xOf(n.t + off)) + 0.5; if (x < GUT - 4 || x > W + 4) return;
        const y = 5 + (H - 10) * (1 - n.v / 127), sel = E.sel.has(n);
        vg.strokeStyle = col; vg.globalAlpha = sel ? 1 : 0.7; vg.lineWidth = 2; vg.beginPath(); vg.moveTo(x, H - 3); vg.lineTo(x, y); vg.stroke();
        vg.globalAlpha = 1; vg.fillStyle = sel ? '#fff' : col; vg.beginPath(); vg.arc(x, y, sel ? 4 : 3.2, 0, 6.3); vg.fill();
      });
      const px = Math.round(xOf(T.time)) + 0.5; vg.strokeStyle = 'rgba(255,255,255,.7)'; vg.lineWidth = 1; vg.beginPath(); vg.moveTo(px, 0); vg.lineTo(px, H); vg.stroke();
      vg.restore();
    }
    vg.fillStyle = '#0b0c0f'; vg.fillRect(0, 0, GUT, H); vg.fillStyle = '#6b7080'; vg.font = '10px ui-monospace, Menlo, monospace'; vg.textBaseline = 'middle'; vg.fillText(t('roll.vel'), 6, H / 2);
  }
  function velAt(e) { const r = vc.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function velHit(x) {
    const l = editLayer(); if (!l) return null; const off = offOf(l); let best = null, bd = 7;
    l.notes.forEach(n => { const d = Math.abs(xOf(n.t + off) - x); if (d <= bd) { bd = d; best = n; } });
    return best;
  }
  vc.addEventListener('pointerdown', (e) => {
    const l = editLayer(); if (!l) return; vc.setPointerCapture(e.pointerId);
    const [x, y] = velAt(e); const h = velHit(x); pushHist();
    if (h) {
      if (!E.sel.has(h)) { if (!e.shiftKey) E.sel.clear(); E.sel.add(h); }
      VD = { mode: 'bar', prim: h, orig: new Map(Array.from(E.sel).map(n => [n, n.v])), changed: false };
    } else VD = { mode: 'paint', lastX: x, changed: false };
    velMove(x, y); renderNoteForm();
  });
  function velMove(x, y) {
    const l = editLayer(); if (!l || !VD) return; const off = offOf(l);
    const v = yToVel(y, VH);
    if (VD.mode === 'bar') { const dv = v - VD.orig.get(VD.prim); VD.orig.forEach((o, n) => { n.v = clamp(o + dv, 1, 127); }); VD.changed = true; }
    else { const a = Math.min(VD.lastX, x) - 4, b = Math.max(VD.lastX, x) + 4; l.notes.forEach(n => { const nx = xOf(n.t + off); if (nx >= a && nx <= b) { n.v = v; VD.changed = true; } }); VD.lastX = x; }
  }
  vc.addEventListener('pointermove', (e) => { const [x, y] = velAt(e); if (!VD) { vc.style.cursor = velHit(x) ? 'ns-resize' : 'crosshair'; return; } velMove(x, y); renderNoteForm(true); });
  const velUp = () => { if (!VD) return; const ch = VD.changed; VD = null; if (ch) afterEdit(); else E.hist.pop(); renderNoteForm(); };
  vc.addEventListener('pointerup', velUp); vc.addEventListener('pointercancel', velUp);

  /* numeric form */
  function renderNoteForm(liveOnly) {
    const l = editLayer(); const sel = Array.from(E.sel);
    const ids = ['nStart', 'nLen', 'nPitch', 'nVel'];
    const one = sel.length === 1 ? sel[0] : null;
    $('noteSel').textContent = !l ? '' : (sel.length > 1 ? t('roll.multi', { n: sel.length }) : (one ? '' : t('roll.noSel')));
    $('selFields').hidden = !one;
    ids.forEach(id => { $(id).disabled = !one; if (!one) $(id).value = ''; });
    const has = sel.length > 0;
    ['selCopy', 'selDup', 'rollDel'].forEach(id => { $(id).disabled = !has; }); document.querySelectorAll('[data-st]').forEach(b => { b.disabled = !has; });
    $('selPaste').disabled = !(E.clip && E.clip.notes.length) || !l;
    if (one && document.activeElement && !ids.includes(document.activeElement.id) || (one && !document.activeElement)) {
      $('nStart').value = (one.t + offOf(l)).toFixed(3); $('nLen').value = Math.round(one.d * 1000); $('nPitch').value = one.n; $('nVel').value = one.v;
    } else if (one) { $('nStart').value = $('nStart').value || (one.t + offOf(l)).toFixed(3); }
  }
  function applyForm(field) {
    const l = editLayer(); const one = E.sel.size === 1 ? Array.from(E.sel)[0] : null; if (!l || !one) return;
    pushHist();
    if (field === 'nStart') one.t = Math.max(0, (parseFloat($('nStart').value) || 0) - offOf(l));
    if (field === 'nLen') one.d = Math.max(0.02, (parseFloat($('nLen').value) || 20) / 1000);
    if (field === 'nPitch') { one.n = clamp(Math.round(parseFloat($('nPitch').value) || 60), 0, 127); audNote(l, one.n, one.v); }
    if (field === 'nVel') one.v = clamp(Math.round(parseFloat($('nVel').value) || 100), 1, 127);
    afterEdit(); document.activeElement.blur(); renderNoteForm(); seekToNote(l, one);
  }
  ['nStart', 'nLen', 'nPitch', 'nVel'].forEach(id => $(id).addEventListener('change', () => applyForm(id)));

  function drawRoll() {
    const l = editLayer(); const dpr = window.devicePixelRatio || 1;
    const W = rc.clientWidth || 800, H = rc.clientHeight || 250;
    if (rc.width !== Math.round(W * dpr) || rc.height !== Math.round(H * dpr)) { rc.width = Math.round(W * dpr); rc.height = Math.round(H * dpr); }
    rg.setTransform(dpr, 0, 0, dpr, 0, 0); rg.clearRect(0, 0, W, H);
    if (!l) return;
    const g = geom(), off = offOf(l), vis = (W - GUT) / E.pps;
    // follow playhead
    if (E.follow && T.playing && !E.mode) {
      const ph = T.time; if (ph > E.viewStart + vis * 0.85 || ph < E.viewStart) E.viewStart = Math.max(0, ph - vis * 0.15);
    }
    // rows
    for (let n = E.lo; n <= E.hi; n++) {
      const y = yOf(n, g), bk = BLACK.includes(n % 12);
      rg.fillStyle = bk ? '#0b0d11' : '#12151b'; rg.fillRect(GUT, y, W - GUT, g.rowH);
      if (n % 12 === 0) { rg.fillStyle = 'rgba(255,255,255,.07)'; rg.fillRect(GUT, y + g.rowH - 1, W - GUT, 1); }
    }
    // time grid
    const steps = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find(s => s * E.pps >= 60) || 300;
    rg.font = '10px ui-monospace, Menlo, monospace'; rg.textBaseline = 'middle';
    if (E.snap > 0 && E.snap * E.pps >= 7) { rg.strokeStyle = 'rgba(255,255,255,.04)'; for (let s = Math.ceil(E.viewStart / E.snap) * E.snap; s < E.viewStart + vis; s += E.snap) { const px = Math.round(xOf(s)) + 0.5; rg.beginPath(); rg.moveTo(px, RH); rg.lineTo(px, H); rg.stroke(); } }
    rg.fillStyle = '#14171d'; rg.fillRect(GUT, 0, W - GUT, RH);
    for (let s = Math.ceil(E.viewStart / step) * step; s < E.viewStart + vis; s += step) {
      const px = Math.round(xOf(s)) + 0.5; rg.strokeStyle = '#2a2f3a'; rg.beginPath(); rg.moveTo(px, 0); rg.lineTo(px, H); rg.stroke();
      rg.fillStyle = '#8b92a3'; rg.fillText(fmtTime(s).replace(/\.0$/, ''), px + 4, RH / 2);
    }
    // markers
    S.markers.forEach((m, i) => {
      const mx = Math.round(xOf(m.t)) + 0.5; if (mx < GUT || mx > W) return;
      rg.strokeStyle = 'rgba(76,201,240,.45)'; rg.setLineDash([3, 3]); rg.beginPath(); rg.moveTo(mx, RH); rg.lineTo(mx, H); rg.stroke(); rg.setLineDash([]);
      rg.fillStyle = '#4cc9f0'; rg.fillRect(mx - 0.5, 0, 1.5, RH); rg.beginPath(); rg.moveTo(mx, 2); rg.lineTo(mx + 8, 2); rg.lineTo(mx + 5, 6); rg.lineTo(mx, 10); rg.closePath(); rg.fill();
      rg.font = '600 9px system-ui, sans-serif'; rg.fillStyle = '#9fe3f7'; rg.fillText(m.name || String(i + 1), mx + 11, 8);
    });
    // video end marker
    if (T.duration) { const px = xOf(T.duration); if (px < W) { rg.fillStyle = 'rgba(255,255,255,.08)'; rg.fillRect(px, RH, W - px, H - RH); } }
    // notes
    rg.save(); rg.beginPath(); rg.rect(GUT, RH, W - GUT, H - RH); rg.clip();
    const col = l === S.pending ? '#ffb347' : l.color;
    l.notes.forEach(n => {
      const x0 = xOf(n.t + off), x1 = xOf(n.t + n.d + off); if (x1 < GUT || x0 > W) return;
      const y0 = yOf(n.n, g), w = Math.max(3, x1 - x0), sel = E.sel.has(n);
      rg.globalAlpha = 0.45 + 0.55 * (n.v / 127); rg.fillStyle = col; rg.fillRect(x0, y0 + 1, w, Math.max(3, g.rowH - 2)); rg.globalAlpha = 1;
      rg.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,.45)'; rg.lineWidth = sel ? 1.8 : 1; rg.strokeRect(x0 + 0.5, y0 + 1.5, w - 1, Math.max(3, g.rowH - 2) - 1);
      if (sel) { rg.fillStyle = '#fff'; rg.fillRect(x1 - 3, y0 + 2, 2, Math.max(2, g.rowH - 4)); rg.fillRect(x0 + 1, y0 + 2, 2, Math.max(2, g.rowH - 4)); }
    });
    if (E.mode === 'band' && E.drag) { const d = E.drag; rg.fillStyle = 'rgba(255,179,71,.12)'; rg.strokeStyle = '#ffb347'; rg.lineWidth = 1; rg.fillRect(Math.min(d.x, d.x2), Math.min(d.y, d.y2), Math.abs(d.x2 - d.x), Math.abs(d.y2 - d.y)); rg.strokeRect(Math.min(d.x, d.x2) + 0.5, Math.min(d.y, d.y2) + 0.5, Math.abs(d.x2 - d.x), Math.abs(d.y2 - d.y)); }
    rg.restore();
    // piano gutter
    rg.fillStyle = '#0b0c0f'; rg.fillRect(0, 0, GUT, H);
    for (let n = E.lo; n <= E.hi; n++) {
      const y = yOf(n, g), bk = BLACK.includes(n % 12);
      rg.fillStyle = bk ? '#1b1e25' : '#d9dbe0'; rg.fillRect(0, y + 0.5, bk ? GUT * 0.62 : GUT - 1, Math.max(1, g.rowH - 1));
      if (n % 12 === 0 && g.rowH >= 7) { rg.fillStyle = '#44485a'; rg.font = '9px ui-monospace, Menlo, monospace'; rg.fillText(noteName(n), GUT - 24, y + g.rowH / 2); }
    }
    // playhead
    const px = Math.round(xOf(T.time)) + 0.5;
    if (px >= GUT && px <= W) { rg.strokeStyle = '#fff'; rg.lineWidth = 1.5; rg.beginPath(); rg.moveTo(px, 0); rg.lineTo(px, H); rg.stroke(); rg.lineWidth = 1; rg.fillStyle = '#fff'; rg.beginPath(); rg.moveTo(px - 5, 0); rg.lineTo(px + 5, 0); rg.lineTo(px, 7); rg.fill(); }
  }

  /* ================= project persistence (IndexedDB autosave) ================= */
  let PID = new URLSearchParams(location.search).get('p');
  const P = { rec: null, lastJson: '', thumb: null, name: '', state: '' };
  const layerData = (l) => ({ id: l.id, num: l.num, name: l.name, color: l.color, notes: l.notes, bends: l.bends, params: l.params, presetId: l.presetId, volume: l.volume, mute: l.mute, solo: l.solo, offsetMs: l.offsetMs });
  function serialize() {
    return {
      app: 'MidiMovie', version: 2, projectName: P.name, nextNum: S.nextNum,
      inst: { presetId: S.inst.presetId, params: S.inst.params },
      markers: S.markers.map(m => ({ t: +m.t.toFixed(4), name: m.name || '' })), layers: S.layers.map(layerData), pending: S.pending ? layerData(S.pending) : null, editId: E.id, videoName: S.videoName,
      settings: { octave: S.octave, transpose: S.transpose, recFrom: S.recFrom, countIn: S.countIn, latencyMs: S.latencyMs, monitor: S.monitor, velFixed: S.velFixed, typing: S.typing, rate: T.rate }
    };
  }
  function buildLayer(l, i) {
    return {
      id: l.id || ('l' + i + '_' + Date.now()), num: l.num || i + 1, name: l.name || null, color: l.color || COLORS[i % COLORS.length],
      notes: (l.notes || []).map(n => ({ t: +n.t, d: +n.d, n: +n.n, v: +n.v })).filter(n => isFinite(n.t + n.d + n.n + n.v)),
      bends: (l.bends || []).map(b => ({ t: +b.t, v: +b.v })).filter(b => isFinite(b.t + b.v)),
      params: Object.assign({}, Synth.BASE, l.params), presetId: l.presetId || 'custom', volume: l.volume == null ? 1 : +l.volume, mute: !!l.mute, solo: !!l.solo, offsetMs: +l.offsetMs || 0
    };
  }
  function applyData(data) {
    T.pause(); S.layers.forEach(disposeLayer); if (S.pending) disposeLayer(S.pending);
    S.layers = data.layers.map(buildLayer);
    S.pending = data.pending ? Object.assign(buildLayer(data.pending, 0), { id: 'p' + Date.now() }) : null;
    S.nextNum = data.nextNum || S.layers.length + 1;
    if (data.inst && data.inst.params) setInstrument(data.inst.params, data.inst.presetId);
    const st = data.settings || {};
    if (st.octave != null) S.octave = clamp(+st.octave || 0, -4, 4);
    if (st.transpose != null) S.transpose = clamp(+st.transpose || 0, -12, 12);
    if (st.recFrom) { S.recFrom = st.recFrom === 'here' ? 'here' : 'start'; $('recFrom').value = S.recFrom; }
    if (st.countIn != null) { S.countIn = +st.countIn || 0; $('countIn').value = S.countIn; }
    if (st.latencyMs != null) { S.latencyMs = +st.latencyMs || 0; $('latency').value = S.latencyMs; }
    if (st.monitor != null) { S.monitor = !!st.monitor; $('monitorLayers').checked = S.monitor; }
    if (st.velFixed != null) { S.velFixed = !!st.velFixed; $('velMode').value = S.velFixed ? 'fixed' : 'normal'; }
    if (st.typing != null) { S.typing = !!st.typing; $('typing').checked = S.typing; }
    S.markers = (data.markers || []).map(m => ({ t: +m.t, name: String(m.name || '').slice(0, 24) })).filter(m => isFinite(m.t)).sort((a, b) => a.t - b.t);
    T.setRate([1, 0.75, 0.5, 0.25].includes(+st.rate) ? +st.rate : 1);
    Sampler.ensureAll(Backup.sampleIds(data)).then(() => { resetScheduler(); renderLayers(); if (window.UI && UI.refreshSampler) UI.refreshSampler(); });
    E.sel.clear(); E.hist = []; E.redo = [];
    E.id = data.pending && S.pending ? 'pending' : (S.layers.some(l => l.id === data.editId) ? data.editId : null);
    ensureAudio(); resetScheduler(); refreshAllChannels(); updateOct(); updateUI(); fitRoll();
  }
  function setSaveState(k) {
    P.state = k; const e = $('saveState'); if (!e) return;
    e.className = 'save-state ' + (k === 'saved' ? 'ok' : (k === 'saving' ? '' : 'warn')); e.textContent = k ? t('proj.' + k) : '';
  }
  async function saveNow(force) {
    if (!P.rec || !Store.available) return;
    const data = serialize(), cmp = JSON.stringify(data);
    if (!force && cmp === P.lastJson) return;
    P.lastJson = cmp; setSaveState('saving');
    data.playhead = T.time;
    Object.assign(P.rec, { data, name: P.name, updated: Date.now(), layerCount: S.layers.length, videoName: S.videoName, thumb: P.thumb || P.rec.thumb || null });
    try { await Store.put(P.rec); setSaveState('saved'); } catch (err) { console.error(err); setSaveState('error'); }
  }
  function persistVideo(file) {
    if (!P.rec || !Store.available) return;
    Store.putVideo(PID, file, file.name).then(() => Store.thumb(file)).then(th => { P.thumb = th || P.thumb; return saveNow(true); })
      .catch(() => { toast(t('proj.videoNotSaved')); });
    Store.persist();
  }
  async function loadProject() {
    if (!Store.available) { setSaveState('error'); toast(t('proj.noStorage')); return; }
    let rec = null;
    try {
      if (!PID) { // opened without a project -> create one on the fly
        PID = Store.newId(); rec = { id: PID, name: t('proj.untitled'), created: Date.now(), updated: Date.now(), layerCount: 0, videoName: '', thumb: null, data: null };
        await Store.put(rec); history.replaceState(null, '', '?p=' + PID);
      } else rec = await Store.get(PID);
    } catch (err) { console.error(err); }
    if (!rec) { toast(t('proj.notFound')); setTimeout(() => location.replace('./'), 1500); return; }
    P.rec = rec; P.name = rec.name; P.thumb = rec.thumb; $('projName').value = rec.name; document.title = rec.name + ' – MidiMovie';
    if (rec.data && rec.data.layers) applyData(rec.data);
    let v = null; try { v = await Store.getVideo(PID); } catch (err) { /* ignore */ }
    if (v && v.blob) loadVideoFile(new File([v.blob], v.name || 'video', { type: v.type || v.blob.type }), { fromStore: true, seek: rec.data && rec.data.playhead });
    P.lastJson = JSON.stringify(serialize()); setSaveState('saved');
    Store.persist();
    setInterval(saveNow, 700);
  }
  $('projName').addEventListener('input', (e) => { P.name = e.target.value.trim() || t('proj.untitled'); document.title = P.name + ' – MidiMovie'; });
  window.addEventListener('pagehide', () => saveNow(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(true); });
  window.addEventListener('beforeunload', (e) => { if (!P.rec || !Store.available) { if (S.layers.length || S.pending) { e.preventDefault(); e.returnValue = ''; } } else if (JSON.stringify(serialize()) !== P.lastJson) { saveNow(true); e.preventDefault(); e.returnValue = ''; } });

  $('saveProj').addEventListener('click', () => {
    download(new Blob([JSON.stringify(serialize())], { type: 'application/json' }), safeName(P.name || S.videoName || 'midimovie') + '.midimovie.json');
  });
  $('openProj').addEventListener('click', () => $('projFile').click());
  $('projFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== 'MidiMovie' || !Array.isArray(data.layers)) throw new Error('bad');
      applyData(data); toast(t('proj.loaded')); saveNow(true);
    } catch (err) { toast(t('proj.invalid')); }
  });

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
  function updateUI() { updateTransportUI(); renderTake(); ensureEditTarget(); renderLayers(); updateStageUI(); updateRollHeader(); renderNoteForm(); }
  function renderAllText() {
    buildLang(); buildCountIn(); buildChannelSel(); buildPresetSel(); renderSimple(); syncInstrumentUI();
    updateUI(); updateOct(); renderMonitor(); I18N.applyStatic();
    refreshInputs();
    if (!midiAccess) { $('midiConnect').textContent = t('midi.connect'); $('midiPill').textContent = t('midi.notConnected'); }
    const m = $('midiMsg'); if (!m.hidden && m.dataset.key) m.textContent = t(m.dataset.key);
    $('recBadge').querySelector('span:last-child').textContent = t('rec.recording');
    updateTransportUI(); if (P.state) setSaveState(P.state);
  }
  I18N.onChange(renderAllText);

  /* ================= init ================= */
  (function init() {
    buildInstrument();
    try { const tb = localStorage.getItem('midimovie.tab'); if (tb === 'pro' || tb === 'simple' || tb === 'sampler') S.tab = tb; } catch (e) { /* ignore */ }
    setTab(S.tab);
    initAudio();
    I18N.setLang(I18N.lang);   // applies static strings + calls renderAllText
    syncInstrumentUI();
    if (!navigator.requestMIDIAccess) setMidiMsg('midi.unsupported');
    else if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'midi' }).then(p => { if (p.state === 'granted') connectMIDI(); }).catch(() => {});
    }
    buildPiano();
    Sampler.refresh().then(() => { renderLayers(); syncInstrumentUI(); if (window.UI && UI.refreshSampler) UI.refreshSampler(); }).catch(() => {});
    requestAnimationFrame(frame);
    loadProject();
    // test hook
    window.MM = { S, T, E, P, toast, download, safeName, serialize, applyData, saveNow, renderAudio, importedLayers, setInstrument, ensureAudio, auditionNote, playNote, releaseNote, isAudible, layerLabel, getPID: () => PID, setTab, t, liveUpdate: () => { if (liveCh) { liveCh.params = S.inst.params; Synth.updateChannel(liveCh); } syncInstrumentUI(); }, renderLayers, syncInstrumentUI, soundName, stepFrames, toggleMarker, jumpMarker, fitRoll };
    window.__mm = { P, serialize, saveNow, renderNoteForm, E, S, T, Synth, playNote, releaseNote, startRecording, stopRecording, keepTake, onMidi, connectMIDI, renderAudio, copySel, pasteClip, dupSel, transposeSel, stepFrames, toggleMarker };
  })();
})();
