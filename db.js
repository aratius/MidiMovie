/* Project storage on IndexedDB (projects + video blobs). Falls back gracefully when unavailable. */
(function () {
  const DB = 'midimovie', VER = 2;
  let dbp = null;
  const available = (() => { try { return !!window.indexedDB; } catch (e) { return false; } })();
  function open() {
    if (!available) return Promise.reject(new Error('IndexedDB unavailable'));
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => { const d = r.result; ['projects', 'videos', 'samples'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); }); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
      r.onblocked = () => { dbp = null; rej(new Error('blocked')); };
    });
    return dbp;
  }
  function tx(store, mode, fn) {
    return open().then(db => new Promise((res, rej) => {
      const t = db.transaction(store, mode); const s = t.objectStore(store); let out;
      const req = fn(s); if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('aborted'));
    }));
  }
  window.Store = {
    available,
    newId: () => 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    list: () => tx('projects', 'readonly', s => s.getAll()).then(a => a || []),
    get: (id) => tx('projects', 'readonly', s => s.get(id)),
    put: (rec) => tx('projects', 'readwrite', s => s.put(rec)),
    del: (id) => tx('projects', 'readwrite', s => s.delete(id)).then(() => tx('videos', 'readwrite', s => s.delete(id))),
    putVideo: (id, blob, name) => tx('videos', 'readwrite', s => s.put({ id, blob, name, type: blob.type })),
    getVideo: (id) => tx('videos', 'readonly', s => s.get(id)),
    listSamples: () => tx('samples', 'readonly', s => s.getAll()).then(a => a || []),
    getSample: (id) => tx('samples', 'readonly', s => s.get(id)),
    putSample: (rec) => tx('samples', 'readwrite', s => s.put(rec)),
    delSample: (id) => tx('samples', 'readwrite', s => s.delete(id)),
    delVideo: (id) => tx('videos', 'readwrite', s => s.delete(id)),
    async duplicate(id, newName) {
      const rec = await this.get(id); if (!rec) return null;
      const copy = JSON.parse(JSON.stringify(rec)); copy.id = this.newId(); copy.name = newName; copy.created = copy.updated = Date.now();
      await this.put(copy);
      const v = await this.getVideo(id); if (v) await this.putVideo(copy.id, v.blob, v.name);
      return copy;
    },
    async estimate() { try { return await navigator.storage.estimate(); } catch (e) { return null; } },
    async persist() { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch (e) { return false; } },
    /* small JPEG thumbnail from a video blob (null on failure) */
    thumb(blob) {
      return new Promise(resolve => {
        const v = document.createElement('video'); const url = URL.createObjectURL(blob);
        let done = false; const finish = (x) => { if (done) return; done = true; URL.revokeObjectURL(url); resolve(x); };
        v.muted = true; v.preload = 'auto'; v.playsInline = true;
        v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(1, (v.duration || 1) * 0.1); });
        v.addEventListener('seeked', () => {
          try { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 320, 180);
            const r = Math.min(320 / v.videoWidth, 180 / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r; g.drawImage(v, (320 - w) / 2, (180 - h) / 2, w, h); finish(c.toDataURL('image/jpeg', 0.6)); } catch (e) { finish(null); }
        });
        v.addEventListener('error', () => finish(null)); setTimeout(() => finish(null), 6000); v.src = url;
      });
    }
  };
})();
