/* Project backup: ZIP (project + video + samples) and import of ZIP / legacy JSON. Shared by the list page and the editor. */
(function () {
  'use strict';
  const safe = (s) => (s || 'project').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  const extOf = (n, def) => { const m = /\.([A-Za-z0-9]{1,5})$/.exec(n || ''); return m ? m[1].toLowerCase() : def; };
  const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' };
  const AUDIO_TYPES = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', webm: 'audio/webm', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac' };

  function sampleIds(data) {
    const ids = new Set(); if (!data) return ids;
    const add = (p) => { if (p && p.sampleId) ids.add(p.sampleId); };
    (data.layers || []).forEach(l => add(l.params)); if (data.pending) add(data.pending.params); if (data.inst) add(data.inst.params);
    return ids;
  }

  async function exportProject(id, onProgress) {
    const rec = await Store.get(id); if (!rec) throw new Error('Project not found');
    const files = []; const man = { app: 'MidiMovie', kind: 'backup', version: 1, name: rec.name, created: rec.created, videoName: rec.videoName || '', thumb: rec.thumb || null, video: null, samples: [] };
    const v = await Store.getVideo(id);
    if (v && v.blob) { man.video = 'video/' + safe(v.name || 'video'); man.videoType = v.type || v.blob.type || ''; files.push({ name: man.video, blob: v.blob }); }
    for (const sid of sampleIds(rec.data)) {
      const s = await Store.getSample(sid); if (!s) continue;
      const f = 'samples/' + sid + '.' + extOf(s.fileName, 'wav');
      man.samples.push({ id: sid, name: s.name, file: f, type: s.type || s.blob.type || '', dur: s.dur || 0 });
      files.push({ name: f, blob: s.blob });
    }
    files.unshift({ name: 'project.json', blob: JSON.stringify(rec.data || {}) });
    files.unshift({ name: 'manifest.json', blob: JSON.stringify(man) });
    const blob = await Zip.write(files, onProgress);
    return { blob, name: safe(rec.name) + '.midimovie.zip' };
  }

  function newRec(name, data, extra) {
    const id = Store.newId();
    return Object.assign({ id, name: name || 'Untitled', created: Date.now(), updated: Date.now(), layerCount: data && data.layers ? data.layers.length : 0, videoName: '', thumb: null, data: data || null }, extra || {});
  }

  /* returns the id of the newly created project */
  async function importFile(file) {
    if (/\.zip$/i.test(file.name) || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
      const entries = await Zip.read(file); const byName = new Map(entries.map(e => [e.name, e]));
      const me = byName.get('manifest.json'), pe = byName.get('project.json');
      if (!me || !pe) throw new Error('bad');
      const man = JSON.parse(await (await me.blob()).text()); if (man.app !== 'MidiMovie') throw new Error('bad');
      const data = JSON.parse(await (await pe.blob()).text());
      const rec = newRec(man.name, data, { videoName: man.videoName || '', thumb: man.thumb || null });
      for (const s of man.samples || []) {
        const e = byName.get(s.file); if (!e) continue;
        if (await Store.getSample(s.id)) continue;
        const b = await e.blob(); const type = s.type || AUDIO_TYPES[extOf(s.file, 'wav')] || 'audio/wav';
        await Store.putSample({ id: s.id, name: s.name, blob: new Blob([b], { type }), type, dur: s.dur || 0, fileName: s.file, created: Date.now() });
      }
      await Store.put(rec);
      if (man.video && byName.get(man.video)) {
        const b = await byName.get(man.video).blob(); const nm = man.video.replace(/^video\//, '');
        const type = man.videoType || VIDEO_TYPES[extOf(nm, 'mp4')] || 'video/mp4';
        await Store.putVideo(rec.id, new Blob([b], { type }), nm);
      }
      return rec.id;
    }
    const d = JSON.parse(await file.text());
    if (d.app !== 'MidiMovie' || !Array.isArray(d.layers)) throw new Error('bad');
    const rec = newRec(d.projectName || file.name.replace(/\.midimovie\.json$|\.json$/i, ''), d); await Store.put(rec); return rec.id;
  }
  window.Backup = { exportProject, importFile, sampleIds, safe };
})();
