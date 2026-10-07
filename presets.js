/* Preset library: instrument-style "black box" sounds built on the Pro synth parameters. */
(function () {
  const B = Synth.BASE;
  const P = (o) => Object.assign({}, B, o);
  const CATS = ['ref', 'keys', 'lead', 'bass', 'pad', 'pluck', 'edm', 'hits', 'sfx'];

  // [id, cat, {en,zh,ja}, params, flags]
  const L = [
    /* ---------- REFERENCE (built from your audio / word descriptions) ---------- */
    ['ghostChoir', 'ref', ['Ghost Choir', '幽灵合唱', 'ゴーストコーラス'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 0.9, osc2Semi: 0, osc2Detune: 14, cutoff: 2500, resonance: 0.8, keytrack: 0.4, fEnv: 0, attack: 0.55, decay: 0.8, sustain: 0.85, release: 2.2, vibRate: 3.5, vibDepth: 28, tremRate: 3.4, tremDepth: 0.6, spread: 0.7, reverb: 0.75, gain: 0.4 }],

    /* ---------- KEYS ---------- */
    ['grandPiano', 'keys', ['Grand Piano', '三角钢琴', 'グランドピアノ'], { wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.35, osc2Detune: 3, noise: 0.06, cutoff: 2200, resonance: 0.7, keytrack: 0.8, fEnv: 2.5, fDecay: 0.35, attack: 0.002, decay: 2.2, sustain: 0.05, release: 0.35, reverb: 0.25 }],
    ['softPiano', 'keys', ['Soft Piano', '柔和钢琴', 'ソフトピアノ'], { wave1: 'triangle', wave2: 'sine', osc2Level: 0.25, osc2Semi: 12, osc2Detune: 0, cutoff: 1500, resonance: 0.7, keytrack: 0.8, fEnv: 1.5, fDecay: 0.5, attack: 0.004, decay: 2.5, sustain: 0.05, release: 0.5, reverb: 0.35 }],
    ['ePiano', 'keys', ['Electric Piano', '电钢琴', 'エレピ'], { wave1: 'sine', wave2: 'sine', osc2Level: 0.12, osc2Semi: 12, osc2Detune: 0, fmAmount: 0.9, fmRatio: 1, fmDecay: 0.6, cutoff: 6000, keytrack: 0.5, attack: 0.002, decay: 2, sustain: 0.1, release: 0.3, reverb: 0.2 }],
    ['dxPiano', 'keys', ['FM Piano (DX)', 'FM 钢琴 (DX)', 'FMピアノ (DX)'], { wave1: 'sine', fmAmount: 1.6, fmRatio: 2, fmDecay: 0.35, cutoff: 9000, keytrack: 0.5, attack: 0.001, decay: 1.6, sustain: 0.05, release: 0.35, reverb: 0.2 }],
    ['clav', 'keys', ['Clavinet', '击弦古钢琴', 'クラビネット'], { wave1: 'square', wave2: 'sawtooth', osc2Level: 0.5, osc2Semi: 12, osc2Detune: 0, cutoff: 3500, resonance: 3, keytrack: 0.7, fEnv: 2, fDecay: 0.12, attack: 0.001, decay: 0.25, sustain: 0.15, release: 0.08, reverb: 0.05 }],
    ['harpsichord', 'keys', ['Harpsichord', '羽管键琴', 'ハープシコード'], { wave1: 'sawtooth', wave2: 'square', osc2Level: 0.4, osc2Semi: 12, osc2Detune: 0, noise: 0.03, cutoff: 6000, keytrack: 0.7, fEnv: 1, fDecay: 0.1, attack: 0.001, decay: 0.9, sustain: 0, release: 0.15, reverb: 0.2 }],
    ['musicBox', 'keys', ['Music Box', '八音盒', 'オルゴール'], { wave1: 'sine', wave2: 'sine', osc2Level: 0.25, osc2Semi: 12, osc2Detune: 0, fmAmount: 0.8, fmRatio: 4, fmDecay: 0.3, cutoff: 12000, keytrack: 0.3, attack: 0.001, decay: 1.4, sustain: 0, release: 0.8, reverb: 0.4 }],
    ['vibraphone', 'keys', ['Vibraphone', '颤音琴', 'ビブラフォン'], { wave1: 'sine', fmAmount: 0.6, fmRatio: 4, fmDecay: 0.8, cutoff: 9000, keytrack: 0.3, attack: 0.002, decay: 3, sustain: 0.1, release: 1.2, vibRate: 5, vibDepth: 6, reverb: 0.3 }],
    ['marimba', 'keys', ['Marimba', '马林巴', 'マリンバ'], { wave1: 'sine', wave2: 'sine', osc2Level: 0.2, osc2Semi: 24, osc2Detune: 0, fmAmount: 0.5, fmRatio: 3.75, fmDecay: 0.1, noise: 0.04, cutoff: 5000, keytrack: 0.5, attack: 0.001, decay: 0.6, sustain: 0, release: 0.15, reverb: 0.15 }],
    ['organ', 'keys', ['Organ', '风琴', 'オルガン'], { wave1: 'sine', wave2: 'sine', osc2Level: 0.55, osc2Semi: 12, osc2Detune: 0, cutoff: 9000, keytrack: 0, attack: 0.01, decay: 0.05, sustain: 1, release: 0.08, vibRate: 6, vibDepth: 5, reverb: 0.25 }],
    ['rockOrgan', 'keys', ['Rock Organ', '摇滚风琴', 'ロックオルガン'], { wave1: 'square', wave2: 'square', osc2Level: 0.45, osc2Semi: 12, osc2Detune: 4, cutoff: 4500, resonance: 1.5, keytrack: 0.3, attack: 0.004, decay: 0.05, sustain: 1, release: 0.06, vibRate: 6.5, vibDepth: 8, reverb: 0.15 }],

    /* ---------- LEAD ---------- */
    ['sineLead', 'lead', ['Sine Lead', '正弦主音', 'サインリード'], { wave1: 'sine', wave2: 'triangle', osc2Level: 0.3, osc2Semi: 12, osc2Detune: 0, cutoff: 8000, attack: 0.012, decay: 0.2, sustain: 0.8, release: 0.3, vibRate: 5.5, vibDepth: 14, reverb: 0.25 }],
    ['sawLead', 'lead', ['Saw Lead', '锯齿主音', 'ソーリード'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 0.8, osc2Detune: 12, cutoff: 2600, resonance: 3, fEnv: 1.5, fDecay: 0.4, attack: 0.008, decay: 0.3, sustain: 0.7, release: 0.2, vibDepth: 6, reverb: 0.18 }],
    ['squareLead', 'lead', ['Square Lead', '方波主音', 'スクエアリード'], { wave1: 'square', wave2: 'square', osc2Level: 0.6, osc2Detune: 8, cutoff: 3500, resonance: 2, fEnv: 1, fDecay: 0.3, attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.15, vibRate: 5.5, vibDepth: 8, reverb: 0.15 }],
    ['mellowLead', 'lead', ['Mellow Lead', '柔和主音', 'メロウリード'], { wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.3, osc2Detune: 6, cutoff: 2200, fEnv: 1, fDecay: 0.5, attack: 0.03, decay: 0.3, sustain: 0.8, release: 0.35, vibRate: 5, vibDepth: 12, reverb: 0.3 }],
    ['chip', 'lead', ['Chip Square (8-bit)', '芯片方波 (8位)', 'チップ矩形波 (8bit)'], { wave1: 'square', wave2: 'square', osc2Level: 0.25, osc2Semi: 12, osc2Detune: 0, cutoff: 9000, keytrack: 0, attack: 0.001, decay: 0.1, sustain: 0.7, release: 0.06, reverb: 0, gain: 0.4 }],

    /* ---------- BASS ---------- */
    ['subBass', 'bass', ['Sub Bass', '低频贝斯', 'サブベース'], { wave1: 'sine', wave2: 'triangle', osc2Level: 0.6, osc2Semi: -12, osc2Detune: 0, cutoff: 600, keytrack: 0.3, attack: 0.005, decay: 0.2, sustain: 0.85, release: 0.15, reverb: 0, gain: 0.7 }],
    ['sawBass', 'bass', ['Saw Bass', '锯齿贝斯', 'ソーベース'], { wave1: 'sawtooth', wave2: 'square', osc2Level: 0.5, osc2Semi: -12, osc2Detune: 0, cutoff: 700, resonance: 2, keytrack: 0.5, fEnv: 2, fDecay: 0.2, attack: 0.003, decay: 0.3, sustain: 0.6, release: 0.12, reverb: 0.03 }],
    ['fmBass', 'bass', ['FM Bass', 'FM 贝斯', 'FMベース'], { wave1: 'sine', fmAmount: 2.5, fmRatio: 1, fmDecay: 0.12, cutoff: 2500, keytrack: 0.3, attack: 0.002, decay: 0.3, sustain: 0.5, release: 0.1, reverb: 0, gain: 0.7 }],
    ['squareBass', 'bass', ['Chip Bass', '芯片贝斯', 'チップベース'], { wave1: 'square', wave2: 'square', osc2Level: 0.5, osc2Semi: -12, osc2Detune: 0, cutoff: 1400, keytrack: 0.3, attack: 0.002, decay: 0.15, sustain: 0.7, release: 0.06, reverb: 0, gain: 0.5 }],

    /* ---------- PAD & STRINGS ---------- */
    ['warmPad', 'pad', ['Warm Pad', '温暖 Pad', 'ウォームパッド'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 14, cutoff: 1400, resonance: 1.2, fEnv: 0.6, fDecay: 1.2, attack: 0.8, decay: 0.6, sustain: 0.8, release: 1.6, vibRate: 4, vibDepth: 4, reverb: 0.45, gain: 0.45 }],
    ['strings', 'pad', ['String Ensemble', '弦乐合奏', 'ストリングス'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 0.9, osc2Detune: 12, cutoff: 3000, keytrack: 0.6, attack: 0.45, decay: 0.5, sustain: 0.9, release: 0.8, vibRate: 5, vibDepth: 8, reverb: 0.35, gain: 0.45 }],
    ['airPad', 'pad', ['Airy Pad', '空灵 Pad', 'エアリーパッド'], { wave1: 'triangle', wave2: 'sine', osc2Level: 0.5, osc2Semi: 7, osc2Detune: 4, noise: 0.05, filterType: 'lowpass', cutoff: 3500, attack: 1.2, decay: 0.8, sustain: 0.9, release: 2.2, reverb: 0.6, gain: 0.5 }],
    ['choir', 'pad', ['Choir "Ooh"', '合唱 "Ooh"', 'コーラス "Ooh"'], { wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.5, osc2Detune: 8, cutoff: 1000, resonance: 5, keytrack: 0.6, attack: 0.35, decay: 0.4, sustain: 0.9, release: 0.7, vibRate: 6, vibDepth: 12, reverb: 0.45, gain: 0.45 }],
    ['eerie', 'pad', ['Eerie Drone', '诡异持续音', '不気味なドローン'], { wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.35, osc2Semi: 7, osc2Detune: 30, fmAmount: 0.8, fmRatio: 0.5, fmDecay: 2.5, cutoff: 1800, resonance: 6, fEnv: -1, fDecay: 1.5, attack: 0.9, decay: 1, sustain: 0.7, release: 2, vibRate: 6.5, vibDepth: 40, reverb: 0.55, gain: 0.45 }],
    ['tension', 'pad', ['Tension Strings', '紧张弦乐', 'テンション・ストリングス'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 40, cutoff: 2000, resonance: 2, attack: 1.5, decay: 1, sustain: 0.9, release: 1.5, vibRate: 7, vibDepth: 25, reverb: 0.4, gain: 0.4 }],

    /* ---------- PLUCK & MALLET ---------- */
    ['pluck', 'pluck', ['Pluck', '拨弦', 'プラック'], { wave1: 'sawtooth', wave2: 'square', osc2Level: 0.35, osc2Semi: -12, osc2Detune: 4, cutoff: 900, resonance: 2, fEnv: 3, fDecay: 0.22, attack: 0.002, decay: 0.35, sustain: 0, release: 0.2, reverb: 0.22 }],
    ['nylon', 'pluck', ['Nylon Guitar', '尼龙吉他', 'ナイロンギター'], { wave1: 'triangle', wave2: 'sawtooth', osc2Level: 0.3, osc2Detune: 3, noise: 0.04, cutoff: 1400, keytrack: 0.7, fEnv: 2, fDecay: 0.25, attack: 0.002, decay: 0.9, sustain: 0, release: 0.25, reverb: 0.2 }],
    ['harp', 'pluck', ['Harp', '竖琴', 'ハープ'], { wave1: 'triangle', wave2: 'sine', osc2Level: 0.3, osc2Semi: 12, osc2Detune: 0, cutoff: 5000, keytrack: 0.6, fEnv: 1, fDecay: 0.2, attack: 0.002, decay: 1.6, sustain: 0, release: 0.5, reverb: 0.35 }],
    ['kalimba', 'pluck', ['Kalimba', '拇指琴', 'カリンバ'], { wave1: 'sine', wave2: 'sine', osc2Level: 0.2, osc2Semi: 12, osc2Detune: 0, fmAmount: 0.7, fmRatio: 5, fmDecay: 0.12, cutoff: 9000, attack: 0.001, decay: 0.9, sustain: 0, release: 0.3, reverb: 0.25 }],
    ['steelDrum', 'pluck', ['Steel Drum', '钢鼓', 'スチールドラム'], { wave1: 'sine', fmAmount: 1.5, fmRatio: 2.01, fmDecay: 0.5, cutoff: 8000, attack: 0.002, decay: 0.7, sustain: 0, release: 0.3, reverb: 0.2, gain: 0.5 }],
    ['fmBell', 'pluck', ['FM Bell', 'FM 钟声', 'FMベル'], { wave1: 'sine', fmAmount: 2.4, fmRatio: 3.5, fmDecay: 1.2, cutoff: 12000, attack: 0.001, decay: 1.8, sustain: 0, release: 1.2, reverb: 0.35, gain: 0.5 }],

    /* ---------- EDM ---------- */
    ['superSaw', 'edm', ['Supersaw Lead', '超级锯齿主音', 'スーパーソー・リード'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 25, cutoff: 7000, resonance: 0.8, fEnv: 0.5, fDecay: 0.5, attack: 0.01, decay: 0.4, sustain: 0.85, release: 0.35, vibRate: 5, vibDepth: 3, reverb: 0.3, gain: 0.45 }],
    ['edmPluck', 'edm', ['EDM Pluck', 'EDM 拨奏', 'EDMプラック'], { wave1: 'sawtooth', wave2: 'square', osc2Level: 0.3, osc2Semi: 12, osc2Detune: 10, cutoff: 1600, resonance: 3, fEnv: 3, fDecay: 0.18, attack: 0.001, decay: 0.3, sustain: 0, release: 0.15, reverb: 0.3 }],
    ['chordStab', 'edm', ['Chord Stab', '和弦短击', 'コードスタブ'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 18, cutoff: 2500, resonance: 1.5, fEnv: 2.5, fDecay: 0.15, attack: 0.002, decay: 0.25, sustain: 0, release: 0.2, reverb: 0.25, gain: 0.5 }],
    ['acidBass', 'edm', ['Acid Bass', '酸性贝斯', 'アシッドベース'], { wave1: 'sawtooth', cutoff: 400, resonance: 12, keytrack: 0.3, fEnv: 3.5, fDecay: 0.2, attack: 0.001, decay: 0.25, sustain: 0.3, release: 0.08, reverb: 0.05 }],
    ['reese', 'edm', ['Reese Bass', 'Reese 贝斯', 'リースベース'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 28, cutoff: 900, resonance: 1.5, keytrack: 0.3, fEnv: 0.5, fDecay: 0.5, attack: 0.01, decay: 0.5, sustain: 0.9, release: 0.3, reverb: 0.05, gain: 0.5 }],
    ['riser', 'edm', ['Riser', '上升扫频', 'ライザー'], { wave1: 'sawtooth', wave2: 'sawtooth', osc2Level: 1, osc2Detune: 20, noise: 0.5, cutoff: 8000, resonance: 2, keytrack: 0.3, fEnv: -4, fDecay: 3, attack: 2, decay: 1, sustain: 1, release: 0.6, pitchEnv: -12, pitchDecay: 2.5, reverb: 0.3, gain: 0.4 }],
    ['subDrop', 'edm', ['Sub Drop', '低频下坠', 'サブドロップ'], { wave1: 'sine', cutoff: 800, keytrack: 0, attack: 0.01, decay: 2, sustain: 0, release: 0.5, pitchEnv: 36, pitchDecay: 0.8, reverb: 0.1, gain: 0.8 }, { low: 1 }],

    /* ---------- DRUMS & HITS ---------- */
    ['kick', 'hits', ['Kick', '底鼓', 'キック'], { wave1: 'sine', noise: 0.05, cutoff: 5000, keytrack: 0, attack: 0.001, decay: 0.35, sustain: 0, release: 0.1, pitchEnv: 36, pitchDecay: 0.09, reverb: 0, gain: 0.9 }, { low: 1 }],
    ['snare', 'hits', ['Snare', '军鼓', 'スネア'], { wave1: 'triangle', noise: 0.8, filterType: 'bandpass', cutoff: 2500, resonance: 0.8, keytrack: 0, attack: 0.001, decay: 0.18, sustain: 0, release: 0.08, pitchEnv: 12, pitchDecay: 0.05, reverb: 0.2 }],
    ['hat', 'hits', ['Hi-hat', '踩镲', 'ハイハット'], { wave1: 'off', noise: 1, filterType: 'highpass', cutoff: 8000, keytrack: 0, attack: 0.001, decay: 0.05, sustain: 0, release: 0.03, reverb: 0.05, gain: 0.5 }],
    ['clap', 'hits', ['Clap', '拍手声', 'クラップ'], { wave1: 'off', noise: 0.9, filterType: 'bandpass', cutoff: 1500, resonance: 1.5, keytrack: 0, attack: 0.003, decay: 0.22, sustain: 0, release: 0.1, reverb: 0.25 }],
    ['tom', 'hits', ['Tom', '通鼓', 'タム'], { wave1: 'sine', noise: 0.04, cutoff: 3000, keytrack: 0.3, attack: 0.001, decay: 0.4, sustain: 0, release: 0.1, pitchEnv: 12, pitchDecay: 0.12, reverb: 0.1, gain: 0.8 }],
    ['impact', 'hits', ['Impact', '冲击', 'インパクト'], { wave1: 'sine', noise: 0.35, cutoff: 3000, keytrack: 0.2, fEnv: 2, fDecay: 0.08, attack: 0.001, decay: 0.4, sustain: 0, release: 0.2, pitchEnv: 24, pitchDecay: 0.1, reverb: 0.2, gain: 0.8 }, { low: 1 }],
    ['explosion', 'hits', ['Explosion', '爆炸', '爆発'], { wave1: 'sine', noise: 1, cutoff: 2000, keytrack: 0.3, fEnv: 2, fDecay: 1.2, attack: 0.002, decay: 1.8, sustain: 0, release: 1.2, pitchEnv: 12, pitchDecay: 0.4, reverb: 0.35, gain: 0.8 }, { low: 1 }],

    /* ---------- SFX ---------- */
    ['zap', 'sfx', ['Zap', '电击', 'ザップ'], { wave1: 'sawtooth', wave2: 'square', osc2Level: 0.4, osc2Semi: 7, cutoff: 6000, resonance: 4, fEnv: 1, fDecay: 0.2, attack: 0.001, decay: 0.25, sustain: 0, release: 0.1, pitchEnv: 24, pitchDecay: 0.14, reverb: 0.2 }],
    ['laser', 'sfx', ['Laser', '激光', 'レーザー'], { wave1: 'square', cutoff: 8000, resonance: 3, keytrack: 0.3, attack: 0.001, decay: 0.3, sustain: 0, release: 0.1, pitchEnv: 48, pitchDecay: 0.08, reverb: 0.15, gain: 0.45 }],
    ['whoosh', 'sfx', ['Whoosh', '呼啸', 'ウーッシュ'], { wave1: 'off', wave2: 'off', noise: 0.9, filterType: 'bandpass', cutoff: 700, resonance: 4, keytrack: 0.6, fEnv: 3, fDecay: 1.3, attack: 0.6, decay: 1, sustain: 0.5, release: 1, reverb: 0.3 }],
    ['wind', 'sfx', ['Wind', '风声', '風'], { wave1: 'off', wave2: 'off', noise: 0.8, filterType: 'bandpass', cutoff: 500, resonance: 2, keytrack: 0.5, fEnv: 1.5, fDecay: 2, attack: 1.2, decay: 1, sustain: 0.8, release: 1.5, reverb: 0.4 }],
    ['fall', 'sfx', ['Falling Tone', '下落音', '落下音'], { wave1: 'sawtooth', cutoff: 3500, resonance: 1.5, keytrack: 0.4, attack: 0.01, decay: 1.5, sustain: 0, release: 0.3, pitchEnv: 24, pitchDecay: 1.2, reverb: 0.25, gain: 0.5 }],
    ['blip', 'sfx', ['Blip', '哔声', 'ブリップ'], { wave1: 'square', cutoff: 7000, keytrack: 0, attack: 0.001, decay: 0.08, sustain: 0.6, release: 0.05, reverb: 0, gain: 0.4 }],
    ['coin', 'sfx', ['Coin', '金币', 'コイン'], { wave1: 'square', cutoff: 8000, keytrack: 0, attack: 0.001, decay: 0.3, sustain: 0.5, release: 0.15, pitchEnv: -12, pitchDecay: 0.03, reverb: 0.05, gain: 0.4 }],
    ['bubble', 'sfx', ['Bubble', '气泡', '泡'], { wave1: 'sine', cutoff: 6000, keytrack: 0, attack: 0.001, decay: 0.12, sustain: 0, release: 0.08, pitchEnv: -12, pitchDecay: 0.06, reverb: 0.15, gain: 0.7 }],
    ['alarm', 'sfx', ['Alarm Beep', '警报哔声', 'アラーム'], { wave1: 'square', wave2: 'square', osc2Level: 0.4, osc2Semi: 7, osc2Detune: 0, cutoff: 3000, keytrack: 0, attack: 0.001, decay: 0.05, sustain: 1, release: 0.02, reverb: 0.05, gain: 0.35 }],
    ['darkBell', 'sfx', ['Dark Bell', '暗黑钟声', 'ダークベル'], { wave1: 'sine', fmAmount: 2.2, fmRatio: 2.76, fmDecay: 2.5, cutoff: 8000, keytrack: 0.3, attack: 0.001, decay: 3, sustain: 0, release: 2, reverb: 0.5, gain: 0.45 }]
  ];

  // Loudness trim (measured offline so presets sit at a similar level). Filled by tools/loudness script.
  const TRIM = (window.PRESET_TRIM || {});

  const lib = L.map(([id, cat, names, p, flags]) => {
    const params = P(p);
    if (TRIM[id]) params.gain = Math.max(0.05, Math.min(1, params.gain * TRIM[id]));
    return { id, cat, names: { en: names[0], zh: names[1], ja: names[2] }, params, low: !!(flags && flags.low) };
  });
  const byId = new Map(lib.map(p => [p.id, p]));

  /* user-saved sounds */
  const KEY = 'midimovie.mysounds';
  let mine = [];
  try { mine = JSON.parse(localStorage.getItem(KEY) || '[]').filter(m => m && m.id && m.params); } catch (e) { mine = []; }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(mine)); } catch (e) { /* ignore */ } };

  window.PresetLib = {
    CATS, list: lib,
    get(id) { return byId.get(id) || mine.find(m => m.id === id) || null; },
    name(id, lang) {
      const p = byId.get(id); if (p) return p.names[lang] || p.names.en;
      const m = mine.find(x => x.id === id); return m ? m.name : null;
    },
    mine() { return mine.slice(); },
    saveMine(name, params) {
      const m = { id: 'my_' + Date.now(), name: name, params: Object.assign({}, params) };
      mine.push(m); persist(); return m;
    },
    deleteMine(id) { mine = mine.filter(m => m.id !== id); persist(); }
  };
})();
