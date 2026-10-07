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
  window.Sampler = { meta, list, refresh, ensure, ensureAll, add, remove, rename, fromVideo, startMic, peaks, name: (id) => (meta.get(id) || {}).name };
})();
