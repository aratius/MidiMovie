/* ITU-R BS.1770 integrated loudness (LUFS) measurement + offline loudness / peak normalisation with a look-ahead limiter. */
(function () {
  'use strict';
  function coefs(fs) {
    let f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196, K = Math.tan(Math.PI * f0 / fs);
    const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
    let a0 = 1 + K / Q + K * K;
    const s1 = { b0: (Vh + Vb * K / Q + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    f0 = 38.13547087602444; Q = 0.5003270373238773; K = Math.tan(Math.PI * f0 / fs);
    a0 = 1 + K / Q + K * K;
    const s2 = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q + K * K) / a0 };
    return [s1, s2];
  }
  /* per-channel energy summed into 100 ms hops */
  function hopEnergy(data, fs, hop) {
    const n = data.length, nh = Math.max(1, Math.ceil(n / hop)), out = new Float64Array(nh);
    const [A, B] = coefs(fs);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
    for (let i = 0; i < n; i++) {
      const x = data[i];
      const y = A.b0 * x + A.b1 * x1 + A.b2 * x2 - A.a1 * y1 - A.a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y;
      const z = B.b0 * y + B.b1 * u1 + B.b2 * u2 - B.a1 * v1 - B.a2 * v2; u2 = u1; u1 = y; v2 = v1; v1 = z;
      out[(i / hop) | 0] += z * z;
    }
    return out;
  }
  function measure(buf) {
    const fs = buf.sampleRate, n = buf.length, hop = Math.round(fs * 0.1), nch = buf.numberOfChannels;
    let peak = 0; const hops = [];
    for (let c = 0; c < Math.min(nch, 2); c++) {
      const d = buf.getChannelData(c); for (let i = 0; i < n; i++) { const a = d[i] < 0 ? -d[i] : d[i]; if (a > peak) peak = a; }
      hops.push(hopEnergy(d, fs, hop));
    }
    const nh = hops[0].length, blocks = [];
    if (nh < 4) { let s = 0; hops.forEach(h => h.forEach(v => { s += v; })); blocks.push(s / Math.max(1, n)); }
    else for (let i = 0; i + 4 <= nh; i++) { let s = 0; hops.forEach(h => { s += h[i] + h[i + 1] + h[i + 2] + h[i + 3]; }); blocks.push(s / (hop * 4)); }
    const lk = (ms) => -0.691 + 10 * Math.log10(ms);
    const g1 = blocks.filter(ms => ms > 0 && lk(ms) > -70);
    if (!g1.length) return { lufs: -Infinity, peak };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const rel = lk(mean(g1)) - 10;
    const g2 = g1.filter(ms => lk(ms) > rel);
    return { lufs: lk(mean(g2.length ? g2 : g1)), peak };
  }
  const toDb = (x) => x > 0 ? 20 * Math.log10(x) : -Infinity;

  /* sliding-window helpers for the limiter */
  function limit(buf, ceil) {
    const n = buf.length, nch = buf.numberOfChannels, N = Math.max(8, Math.round(buf.sampleRate * 0.005));
    const chans = []; for (let c = 0; c < nch; c++) chans.push(buf.getChannelData(c));
    const raw = new Float32Array(n); let any = false;
    for (let i = 0; i < n; i++) { let p = 0; for (let c = 0; c < nch; c++) { const a = Math.abs(chans[c][i]); if (a > p) p = a; } if (p > ceil) { raw[i] = ceil / p; any = true; } else raw[i] = 1; }
    if (!any) return false;
    // min over [i-N, i+N] (monotonic deque)
    const mn = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0;
    for (let i = 0, j = 0; i < n; i++) {
      const hi = Math.min(n - 1, i + N);
      while (j <= hi) { while (t > h && raw[dq[t - 1]] >= raw[j]) t--; dq[t++] = j++; }
      while (dq[h] < i - N) h++;
      mn[i] = raw[dq[h]];
    }
    // moving average over [i-N, i+N]
    const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + mn[i];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - N), b = Math.min(n - 1, i + N), g = (cs[b + 1] - cs[a]) / (b - a + 1);
      for (let c = 0; c < nch; c++) chans[c][i] *= g;
    }
    return true;
  }

  /* mode: 'off' | 'peak' | 'lufs'. opts: { target (LUFS), ceilingDb } */
  function process(buf, mode, opts) {
    opts = opts || {}; const ceil = Math.pow(10, (opts.ceilingDb == null ? -1 : opts.ceilingDb) / 20);
    const before = measure(buf); let gainDb = 0;
    if (mode !== 'off') {
      if (mode === 'peak') gainDb = before.peak > 0 ? toDb(ceil / before.peak) : 0;
      else if (isFinite(before.lufs)) gainDb = opts.target - before.lufs;
      if (gainDb) { const g = Math.pow(10, gainDb / 20); for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
      limit(buf, ceil);
    }
    const after = measure(buf);
    return { before: { lufs: before.lufs, peakDb: toDb(before.peak) }, after: { lufs: after.lufs, peakDb: toDb(after.peak) }, gainDb };
  }
  window.Loudness = { measure, process, toDb };
})();
