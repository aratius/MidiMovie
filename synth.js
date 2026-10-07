/* Synth engine + audio graph helpers. Works on both AudioContext and OfflineAudioContext. */
(function () {
  const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];

  // key, type, min, max, step, scale, group
  const PARAM_DEFS = [
    { key: 'wave1', type: 'select', options: ['off'].concat(WAVES), group: 'osc', opt: 'w' },
    { key: 'wave2', type: 'select', options: ['off'].concat(WAVES), group: 'osc', opt: 'w' },
    { key: 'osc2Level', type: 'range', min: 0, max: 1, step: 0.01, group: 'osc', fmt: 'pct' },
    { key: 'osc2Semi', type: 'range', min: -24, max: 24, step: 1, group: 'osc', fmt: 'int' },
    { key: 'osc2Detune', type: 'range', min: -100, max: 100, step: 1, group: 'osc', fmt: 'int' },
    { key: 'noise', type: 'range', min: 0, max: 1, step: 0.01, group: 'osc', fmt: 'pct' },

    { key: 'fmAmount', type: 'range', min: 0, max: 10, step: 0.05, group: 'fm', fmt: 'dec' },
    { key: 'fmRatio', type: 'range', min: 0.25, max: 8, step: 0.25, group: 'fm', fmt: 'dec' },
    { key: 'fmDecay', type: 'range', min: 0.01, max: 3, step: 0.01, group: 'fm', fmt: 'sec' },

    { key: 'filterType', type: 'select', options: ['lowpass', 'highpass', 'bandpass'], group: 'filter', opt: 'f' },
    { key: 'cutoff', type: 'range', min: 40, max: 18000, step: 1, scale: 'log', group: 'filter', fmt: 'hz' },
    { key: 'resonance', type: 'range', min: 0.1, max: 20, step: 0.1, group: 'filter', fmt: 'dec' },
    { key: 'keytrack', type: 'range', min: 0, max: 1, step: 0.01, group: 'filter', fmt: 'pct' },
    { key: 'fEnv', type: 'range', min: -6, max: 6, step: 0.1, group: 'filter', fmt: 'dec' },
    { key: 'fDecay', type: 'range', min: 0.02, max: 3, step: 0.01, group: 'filter', fmt: 'sec' },

    { key: 'attack', type: 'range', min: 0.001, max: 3, step: 0.001, scale: 'log', group: 'env', fmt: 'sec' },
    { key: 'decay', type: 'range', min: 0.01, max: 3, step: 0.01, scale: 'log', group: 'env', fmt: 'sec' },
    { key: 'sustain', type: 'range', min: 0, max: 1, step: 0.01, group: 'env', fmt: 'pct' },
    { key: 'release', type: 'range', min: 0.01, max: 5, step: 0.01, scale: 'log', group: 'env', fmt: 'sec' },

    { key: 'pitchEnv', type: 'range', min: -48, max: 48, step: 1, group: 'pitch', fmt: 'int' },
    { key: 'pitchDecay', type: 'range', min: 0.01, max: 2, step: 0.01, group: 'pitch', fmt: 'sec' },
    { key: 'vibRate', type: 'range', min: 0.1, max: 12, step: 0.1, group: 'pitch', fmt: 'hzs' },
    { key: 'vibDepth', type: 'range', min: 0, max: 100, step: 1, group: 'pitch', fmt: 'int' },
    { key: 'tremRate', type: 'range', min: 0.1, max: 12, step: 0.1, group: 'pitch', fmt: 'hzs' },
    { key: 'tremDepth', type: 'range', min: 0, max: 1, step: 0.01, group: 'pitch', fmt: 'pct' },
    { key: 'bendRange', type: 'range', min: 0, max: 24, step: 1, group: 'pitch', fmt: 'int' },

    { key: 'spread', type: 'range', min: 0, max: 1, step: 0.01, group: 'out', fmt: 'pct' },
    { key: 'reverb', type: 'range', min: 0, max: 1, step: 0.01, group: 'out', fmt: 'pct' },
    { key: 'gain', type: 'range', min: 0, max: 1, step: 0.01, group: 'out', fmt: 'pct' }
  ];
  const GROUPS = ['osc', 'fm', 'filter', 'env', 'pitch', 'out'];

  const BASE = {
    wave1: 'sawtooth', wave2: 'off', osc2Level: 0.5, osc2Semi: 0, osc2Detune: 7, noise: 0,
    fmAmount: 0, fmRatio: 2, fmDecay: 0.4,
    filterType: 'lowpass', cutoff: 4000, resonance: 1, keytrack: 0.5, fEnv: 0, fDecay: 0.3,
    attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.25,
    pitchEnv: 0, pitchDecay: 0.08, vibRate: 5, vibDepth: 0, tremRate: 4, tremDepth: 0, bendRange: 2, spread: 0,
    reverb: 0.15, gain: 0.6,
    sampleId: '', smpStart: 0, smpEnd: 0, smpRoot: 60, smpLoop: 0
  };
  const samples = new Map(); // sampleId -> AudioBuffer (filled by sampler.js)
  const mk = (o) => Object.assign({}, BASE, o);

  const PRESETS = {
    pluck:    mk({ wave1: 'sawtooth', wave2: 'square', osc2Level: 0.35, osc2Semi: -12, osc2Detune: 4, cutoff: 900, resonance: 2, fEnv: 3, fDecay: 0.22, attack: 0.002, decay: 0.35, sustain: 0, release: 0.2, reverb: 0.22 }),
    sineLead: mk({ wave1: 'sine', wave2: 'triangle', osc2Level: 0.3, osc2Semi: 12, osc2Detune: 0, cutoff: 8000, attack: 0.012, decay: 0.2, sustain: 0.8, release: 0.3, vibRate: 5.5, vibDepth: 14, reverb: 0.25 }),
    sawLead:  mk({ wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 0.8, osc2Detune: 12, cutoff: 2600, resonance: 3, fEnv: 1.5, fDecay: 0.4, attack: 0.008, decay: 0.3, sustain: 0.7, release: 0.2, vibDepth: 6, reverb: 0.18 }),
    chip:     mk({ wave1: 'square', wave2: 'square', osc2Level: 0.25, osc2Semi: 12, osc2Detune: 0, cutoff: 9000, keytrack: 0, attack: 0.001, decay: 0.1, sustain: 0.7, release: 0.06, reverb: 0, gain: 0.4 }),
    fmBell:   mk({ wave1: 'sine', fmAmount: 2.4, fmRatio: 3.5, fmDecay: 1.2, cutoff: 12000, attack: 0.001, decay: 1.8, sustain: 0, release: 1.2, reverb: 0.35, gain: 0.5 }),
    warmPad:  mk({ wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 14, cutoff: 1400, resonance: 1.2, fEnv: 0.6, fDecay: 1.2, attack: 0.8, decay: 0.6, sustain: 0.8, release: 1.6, vibDepth: 4, vibRate: 4, reverb: 0.45, gain: 0.45 }),
    subBass:  mk({ wave1: 'sine', wave2: 'triangle', osc2Level: 0.6, osc2Semi: -12, osc2Detune: 0, cutoff: 600, keytrack: 0.3, attack: 0.005, decay: 0.2, sustain: 0.85, release: 0.15, reverb: 0, gain: 0.7 }),
    zap:      mk({ wave1: 'sawtooth', wave2: 'square', osc2Level: 0.4, osc2Semi: 7, cutoff: 6000, resonance: 4, keytrack: 0.5, fEnv: 1, fDecay: 0.2, attack: 0.001, decay: 0.25, sustain: 0, release: 0.1, pitchEnv: 24, pitchDecay: 0.14, reverb: 0.2 }),
    whoosh:   mk({ wave1: 'off', wave2: 'off', noise: 0.9, filterType: 'bandpass', cutoff: 700, resonance: 4, keytrack: 0.6, fEnv: 3, fDecay: 1.3, attack: 0.6, decay: 1, sustain: 0.5, release: 1, reverb: 0.3 }),
    impact:   mk({ wave1: 'sine', wave2: 'off', noise: 0.35, cutoff: 3000, resonance: 1, keytrack: 0.2, fEnv: 2, fDecay: 0.08, attack: 0.001, decay: 0.4, sustain: 0, release: 0.2, pitchEnv: 24, pitchDecay: 0.1, reverb: 0.2, gain: 0.8 }),
    organ:    mk({ wave1: 'sine', wave2: 'sine', osc2Level: 0.55, osc2Semi: 12, osc2Detune: 0, cutoff: 9000, keytrack: 0, attack: 0.01, decay: 0.05, sustain: 1, release: 0.08, vibRate: 6, vibDepth: 5, reverb: 0.25, gain: 0.5 }),
    eerie:    mk({ wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.35, osc2Semi: 7, osc2Detune: 30, fmAmount: 0.8, fmRatio: 0.5, fmDecay: 2.5, cutoff: 1800, resonance: 6, fEnv: -1, fDecay: 1.5, attack: 0.9, decay: 1, sustain: 0.7, release: 2, vibRate: 6.5, vibDepth: 40, reverb: 0.55, gain: 0.45 })
  };
  const PRESET_ORDER = ['pluck', 'sineLead', 'sawLead', 'chip', 'fmBell', 'warmPad', 'subBass', 'zap', 'whoosh', 'impact', 'organ', 'eerie'];

  const midiToHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* ---- shared buffers per context ---- */
  const noiseCache = new WeakMap();
  function noiseBuffer(ctx) {
    let b = noiseCache.get(ctx);
    if (!b) {
      b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      let s = 1234567; // deterministic
      for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 4294967296) * 2 - 1; }
      noiseCache.set(ctx, b);
    }
    return b;
  }
  function impulseResponse(ctx) {
    const len = Math.floor(ctx.sampleRate * 2.4);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let s = 9876 + c * 1111;
      for (let i = 0; i < len; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        const r = (s / 4294967296) * 2 - 1;
        d[i] = r * Math.pow(1 - i / len, 3.2);
      }
    }
    return b;
  }

  /* ---- master bus: reverb bus + master gain + compressor ---- */
  function createBus(ctx, opts) {
    const master = ctx.createGain(); master.gain.value = 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    const conv = ctx.createConvolver(); conv.buffer = impulseResponse(ctx);
    const revIn = ctx.createGain(); revIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.9;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
    const bus = { ctx, master, comp, revIn };
    if (opts && opts.meter) {
      const sp = ctx.createChannelSplitter(2), aL = ctx.createAnalyser(), aR = ctx.createAnalyser();
      aL.fftSize = aR.fftSize = 1024; comp.connect(sp); sp.connect(aL, 0); sp.connect(aR, 1);
      bus.meter = { aL, aR, bL: new Float32Array(1024), bR: new Float32Array(1024) };
    }
    return bus;
  }

  /* ---- layer channel: input -> vol -> master ; input -> send -> reverb ---- */
  function createChannel(bus, params, volume) {
    const ctx = bus.ctx;
    const input = ctx.createGain();
    const vol = ctx.createGain();
    const send = ctx.createGain();
    input.connect(vol); vol.connect(bus.master);
    input.connect(send); send.connect(bus.revIn);
    let bend = null;
    if (ctx.createConstantSource) { bend = ctx.createConstantSource(); bend.offset.value = 0; bend.start(); }
    const ch = { ctx, input, vol, send, bend, audible: true, volume: volume == null ? 1 : volume, params };
    updateChannel(ch);
    return ch;
  }
  function updateChannel(ch, patch) {
    if (patch) Object.assign(ch, patch);
    const a = ch.audible ? ch.volume : 0;
    ch.vol.gain.value = a;
    ch.send.gain.value = a * (ch.params.reverb || 0) * 0.8;
  }
  function disposeChannel(ch) {
    try { ch.bend && ch.bend.stop(); } catch (e) {}
    try { ch.input.disconnect(); ch.vol.disconnect(); ch.send.disconnect(); ch.bend && ch.bend.disconnect(); } catch (e) {}
  }
  function setBend(ch, cents, when) {
    if (ch.bend) ch.bend.offset.setValueAtTime(cents, when);
  }

  /* ---- voice ---- */
  function startVoice(ch, p, note, vel, when) {
    const ctx = ch.ctx;
    const f = midiToHz(note);
    const velGain = 0.15 + 0.85 * Math.pow(vel / 127, 1.4);
    const peak = velGain * p.gain;
    const A = Math.max(0.001, p.attack), D = Math.max(0.01, p.decay), S = p.sustain;

    const rel = ctx.createGain(); rel.gain.value = 1;
    const env = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = p.filterType; filt.Q.value = p.resonance;
    const baseCut = Math.min(20000, Math.max(30, p.cutoff * Math.pow(2, ((note - 60) / 12) * p.keytrack)));
    if (p.fEnv !== 0) {
      const startCut = Math.min(20000, Math.max(30, baseCut * Math.pow(2, p.fEnv)));
      filt.frequency.setValueAtTime(startCut, when);
      filt.frequency.setTargetAtTime(baseCut, when, Math.max(0.005, p.fDecay / 3));
    } else filt.frequency.setValueAtTime(baseCut, when);

    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when + A);
    env.gain.setTargetAtTime(peak * S, when + A, D / 3);

    const sources = [];
    const detuneTargets = [];
    const nodes = [filt, env, rel];
    filt.connect(env);
    let last = env;
    if (p.tremDepth > 0) { // tremolo (amplitude modulation)
      const tg = ctx.createGain(); tg.gain.value = 1 - p.tremDepth / 2;
      const tl = ctx.createOscillator(); tl.frequency.value = p.tremRate;
      const tlg = ctx.createGain(); tlg.gain.value = p.tremDepth / 2;
      tl.connect(tlg); tlg.connect(tg.gain); tl.start(when);
      env.connect(tg); last = tg; sources.push(tl); nodes.push(tg, tlg);
    }
    last.connect(rel);
    if (p.spread > 0 && ctx.createStereoPanner) { // deterministic per-note stereo position
      const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-1, Math.min(1, p.spread * Math.sin(note * 2.399)));
      rel.connect(pan); pan.connect(ch.input); nodes.push(pan);
    } else rel.connect(ch.input);

    function addOsc(type, freq, level, detuneCents) {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detuneCents || 0;
      const g = ctx.createGain(); g.gain.value = level;
      o.connect(g); g.connect(filt);
      o.start(when);
      sources.push(o); nodes.push(g);
      detuneTargets.push(o);
      return o;
    }

    let osc1 = null;
    if (p.wave1 !== 'off') osc1 = addOsc(p.wave1, f, 0.7, 0);
    if (p.wave2 !== 'off' && p.osc2Level > 0) addOsc(p.wave2, f * Math.pow(2, p.osc2Semi / 12), 0.7 * p.osc2Level, p.osc2Detune);

    // FM: modulator -> osc1.frequency
    if (osc1 && p.fmAmount > 0) {
      const mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * p.fmRatio;
      const mg = ctx.createGain();
      const depth = p.fmAmount * f * p.fmRatio;
      mg.gain.setValueAtTime(depth, when);
      mg.gain.setTargetAtTime(depth * 0.08, when, Math.max(0.005, p.fmDecay / 3));
      mod.connect(mg); mg.connect(osc1.frequency);
      mod.start(when); sources.push(mod); nodes.push(mg); detuneTargets.push(mod);
    }

    // noise
    if (p.noise > 0) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuffer(ctx); n.loop = true;
      const ng = ctx.createGain(); ng.gain.value = p.noise;
      n.connect(ng); ng.connect(filt);
      n.start(when, Math.random() * 1.5);
      sources.push(n); nodes.push(ng);
    }

    // sampler source
    const smp = p.sampleId ? samples.get(p.sampleId) : null;
    if (smp) {
      const s = ctx.createBufferSource(); s.buffer = smp;
      const st = Math.max(0, Math.min(smp.duration - 0.005, p.smpStart || 0));
      let en = p.smpEnd > 0 ? Math.min(smp.duration, p.smpEnd) : smp.duration; if (en <= st + 0.005) en = smp.duration;
      s.playbackRate.value = p.smpRoot >= 0 ? Math.pow(2, (note - p.smpRoot) / 12) : 1;
      if (p.smpLoop) { s.loop = true; s.loopStart = st; s.loopEnd = en; }
      const sg = ctx.createGain(); s.connect(sg); sg.connect(filt);
      if (p.smpLoop) s.start(when, st); else s.start(when, st, en - st);
      sources.push(s); nodes.push(sg); detuneTargets.push(s);
    }

    // pitch envelope (on detune)
    if (p.pitchEnv !== 0) {
      detuneTargets.forEach(o => {
        const base = o.detune.value;
        o.detune.setValueAtTime(base + p.pitchEnv * 100, when);
        o.detune.setTargetAtTime(base, when, Math.max(0.005, p.pitchDecay / 3));
      });
    }

    // vibrato LFO (on detune)
    if (p.vibDepth > 0) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = p.vibRate;
      const lg = ctx.createGain(); lg.gain.value = p.vibDepth;
      lfo.connect(lg);
      detuneTargets.forEach(o => lg.connect(o.detune));
      lfo.start(when); sources.push(lfo); nodes.push(lg);
    }

    // pitch bend (shared per channel)
    if (ch.bend) detuneTargets.forEach(o => ch.bend.connect(o.detune));

    let released = false;
    const voice = {
      release(t) {
        if (released) return; released = true;
        t = Math.max(t, when);
        const R = Math.max(0.01, p.release);
        rel.gain.setValueAtTime(1, t);
        rel.gain.setTargetAtTime(0, t, R / 3);
        const end = t + R * 2 + 0.05;
        sources.forEach(s => { try { s.stop(end); } catch (e) {} });
        const last = sources[0];
        const cleanup = () => {
          try { if (ch.bend) detuneTargets.forEach(o => { try { ch.bend.disconnect(o.detune); } catch (e) {} }); } catch (e) {}
          nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
        };
        if (last && ctx.constructor.name !== 'OfflineAudioContext') last.onended = cleanup;
      },
      kill(t) { // fast stop
        if (released) { return; }
        released = true;
        t = Math.max(t, when);
        rel.gain.setValueAtTime(1, t);
        rel.gain.setTargetAtTime(0, t, 0.012);
        const end = t + 0.12;
        sources.forEach(s => { try { s.stop(end); } catch (e) {} });
        const last = sources[0];
        if (last) last.onended = () => {
          try { if (ch.bend) detuneTargets.forEach(o => { try { ch.bend.disconnect(o.detune); } catch (e) {} }); } catch (e) {}
          nodes.forEach(n => { try { n.disconnect(); } catch (e) {} });
        };
      }
    };
    if (!sources.length) { voice.release = function () {}; voice.kill = function () {}; }
    return voice;
  }

  /* ---- events from notes (sorted) ---- */
  function buildEvents(layer) {
    const off = (layer.offsetMs || 0) / 1000;
    const ev = [];
    (layer.notes || []).forEach((n, i) => {
      ev.push({ t: Math.max(0, n.t + off), type: 'on', i, n: n.n, v: n.v });
      ev.push({ t: Math.max(0, n.t + n.d + off), type: 'off', i });
    });
    (layer.bends || []).forEach(b => ev.push({ t: Math.max(0, b.t + off), type: 'bend', v: b.v }));
    ev.sort((a, b) => a.t - b.t || (a.type === 'off' ? -1 : 1));
    return ev;
  }

  /* ---- offline render ---- */
  async function renderOffline(layers, opts) {
    const sr = opts.sampleRate || 44100;
    const len = Math.max(1, Math.ceil(opts.length * sr));
    const ctx = new OfflineAudioContext(2, len, sr);
    const bus = createBus(ctx);
    layers.forEach(layer => {
      const p = Object.assign({}, BASE, layer.params);
      const ch = createChannel(bus, p, layer.volume == null ? 1 : layer.volume);
      const voices = new Map();
      buildEvents(layer).forEach(ev => {
        if (ev.type === 'on') voices.set(ev.i, startVoice(ch, p, ev.n, ev.v, ev.t));
        else if (ev.type === 'off') { const v = voices.get(ev.i); if (v) v.release(ev.t); }
        else if (ev.type === 'bend') setBend(ch, ev.v * (p.bendRange || 0) * 100, ev.t);
      });
    });
    return ctx.startRendering();
  }

  function encodeWav(buffer, normalize) {
    const nCh = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
    const chans = []; for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
    let scale = 1;
    if (normalize) {
      let peak = 0;
      for (let c = 0; c < nCh; c++) { const d = chans[c]; for (let i = 0; i < len; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; } }
      if (peak > 0) scale = 0.97 / peak;
    }
    const bytes = len * nCh * 2;
    const ab = new ArrayBuffer(44 + bytes);
    const v = new DataView(ab);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nCh, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * 2, true); v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, bytes, true);
    let o = 44;
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < nCh; c++) {
        let s = Math.max(-1, Math.min(1, chans[c][i] * scale));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  window.Synth = {
    PARAM_DEFS, GROUPS, BASE, PRESETS, samples, PRESET_ORDER, midiToHz,
    createBus, createChannel, updateChannel, disposeChannel, setBend,
    startVoice, buildEvents, renderOffline, encodeWav
  };
})();
