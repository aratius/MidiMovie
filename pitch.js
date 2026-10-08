/* Monophonic audio -> MIDI notes (melody tracker).
   YIN pitch tracking on a down-sampled copy, then note segmentation (pitch changes, re-attacks, silences). Pure JS, no model files. */
(function () {
  'use strict';
  const RANGES = { auto: [65, 1100], low: [35, 400], high: [180, 2000] };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const median = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };

  /* buf: AudioBuffer. opts: { range:'auto'|'low'|'high', sens:0..1 (higher = accept shakier pitch), minMs, maxSec, tune:true }
     returns { notes:[{t,d,n,v}], lo, hi, voiced } */
  async function analyze(buf, opts, onProgress) {
    opts = opts || {}; const R = RANGES[opts.range] || RANGES.auto, sens = opts.sens == null ? 0.5 : opts.sens, minNote = (opts.minMs || 80) / 1000;
    const sr0 = buf.sampleRate, k = Math.max(1, Math.round(sr0 / 11025)), sr = sr0 / k;
    const len0 = Math.min(buf.length, Math.round((opts.maxSec || 600) * sr0)), n = Math.floor(len0 / k);
    const x = new Float32Array(n), nch = buf.numberOfChannels;
    for (let c = 0; c < nch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += d[i * k + j]; x[i] += s / k / nch; } }
    const W = Math.max(256, 1 << Math.ceil(Math.log2(sr / R[0] * 2.2))), hop = Math.round(sr * 0.008);
    const tauMin = Math.max(2, Math.floor(sr / R[1])), tauMax = Math.min(W / 2 - 1, Math.ceil(sr / R[0]));
    const nf = Math.max(0, Math.floor((n - W) / hop)); if (nf < 5) return { notes: [], voiced: 0 };
    const f0 = new Float32Array(nf), conf = new Float32Array(nf), rms = new Float32Array(nf), d = new Float32Array(tauMax + 2), cm = new Float32Array(tauMax + 2);
    const thr = 0.08 + 0.22 * sens; // YIN absolute threshold
    const half = W >> 1;
    for (let f = 0; f < nf; f++) {
      const o = f * hop; let e = 0; for (let i = 0; i < W; i++) e += x[o + i] * x[o + i]; rms[f] = Math.sqrt(e / W);
      for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let j = 0; j < half; j++) { const v = x[o + j] - x[o + j + tau]; s += v * v; } d[tau] = s; }
      cm[0] = 1; let run = 0; for (let tau = 1; tau <= tauMax; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
      let tau = -1;
      for (let t = tauMin; t < tauMax; t++) { if (cm[t] < thr) { while (t + 1 < tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; } }
      if (tau < 0) { let m = tauMin; for (let t = tauMin; t <= tauMax; t++) if (cm[t] < cm[m]) m = t; if (cm[m] < thr + 0.12) tau = m; }
      if (tau > 0) {
        let t2 = tau; if (tau > 1 && tau < tauMax) { const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1], den = a - 2 * b + c; if (Math.abs(den) > 1e-9) t2 = tau + 0.5 * (a - c) / den; }
        f0[f] = sr / t2; conf[f] = 1 - cm[tau];
      }
      if ((f & 63) === 0) { if (onProgress) onProgress(f / nf); await tick(); }
    }
    if (onProgress) onProgress(1);
    let pk = 0; for (let f = 0; f < nf; f++) if (rms[f] > pk) pk = rms[f];
    if (pk <= 0) return { notes: [], voiced: 0 };
    const gate = pk * Math.pow(10, -(32 + 14 * sens) / 20), minConf = 0.62 - 0.25 * sens;
    const midi = new Float32Array(nf), voiced = new Uint8Array(nf); let nv = 0;
    for (let f = 0; f < nf; f++) { if (f0[f] > 0 && rms[f] > gate && conf[f] > minConf) { voiced[f] = 1; midi[f] = 69 + 12 * Math.log2(f0[f] / 440); nv++; } }
    if (!nv) return { notes: [], voiced: 0 };
    // 5-frame median on voiced runs (kills single-frame octave jumps)
    const sm = Float32Array.from(midi);
    for (let f = 2; f < nf - 2; f++) if (voiced[f]) { const w = []; for (let j = -2; j <= 2; j++) if (voiced[f + j]) w.push(midi[f + j]); sm[f] = median(w); }
    // global tuning offset (recordings are rarely exactly A=440)
    let off = 0; if (opts.tune !== false) { const fr = []; for (let f = 0; f < nf; f++) if (voiced[f]) fr.push(sm[f] - Math.round(sm[f])); off = median(fr); if (Math.abs(off) < 0.08) off = 0; }
    for (let f = 0; f < nf; f++) if (voiced[f]) sm[f] -= off;
    // segmentation
    const fps = sr / hop, notes = [];
    let cur = null, dev = 0, gap = 0, peakEnv = 0;
    const flush = (endF) => {
      if (!cur) return; const a = cur.start, b = endF; cur = null; if (b <= a) return;
      const ps = []; let pr = 0; for (let f = a; f < b; f++) if (voiced[f]) { ps.push(sm[f]); if (rms[f] > pr) pr = rms[f]; }
      if (!ps.length) return; const dur = (b - a) / fps; if (dur < minNote) return;
      const rel = 20 * Math.log10(pr / pk); notes.push({ t: a / fps, d: dur, n: Math.max(0, Math.min(127, Math.round(median(ps)))), v: Math.max(35, Math.min(122, Math.round(112 + rel * 1.4))) });
    };
    for (let f = 0; f < nf; f++) {
      const pe = peakEnv; peakEnv = Math.max(rms[f], peakEnv * 0.93);
      if (cur && rms[f] < 0.22 * pe) { flush(f - gap); gap = 0; } // energy collapsed: the note ended (also splits repeated notes)
      if (!cur && voiced[f] && rms[f] < 0.35 * pe) continue;      // still inside the previous note's fade-out
      if (!voiced[f]) { if (cur && ++gap > Math.ceil(0.045 * fps)) { flush(f - gap + 1); } continue; }
      if (!cur) { cur = { start: f, ps: [sm[f]] }; dev = 0; gap = 0; continue; }
      gap = 0;
      const c = median(cur.ps.slice(-9));
      if (Math.abs(sm[f] - c) > 0.7) { if (++dev >= 4) { flush(f - dev + 1); cur = { start: f - dev + 1, ps: [] }; for (let j = f - dev + 1; j <= f; j++) cur.ps.push(sm[j]); dev = 0; continue; } }
      else dev = 0;
      // re-attack on the same pitch (repeated notes): energy jumps well above the recent past
      if (f - cur.start > Math.ceil(0.09 * fps)) { let pv = 0; for (let j = 1; j <= 5; j++) pv += rms[f - j]; pv /= 5; let mn = 1e9; for (let j = 1; j <= 5; j++) mn = Math.min(mn, rms[f - j]); if (rms[f] > 1.9 * mn && rms[f] > 1.25 * pv) { flush(f); cur = { start: f, ps: [sm[f]] }; continue; } }
      cur.ps.push(sm[f]);
    }
    flush(nf - gap);
    // glue same-pitch notes separated by a tiny hole
    const out = [];
    notes.forEach(nn => { const p = out[out.length - 1]; if (p && p.n === nn.n && nn.t - (p.t + p.d) < 0.04 && nn.v <= p.v + 6) p.d = nn.t + nn.d - p.t; else out.push(nn); });
    const ns = out.map(o => o.n);
    return { notes: out, lo: ns.length ? Math.min.apply(null, ns) : 0, hi: ns.length ? Math.max.apply(null, ns) : 0, voiced: nv / nf, tuneCents: Math.round(off * 100) };
  }
  window.Pitch = { analyze };
})();
