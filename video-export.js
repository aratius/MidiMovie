/* Export the project's video with the new music in an MP4. The original picture is copied as-is (no re-encode, so it is fast and lossless);
   only the soundtrack is replaced. Uses Mediabunny (vendored under vendor/mediabunny/, see tools/vendor-mediabunny.sh) and WebCodecs. */
(function () {
  'use strict';
  const LIB = 'vendor/mediabunny/mediabunny.bundle.js';
  let libP = null;
  function loadLib() {
    if (window.MediabunnyLib) return Promise.resolve(window.MediabunnyLib);
    if (!libP) libP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIB;
      s.onload = () => window.MediabunnyLib ? res(window.MediabunnyLib) : rej(new Error('missing'));
      s.onerror = () => { libP = null; rej(new Error('missing')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  /* cut the soundtrack to the picture's length (reverb tails would otherwise outlast the video) and fade the last 60 ms */
  function fit(buf, seconds) {
    const sr = buf.sampleRate, n = Math.min(buf.length, Math.max(1, Math.round(seconds * sr)));
    const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: sr }), f = Math.min(n, Math.round(0.06 * sr));
    for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c).slice(0, n); for (let i = 0; i < f; i++) d[n - 1 - i] *= i / f; out.copyToChannel(d, c); }
    return out;
  }
  /* videoBlob: the original video file. audio: AudioBuffer. returns { blob, audioCodec } */
  async function mux(videoBlob, audio, onProgress) {
    const M = await loadLib(); // throws Error('missing') when the engine is not installed
    if (typeof AudioEncoder === 'undefined' || typeof VideoDecoder === 'undefined') throw new Error('unsupported');
    const input = new M.Input({ source: new M.BlobSource(videoBlob), formats: M.ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack(); if (!vt) throw new Error('novideo');
    const dur = await input.computeDuration();
    const vcfg = await vt.getDecoderConfig();
    const output = new M.Output({ format: new M.Mp4OutputFormat(), target: new M.BufferTarget() });
    const vsrc = new M.EncodedVideoPacketSource(vt.codec);
    output.addVideoTrack(vsrc, { rotation: vt.rotation || 0 });
    const acodec = await M.getFirstEncodableAudioCodec(['aac', 'opus'], { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate });
    if (!acodec) throw new Error('noaudiocodec');
    const asrc = new M.AudioBufferSource({ codec: acodec, bitrate: M.QUALITY_HIGH });
    output.addAudioTrack(asrc);
    await output.start();
    const sink = new M.EncodedPacketSink(vt); let first = true;
    for await (const pk of sink.packets()) {
      await vsrc.add(pk, first ? { decoderConfig: vcfg } : undefined); first = false;
      if (onProgress && dur) onProgress(Math.min(0.9, pk.timestamp / dur * 0.9));
    }
    vsrc.close();
    await asrc.add(fit(audio, dur)); asrc.close();
    await output.finalize();
    if (onProgress) onProgress(1);
    return { blob: new Blob([output.target.buffer], { type: 'video/mp4' }), audioCodec: acodec };
  }
  window.VideoExport = { mux, fit };
})();
