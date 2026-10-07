/* Minimal ZIP writer/reader (store + inflate via DecompressionStream). Blob-based so big videos are never fully loaded into memory. */
(function () {
  'use strict';
  const TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; TABLE[n] = c >>> 0; }
  const crcUpdate = (c, buf) => { for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8); return c; };
  async function crcBlob(blob) {
    let c = 0xFFFFFFFF; const r = blob.stream().getReader();
    for (;;) { const { done, value } = await r.read(); if (done) break; c = crcUpdate(c, value); }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const asBlob = (x) => x instanceof Blob ? x : new Blob([x]);

  /* files: [{ name, blob|string|Uint8Array }] -> Blob(zip) */
  async function write(files, onProgress) {
    const enc = new TextEncoder(); const parts = [], central = []; let off = 0, csize = 0;
    const d = new Date();
    const dosT = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosD = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (let i = 0; i < files.length; i++) {
      const f = files[i], blob = asBlob(f.blob), nm = enc.encode(f.name), size = blob.size;
      if (size > 0xFFFFFFF0 || off > 0xFFFFFFF0) throw new Error('Too large for a ZIP (4 GB limit)');
      const crc = await crcBlob(blob);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosT, true); h.setUint16(12, dosD, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, nm, blob);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosT, true); c.setUint16(14, dosD, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(c.buffer, nm); csize += 46 + nm.length;
      off += 30 + nm.length + size;
      if (onProgress) onProgress((i + 1) / files.length);
    }
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }

  /* file: Blob/File -> [{ name, size, blob() }] */
  async function read(file) {
    const tailLen = Math.min(file.size, 66000);
    const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
    let e = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Not a ZIP file');
    const count = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
    if (cdOff === 0xFFFFFFFF || count === 0xFFFF) throw new Error('ZIP64 is not supported');
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer());
    const dec = new TextDecoder(); const out = []; let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Corrupt ZIP');
      const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true);
      const nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, p + 46, nl)); p += 46 + nl + xl + cl;
      out.push({
        name, size: usize,
        async blob() {
          const lh = new DataView(await file.slice(lo, lo + 30).arrayBuffer());
          const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
          const raw = file.slice(start, start + csize);
          if (method === 0) return raw;
          if (method === 8 && typeof DecompressionStream !== 'undefined') return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
          throw new Error('Unsupported ZIP compression');
        }
      });
    }
    return out;
  }
  window.Zip = { write, read };
})();
