/* Sample library (IndexedDB) + decoding. Decoded buffers live in Synth.samples so voices and offline renders can use them. */
(function () {
  'use strict';
  const meta = new Map();
  let decoder = null;
  const dec = () => decoder || (decoder = new OfflineAudioContext(2, 1, 48000));
  const decodeBlob = async (blob) => dec().decodeAudioData(await blob.arrayBuffer());
  const list = () => Array.from(meta.values()).sort((a, b) => a.created - b.created);
  async function refresh() {
    if (!Store.available) return [];
    const all = await Store.listSamples(); meta.clear();
    all.forEach(s => meta.set(s.id, { id: s.id, name: s.name, dur: s.dur || 0, created: s.created || 0 }));
    return list();
  }
  async function ensure(id) {
    if (!id) return false; if (Synth.samples.has(id)) return true;
    try { const rec = await Store.getSample(id); if (!rec) return false; Synth.samples.set(id, await decodeBlob(rec.blob)); if (!meta.has(id)) meta.set(id, { id, name: rec.name, dur: rec.dur || 0, created: rec.created || 0 }); return true; }
    catch (e) { return false; }
  }
  const ensureAll = (ids) => Promise.all(Array.from(ids).map(ensure));
  async function add(blob, name, fileName) {
    const buf = await decodeBlob(blob);
    const id = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const rec = { id, name: name || 'Sample', blob, type: blob.type, dur: buf.duration, fileName: fileName || name || 'sample.wav', created: Date.now() };
    await Store.putSample(rec); Synth.samples.set(id, buf); meta.set(id, { id, name: rec.name, dur: rec.dur, created: rec.created });
    return id;
  }
  async function remove(id) { await Store.delSample(id); Synth.samples.delete(id); meta.delete(id); }
  async function rename(id, name) { const r = await Store.getSample(id); if (!r) return; r.name = name; await Store.putSample(r); const m = meta.get(id); if (m) m.name = name; }
  async function fromVideo(file, label) { // first 120 s of the video's audio as a WAV sample
    const buf = await decodeBlob(file); const sr = buf.sampleRate, len = Math.min(buf.length, sr * 120);
    const cut = new AudioBuffer({ length: len, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
    for (let c = 0; c < buf.numberOfChannels; c++) cut.copyToChannel(buf.getChannelData(c).subarray(0, len), c);
    return add(Synth.encodeWav(cut, false), label, 'video-audio.wav');
  }
  /* microphone recording: returns { stop(): Promise<Blob> } */
  async function startMic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const mr = new MediaRecorder(stream), chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.start();
    return { stop: () => new Promise(res => { mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: mr.mimeType || 'audio/webm' })); }; mr.stop(); }) };
  }
  function peaks(id, n) {
    const b = Synth.samples.get(id); if (!b) return null; const out = new Float32Array(n), d = b.getChannelData(0), step = Math.max(1, Math.floor(d.length / n));
    for (let i = 0; i < n; i++) { let m = 0; const a = i * step, e = Math.min(d.length, a + step); for (let j = a; j < e; j += Math.max(1, (step / 24) | 0)) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > m) m = v; } out[i] = m; }
    return out;
  }

  /* ---- auto chop: spectral-flux onset detection -> interior cut times (seconds) ---- */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
        for (let k = 0; k < h; k++) {
          const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  /* sens 0..1 (higher = more cuts), minMs = shortest slice, max = most slices */
  function detect(id, o) {
    o = o || {}; const b = Synth.samples.get(id); if (!b) return [];
    const sens = o.sens == null ? 0.5 : o.sens, minGap = (o.minMs || 90) / 1000, max = o.max || 60;
    const sr = b.sampleRate, N = 1024, H = 512, len = b.length, nch = b.numberOfChannels;
    const x = new Float32Array(len); for (let c = 0; c < nch; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) x[i] += d[i] / nch; }
    const nf = Math.max(0, Math.floor((len - N) / H)); if (nf < 8) return [];
    const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
    const re = new Float64Array(N), im = new Float64Array(N), prev = new Float64Array(N / 2), flux = new Float64Array(nf);
    for (let f = 0; f < nf; f++) {
      const o0 = f * H; for (let i = 0; i < N; i++) { re[i] = x[o0 + i] * win[i]; im[i] = 0; }
      fft(re, im); let sum = 0;
      for (let k = 1; k < N / 2; k++) { const l = Math.log1p(Math.hypot(re[k], im[k]) * 8); const d = l - prev[k]; if (d > 0) sum += d; prev[k] = l; }
      flux[f] = f ? sum : 0;
    }
    let mean = 0; for (let f = 0; f < nf; f++) mean += flux[f]; mean /= nf;
    let sd = 0; for (let f = 0; f < nf; f++) sd += (flux[f] - mean) * (flux[f] - mean); sd = Math.sqrt(sd / nf) || 1e-9;
    const W = Math.round(0.15 * sr / H), delta = (1.7 - 1.5 * sens) * sd, cand = [];
    for (let f = 2; f < nf - 2; f++) {
      let a = 0, c = 0; for (let k = Math.max(0, f - W); k <= Math.min(nf - 1, f + W); k++) { a += flux[k]; c++; } a /= c;
      let peak = true; for (let k = f - 3; k <= f + 3 && peak; k++) if (k >= 0 && k < nf && k !== f && flux[k] > flux[f]) peak = false;
      if (peak && flux[f] > a + delta && flux[f] > 0.15 * sd + mean * 0.5) cand.push({ f, v: flux[f] });
    }
    cand.sort((p, q) => q.v - p.v);
    const acc = [];
    for (const c of cand) { const t = c.f * H / sr; if (acc.length >= max) break; if (t < minGap * 0.5 || t > b.duration - minGap * 0.5) continue; if (acc.every(a2 => Math.abs(a2 - t) >= minGap)) acc.push(t); }
    // snap each onset to the quietest point just before it (no click) and keep a hair of the attack
    const out = acc.map(t0 => {
      const centre = Math.round(t0 * sr + N * 0.3), lo = Math.max(0, centre - Math.round(0.02 * sr)), hi = Math.min(len - 1, centre + Math.round(0.004 * sr));
      let best = lo, bv = 1e9; for (let i = lo; i <= hi; i++) { let s = 0; for (let k = 0; k < 24 && i + k < len; k++) s += Math.abs(x[i + k]); if (s < bv) { bv = s; best = i; } }
      return Math.max(0.005, (best - Math.round(0.002 * sr)) / sr);
    }).sort((p, q) => p - q);
    return out.filter((t, i) => i === 0 || t - out[i - 1] > 0.02);
  }
  /* [start, end] of the audible part (so a silent intro does not eat the first key) */
  function activeRange(id, db) {
    const b = Synth.samples.get(id); if (!b) return [0, 0]; const n = b.length, sr = b.sampleRate, W = Math.max(64, Math.round(sr * 0.01)), nw = Math.floor(n / W);
    if (nw < 3) return [0, b.duration]; const ch = []; for (let c = 0; c < b.numberOfChannels; c++) ch.push(b.getChannelData(c));
    const rms = new Float32Array(nw); let pk = 0;
    for (let w = 0; w < nw; w++) { let m2 = 0; for (const d of ch) { let s = 0; for (let i = w * W; i < (w + 1) * W; i++) s += d[i] * d[i]; m2 = Math.max(m2, s / W); } rms[w] = Math.sqrt(m2); if (rms[w] > pk) pk = rms[w]; }
    if (pk <= 0) return [0, 0]; const th = pk * Math.pow(10, (db == null ? -34 : db) / 20); let a0 = 0, a1 = nw - 1;
    while (a0 < nw && rms[a0] < th) a0++; while (a1 > a0 && rms[a1] < th) a1--;
    return [Math.max(0, (a0 * W - 0.01 * sr) / sr), Math.min(b.duration, ((a1 + 1) * W + 0.08 * sr) / sr)];
  }
  const evenCuts = (id, n) => { const b = Synth.samples.get(id); if (!b || n < 2) return []; const r = []; for (let i = 1; i < n; i++) r.push(b.duration * i / n); return r; };
  window.Sampler = { decode: decodeBlob, detect, evenCuts, activeRange, meta, list, refresh, ensure, ensureAll, add, remove, rename, fromVideo, startMic, peaks, name: (id) => (meta.get(id) || {}).name };
})();
