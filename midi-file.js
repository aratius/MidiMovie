/* Standard MIDI File (SMF) writer / reader.
   Written files use 500 PPQ at 120 BPM, so 1 tick = 1 ms and video time maps 1:1 onto the DAW timeline. */
(function () {
  'use strict';
  const PPQ = 500;
  const vlq = (n) => { n = Math.max(0, Math.round(n)); const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
  const str = (s) => Array.from(new TextEncoder().encode(s));
  const u32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const chunk = (id, bytes) => [...str(id), ...u32(bytes.length), ...bytes];
  const meta = (type, data) => [0xFF, type, ...vlq(data.length), ...data];

  function trackBytes(events) { // events: [{tick, order, bytes}]
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const out = []; let last = 0;
    events.forEach(e => { out.push(...vlq(e.tick - last), ...e.bytes); last = e.tick; });
    const end = [...vlq(0), ...meta(0x2F, [])];
    return chunk('MTrk', out.concat(end));
  }

  /* layers: [{ name, notes:[{t,d,n,v}], bends:[{t,v}], offsetMs }]  markers: [{t,name}] */
  function encode(layers, markers, title) {
    const tick = (s) => Math.max(0, Math.round(s * 1000));
    const trks = [];
    const t0 = [{ tick: 0, order: 0, bytes: meta(0x03, str(title || 'MidiMovie')) },
      { tick: 0, order: 1, bytes: meta(0x51, [0x07, 0xA1, 0x20]) }, { tick: 0, order: 2, bytes: meta(0x58, [4, 2, 24, 8]) }];
    (markers || []).forEach((m, i) => t0.push({ tick: tick(m.t), order: 3, bytes: meta(0x06, str(m.name || ('M' + (i + 1)))) }));
    trks.push(trackBytes(t0));
    const chans = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
    layers.forEach((l, i) => {
      const ch = chans[i % chans.length], off = (l.offsetMs || 0) / 1000, ev = [];
      ev.push({ tick: 0, order: 0, bytes: meta(0x03, str(l.name || ('Layer ' + (i + 1)))) });
      (l.notes || []).forEach(n => {
        const a = tick(n.t + off), b = Math.max(a + 1, tick(n.t + n.d + off));
        ev.push({ tick: a, order: 2, bytes: [0x90 | ch, n.n & 127, Math.max(1, Math.min(127, Math.round(n.v)))] });
        ev.push({ tick: b, order: 1, bytes: [0x80 | ch, n.n & 127, 0] });
      });
      (l.bends || []).forEach(bd => { const v = Math.max(0, Math.min(16383, Math.round(8192 + bd.v * 8191))); ev.push({ tick: tick(bd.t + off), order: 3, bytes: [0xE0 | ch, v & 127, (v >> 7) & 127] }); });
      trks.push(trackBytes(ev));
    });
    const head = chunk('MThd', [0, 1, (trks.length >> 8) & 255, trks.length & 255, (PPQ >> 8) & 255, PPQ & 255]);
    return new Blob([new Uint8Array(head), ...trks.map(t => new Uint8Array(t))], { type: 'audio/midi' });
  }

  /* buffer: ArrayBuffer -> { layers:[{name, notes, bends}], markers:[{t,name}], duration } */
  function decode(buf) {
    const d = new DataView(buf), u8 = new Uint8Array(buf); let p = 0;
    const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
    if (tag(0) !== 'MThd') throw new Error('Not a MIDI file');
    const hl = d.getUint32(4), fmt = d.getUint16(8), ntr = d.getUint16(10), div = d.getUint16(12);
    if (div & 0x8000) throw new Error('SMPTE timing is not supported');
    p = 8 + hl;
    const tempos = [{ tick: 0, us: 500000 }], tracks = [], marks = [];
    const dec = new TextDecoder();
    for (let ti = 0; ti < ntr && p < buf.byteLength; ti++) {
      if (tag(p) !== 'MTrk') { p += 8 + d.getUint32(p + 4); ti--; continue; }
      const len = d.getUint32(p + 4); let q = p + 8; const end = q + len; p = end;
      let tick = 0, run = 0, name = ''; const evs = [];
      const rv = () => { let v = 0, b; do { b = u8[q++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && q < end); return v; };
      while (q < end) {
        tick += rv(); let st = u8[q];
        if (st < 0x80) st = run; else { q++; if (st < 0xF0) run = st; }
        if (st === 0xFF) {
          const type = u8[q++], l = rv(), data = u8.subarray(q, q + l); q += l;
          if (type === 0x51 && l === 3) tempos.push({ tick, us: (data[0] << 16) | (data[1] << 8) | data[2] });
          else if (type === 0x03 && !name) name = dec.decode(data);
          else if (type === 0x06 || type === 0x07) marks.push({ tick, name: dec.decode(data) });
        } else if (st === 0xF0 || st === 0xF7) { const l = rv(); q += l; }
        else {
          const hi = st & 0xF0, ch = st & 15;
          if (hi === 0xC0 || hi === 0xD0) { q += 1; continue; }
          const a = u8[q++], b = u8[q++];
          evs.push({ tick, hi, ch, a, b });
        }
      }
      tracks.push({ name, evs });
    }
    tempos.sort((x, y) => x.tick - y.tick);
    const segs = []; let sec = 0, lt = 0, us = 500000;
    tempos.forEach(tp => { sec += (tp.tick - lt) * us / 1e6 / div; lt = tp.tick; us = tp.us; segs.push({ tick: tp.tick, sec, us }); });
    const toSec = (tk) => { let s = segs[0]; for (let i = segs.length - 1; i >= 0; i--) if (segs[i].tick <= tk) { s = segs[i]; break; } return s.sec + (tk - s.tick) * s.us / 1e6 / div; };

    const layers = []; let dur = 0;
    tracks.forEach(tr => {
      const byCh = new Map();
      const get = (ch) => { if (!byCh.has(ch)) byCh.set(ch, { notes: [], bends: [], open: new Map(), pedal: false, pend: [] }); return byCh.get(ch); };
      const close = (c, n, tk) => { const o = c.open.get(n); if (!o) return; c.open.delete(n); const t1 = toSec(tk); c.notes.push({ t: o.t, d: Math.max(0.02, t1 - o.t), n, v: o.v }); dur = Math.max(dur, t1); };
      tr.evs.forEach(e => {
        const c = get(e.ch);
        if (e.hi === 0x90 && e.b > 0) { if (c.open.has(e.a)) close(c, e.a, e.tick); c.open.set(e.a, { t: toSec(e.tick), v: e.b }); }
        else if (e.hi === 0x80 || (e.hi === 0x90 && e.b === 0)) { if (c.pedal) c.pend.push(e.a); else close(c, e.a, e.tick); }
        else if (e.hi === 0xB0 && e.a === 64) { const down = e.b >= 64; if (!down && c.pedal) { c.pend.forEach(n => close(c, n, e.tick)); c.pend = []; } c.pedal = down; }
        else if (e.hi === 0xE0) c.bends.push({ t: toSec(e.tick), v: (((e.b << 7) | e.a) - 8192) / 8192 });
      });
      const lastTick = tr.evs.length ? tr.evs[tr.evs.length - 1].tick : 0;
      byCh.forEach((c, ch) => {
        Array.from(c.open.keys()).forEach(n => close(c, n, lastTick));
        if (!c.notes.length) return;
        c.notes.sort((a, b) => a.t - b.t);
        const bends = c.bends.some(b => Math.abs(b.v) > 0.001) ? c.bends : [];
        const multi = byCh.size > 1;
        layers.push({ name: (tr.name || '') + (multi ? (tr.name ? ' ' : 'Ch ') + (ch + 1) : ''), notes: c.notes, bends });
      });
    });
    const markers = marks.map(m => ({ t: toSec(m.tick), name: m.name }));
    return { layers, markers, duration: dur, format: fmt };
  }
  window.MidiFile = { encode, decode };
})();
