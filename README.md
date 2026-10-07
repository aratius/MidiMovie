# MidiMovie

Play a MIDI keyboard along to a video — right in the browser — record layered takes, and export the audio as WAV.

**UI languages:** English (default) · 中文 · 日本語

## Features
- **Web MIDI input** with device list, channel filter, live MIDI monitor, sustain pedal, pitch bend, octave / transpose.
- **12 built-in synth presets** (leads, pads, bass, FM bell, plus SFX: zap / whoosh / impact) and a full parameter editor (oscillators, FM, filter, envelope, pitch envelope, vibrato, reverb). One-click randomize.
- **Load any local video** (drag & drop). Press **Record** — the video plays from the start (or the current position, with optional count-in) and your playing is recorded.
- **Keep or discard** each take. Kept takes become **layers** — record as many as you like, each with its own sound, volume, mute/solo and time nudge.
- **Export** the mix or any single layer as 16-bit WAV (rendered offline, so it is exact regardless of how the browser played the video).
- Save / open a project as JSON.

## Why video lag does not desync your notes
Notes are stored in **video time** (`video.currentTime`), not wall-clock time, and playback is scheduled against the video clock. If the browser stutters, the picture and the music stall together. Export is rendered offline from those video-time positions.

## Run
Open `index.html` in Chrome / Edge / Opera (Web MIDI needs a Chromium-based browser; Firefox has partial support). Nothing is uploaded — everything runs locally.

Deployed with GitHub Pages: Settings → Pages → Deploy from branch → `main` / root.

## Shortcuts
`Space` play/pause · `Esc` stop · `Home` rewind · `Z`/`X` octave · `A W S E D F T G Y H U J K` piano (computer keyboard)
