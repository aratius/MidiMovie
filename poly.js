/* Polyphonic audio -> MIDI via Spotify's Basic Pitch (Apache-2.0), run in the browser with TensorFlow.js.
   The engine is vendored under vendor/basic-pitch/ (see tools/vendor-basic-pitch.sh) and only loaded when used. */
(function () {
  'use strict';
  const BASE = 'vendor/basic-pitch/', LIB = BASE + 'basic-pitch.bundle.js', MODEL = BASE + 'model/model.json';
  let libP = null, model = null;
  function loadLib() {
    if (window.BasicPitchLib) return Promise.resolve(window.BasicPitchLib);
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIB;
      s.onload = () => window.BasicPitchLib ? res(window.BasicPitchLib) : rej(new Error('missing'));
      s.onerror = () => { libP = null; rej(new Error('missing')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  async function available() { try { const r = await fetch(MODEL, { method: 'HEAD' }); return r.ok; } catch (e) { return false; } }
  async function toMono22k(buf, maxSec) {
    const sr = 22050, dur = Math.min(buf.duration, maxSec), oc = new OfflineAudioContext(1, Math.max(1, Math.ceil(dur * sr)), sr);
    const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination); src.start(0); return oc.startRendering();
  }
  /* opts: { sens 0..1, minMs, maxSec }  ->  { notes:[{t,d,n,v}], lo, hi } */
  async function analyze(buf, opts, onProgress) {
    opts = opts || {}; const sens = opts.sens == null ? 0.5 : opts.sens;
    const lib = await loadLib(); // throws Error('missing') when the engine is not installed
    const audio = await toMono22k(buf, opts.maxSec || 300);
    if (!model) model = new lib.BasicPitch(MODEL);
    const frames = [], onsets = [], contours = [];
    const cb = (f, o, c) => { frames.push.apply(frames, f); onsets.push.apply(onsets, o); contours.push.apply(contours, c); };
    const prog = (p) => { if (onProgress) onProgress(p); };
    try { await model.evaluateModel(audio, cb, prog); }
    catch (e) { frames.length = onsets.length = contours.length = 0; await model.evaluateModel(audio.getChannelData(0), cb, prog); }
    const th = Math.max(0.08, Math.min(0.7, 0.55 - 0.6 * sens)), minFrames = Math.max(3, Math.round((opts.minMs || 80) / 11.6));
    const ev = lib.noteFramesToTime(lib.addPitchBendsToNoteEvents(contours, lib.outputToNotesPoly(frames, onsets, th, th, minFrames)));
    const notes = ev.filter(e => e.pitchMidi >= 21 && e.pitchMidi <= 108 && e.durationSeconds > 0.02)
      .map(e => ({ t: e.startTimeSeconds, d: e.durationSeconds, n: Math.round(e.pitchMidi), v: Math.max(30, Math.min(122, Math.round(30 + 95 * Math.min(1, (e.amplitude || 0.5) * 1.2)))) }))
      .sort((a, b) => a.t - b.t || a.n - b.n);
    const ns = notes.map(x => x.n);
    return { notes, lo: ns.length ? Math.min.apply(null, ns) : 0, hi: ns.length ? Math.max.apply(null, ns) : 0 };
  }
  window.Poly = { available, analyze };
})();
