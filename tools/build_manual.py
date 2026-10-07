#!/usr/bin/env python3
"""Builds the 3-language PDF manuals (manual/MidiMovie-manual-{en,zh,ja}.pdf) with headless Chromium.
Usage: python3 tools/build_manual.py   (screenshots must exist in manual/img/)"""
import asyncio, pathlib, html
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
URL = 'https://aratius.github.io/MidiMovie/'

def esc(s): return html.escape(s, quote=False)

# Each section: (title, [blocks]); block = ('p', text) | ('ul', [items]) | ('ol', [items]) | ('img', name, caption) | ('table', header, rows) | ('note', text)
CONTENT = {
'en': dict(
  lang='en', file='MidiMovie-manual-en.pdf', title='MidiMovie User Manual', sub='Play a MIDI keyboard along to a video, layer your takes, and export the audio.', ver='Version 1.0 · 2026-10-07',
  toc='Contents',
  sections=[
  ('1. What MidiMovie does', [
    ('p', 'MidiMovie runs entirely in your web browser. You load a video, play a MIDI keyboard (or your computer keyboard) while watching it, and the performance is recorded in sync with the picture. Keep the takes you like, stack as many layers as you want, fine-tune every note in a piano-roll editor, and export the result as a WAV audio file.'),
    ('ul', ['Nothing is uploaded: video, notes and sounds stay in your browser.', 'Works best in Chrome or Edge (Web MIDI is required for a MIDI keyboard).', 'No MIDI keyboard? Play with your computer keyboard or click the on-screen piano.']),
  ]),
  ('2. Quick start', [
    ('ol', ['Open ' + URL + ' and press <b>+ New project</b>.', 'Drop a video file onto the player (or press <b>Load video</b>).', 'Press <b>Connect MIDI</b> and allow access when the browser asks. Skip this step to play with the computer keyboard.', 'Pick a sound in the <b>Instrument</b> panel (Simple tab → press a card to hear it).', 'Press the red <b>Record</b> button. After the count-in the video plays and your playing is recorded.', 'Press Record again (or Esc) to stop. Choose <b>Keep as new layer</b> or <b>Discard</b>.', 'Repeat for more layers. Fine-tune notes in the <b>Note editor</b>.', 'Press <b>Export mix (WAV)</b> to download the audio.']),
    ('img', 'full-en.png', 'The whole editor screen.'),
  ]),
  ('3. Projects and automatic saving', [
    ('p', 'The start page lists your projects. Each project opens the editor with its own video, layers, sounds and settings. Everything is saved automatically a moment after each change; the header shows <b>Saved</b> when it is safe.'),
    ('img', 'list-en.png', 'The project list with the manual links.'),
    ('ul', ['<b>Reload-safe:</b> after a reload the layers, sounds, settings, playhead position and the video itself are restored. The video is stored inside your browser (IndexedDB) — no server is involved.', '<b>Rename</b> a project from the list or by editing the name at the top of the editor. <b>Duplicate</b> copies layers and video. <b>Delete</b> removes both.', '<b>Export file / Import project file</b> create a backup (.midimovie.json) or move work between computers. The file contains notes and sounds but <i>not</i> the video; load the video again after importing.', 'Projects live only in the browser and device you used. Clearing site data, private/incognito windows, or a different browser will not show them — export a file for safekeeping.', 'Large videos use browser storage; the list page shows how much is used. If the browser refuses to store a video you will see a message and must reload the video after a reload.']),
  ]),
  ('4. Connecting a MIDI keyboard', [
    ('img', 'midi-en.png', 'The MIDI panel with the live monitor.'),
    ('ul', ['Plug in your keyboard, press <b>Connect MIDI</b> and allow access. Connected inputs appear in a list; untick one to ignore it. Newly plugged devices appear automatically.', '<b>Channel</b> limits input to one MIDI channel. <b>Velocity → Fixed (100)</b> ignores how hard you press.', 'The <b>MIDI monitor</b> shows incoming messages (Note On/Off, Control Change, Pitch Bend …) — handy to check that your device works.', 'Supported: notes with velocity, sustain pedal (CC 64), pitch bend (recorded too), All Notes Off.', '<b>Octave</b> and <b>Transpose</b> (Keyboard card, or Z / X keys) shift what you hear and record.', 'Without MIDI: use the computer keyboard (A W S E D F T G Y H U J K O L P ;) — the letters are shown on the piano — or click the keys. Z / X change octave.']),
    ('note', 'No sound? Browsers keep audio off until you interact with the page. Click anywhere (the orange banner says so) and play again.'),
  ]),
  ('5. Choosing and designing sounds', [
    ('p', 'The <b>Instrument</b> panel has two tabs. Whatever you hear while playing is exactly what gets recorded.'),
    ('img', 'simple-en.png', 'Simple tab: pick an instrument-style sound.'),
    ('ul', ['<b>Simple</b> — about 55 ready-made sounds in categories: Reference, Keys, Lead, Bass, Pad &amp; Strings, Pluck &amp; Mallet, EDM, Drums &amp; Hits, SFX. Press a card to select it (a short preview plays). Cards marked “play low notes” (kick, sub drop …) sound best around C1–C2.', 'Three macro sliders adjust any sound: <b>Brightness</b>, <b>Length</b>, <b>Space</b> (reverb).', '<b>Save current sound</b> stores your own version under <b>My sounds</b> (kept in this browser, shared by all projects).', '<b>Reference</b> holds sounds built from your audio or descriptions, e.g. <b>Ghost Choir</b> — a soft, slowly rising choir with a gentle trembling (about 3.4 Hz vibrato and tremolo), wide stereo and a long reverb.', 'The sounds are synthesized, so pianos and strings are approximations rather than sampled recordings.']),
    ('img', 'pro-en.png', 'Pro tab: full synthesizer parameters.'),
    ('table', ['Group', 'What it does'], [
      ['Oscillators', 'Two oscillators (sine / triangle / saw / square), the second with pitch and detune; plus a noise source.'],
      ['FM', 'A modulator that makes bell, electric-piano and metallic tones (amount, ratio, decay).'],
      ['Filter', 'Low-pass / high-pass / band-pass with cutoff, resonance, key tracking and a decaying envelope (negative amount sweeps up).'],
      ['Amp envelope', 'Attack, decay, sustain, release of the volume.'],
      ['Pitch &amp; vibrato', 'Pitch envelope (zaps, drops), vibrato and tremolo (rate/depth), pitch-bend range.'],
      ['Output', 'Stereo spread, reverb amount, level.']]),
    ('ul', ['The <b>Preset</b> menu and <b>Randomize</b> button are in the Pro tab. Editing any value switches the sound to “Custom”.', 'On a layer, <b>Use this sound</b> copies the layer’s sound into the panel; <b>Apply instrument</b> replaces the layer’s sound with the panel’s sound — so you can improve a sound after recording.']),
  ]),
  ('6. Recording takes and layers', [
    ('img', 'stage-en.png', 'Player, timeline and transport.'),
    ('table', ['Setting', 'Meaning'], [
      ['Record from', '<b>Beginning</b> rewinds to 0:00 first. <b>Current position</b> starts where the playhead is.'],
      ['Count-in', 'Seconds of count-down (with beeps) before the video starts. Off / 1 / 2 / 3 / 5 s.'],
      ['Latency compensation', 'Shifts everything you record earlier (+) or later (−) by some milliseconds, to cancel hardware delay.'],
      ['Hear existing layers', 'Plays your earlier layers while you record a new one.']]),
    ('ol', ['Press <b>Record</b>. The video plays and the REC badge appears.', 'Play. Press <b>Record</b> again, <b>Stop</b> or <b>Esc</b> (or let the video end).', 'A highlighted <b>New take</b> card appears: <b>Preview</b> plays it with the video, <b>Keep as new layer</b> saves it, <b>Record again</b> discards it and records anew, <b>Discard</b> throws it away.']),
    ('img', 'layers-en.png', 'Layers: volume, mute / solo, nudge, export.'),
    ('ul', ['Each layer has its own sound, <b>Volume</b>, <b>M</b>ute, <b>S</b>olo, <b>Nudge (ms)</b> (shift the whole layer in time), a name field, <b>WAV</b> (export only this layer) and <b>×</b> (delete).', 'The timeline under the video shows all layers; click or drag it to scrub the video.', 'While a take is waiting to be kept or discarded, the Record button is disabled — decide first.']),
  ]),
  ('7. Note editor (piano roll)', [
    ('p', 'After recording, fix timing and length while watching the picture. Press <b>Edit notes</b> on a layer (a new take is selected automatically).'),
    ('img', 'editor-en.png', 'The note editor with one note selected.'),
    ('table', ['Action', 'How'], [
      ['Move a note', 'Drag it left/right (time) and up/down (pitch). Notes snap to the chosen grid.'],
      ['Change length', 'Drag the left or right edge of a note.'],
      ['Add a note', 'Double-click an empty spot (default 250 ms).'],
      ['Select several', 'Shift-click, or drag a box on empty space. Dragging moves all selected notes together.'],
      ['Delete', 'Select and press Delete / Backspace, or the Delete button.'],
      ['Nudge', 'Arrow keys: ← → 10 ms, ↑ ↓ one semitone; hold Shift for 100 ms / one octave.'],
      ['Exact values', 'With one note selected, type Start (s), Length (ms), Pitch and Velocity below the roll.'],
      ['Undo / Redo', 'Buttons, or Ctrl/Cmd + Z (Shift for redo).'],
      ['Scrub the video', 'Click or drag the ruler at the top of the roll. Moving or selecting a note also jumps the video to that note’s start, so you can judge sync by eye.'],
      ['Zoom / scroll', 'Zoom slider or Ctrl/Cmd + wheel; wheel scrolls in time; “Fit” frames the layer; “Follow playhead” scrolls during playback.']]),
    ('note', 'Edits made while the video is playing take effect when you release the mouse.'),
  ]),
  ('8. Why video stutter does not throw things out of sync', [
    ('p', 'Every note is stored against the <b>video’s own clock</b> (its current time), not the computer’s clock, and playback of your layers is scheduled against that same clock. If the browser stalls and a 10-second video takes 12 seconds to play, the picture and your music stall together, and recorded notes still land on the right frame. Export is rendered offline from those video-time positions, so the audio file is exactly as long and as aligned as the video. The “Dropped frames” counter under the player shows how rough playback was.'),
    ('p', 'If a performance feels consistently early or late, use <b>Latency compensation</b> (for the whole take) or <b>Nudge</b> (for a layer), then fine-tune single notes in the editor.'),
  ]),
  ('9. Exporting audio', [
    ('ul', ['<b>Export mix (WAV)</b> renders all audible layers (respecting Mute/Solo and volumes) to a 16-bit stereo WAV at 44.1 or 48 kHz. <b>Normalize</b> raises the loudest peak to just below full scale.', 'Each layer’s <b>WAV</b> button exports that layer alone (stems).', 'The file starts at 0:00 and is at least as long as the video, plus room for reverb and release tails.', 'To combine with the picture, put the WAV and the original video on a timeline in any video editor, both starting at 0:00.']),
  ]),
  ('10. Keyboard shortcuts', [
    ('table', ['Key', 'Action'], [
      ['Space', 'Play / pause'], ['Esc', 'Stop (or stop recording)'], ['Home', 'Go to start'], ['Z / X', 'Octave down / up'],
      ['A W S E D F T G Y H U J K O L P ;', 'Play notes with the computer keyboard'],
      ['Delete', 'Delete selected notes'], ['← → ↑ ↓', 'Nudge selected notes'], ['Ctrl/Cmd + Z', 'Undo (Shift: redo)']]),
  ]),
  ('11. Troubleshooting', [
    ('table', ['Problem', 'What to try'], [
      ['No sound', 'Click the page once (audio is blocked until then). Check the system volume and that the layer/instrument level is not zero.'],
      ['“Web MIDI is not supported”', 'Use Chrome, Edge or Opera on a computer. Safari does not support Web MIDI.'],
      ['Keyboard not listed', 'Re-plug it, close other apps that hold the device, press Connect MIDI again, and check the browser’s MIDI permission in the address-bar site settings.'],
      ['Video will not play', 'Use MP4 (H.264) or WebM. Some MOV/MKV files use codecs the browser cannot decode — convert them first.'],
      ['Notes feel late', 'Raise Latency compensation, or use Nudge on the layer.'],
      ['Project missing', 'Projects are stored per browser and device. Use Export file / Import project file to move them.'],
      ['Video gone after reload', 'The browser may have refused to store it (storage full). Load it again; free space or export a backup file.']]),
  ]),
  ('12. Notes', [
    ('ul', ['Everything runs locally in your browser; nothing is uploaded or sent to any server.', 'Sounds are generated by a built-in synthesizer (Web Audio). Recorded audio is yours.', 'Ctrl/Cmd+Z in the editor undoes note edits only; deleting a layer or project cannot be undone.']),
  ]),
  ]),

'zh': dict(
  lang='zh-Hans', file='MidiMovie-manual-zh.pdf', title='MidiMovie 使用说明书', sub='用 MIDI 键盘对着视频即兴演奏，叠加多层录音，并导出音频。', ver='版本 1.0 · 2026-10-07',
  toc='目录',
  sections=[
  ('1. MidiMovie 是什么', [
    ('p', 'MidiMovie 完全在网页浏览器中运行。载入一段视频，一边看画面一边用 MIDI 键盘（或电脑键盘）演奏，演奏会与画面同步录下。喜欢的录音可以保留，并可叠加任意多个图层；还能在钢琴卷帘式编辑器中逐个微调音符，最后导出为 WAV 音频文件。'),
    ('ul', ['不会上传任何内容：视频、音符和音色都只保存在你的浏览器里。', '推荐使用 Chrome 或 Edge（使用 MIDI 键盘需要 Web MIDI）。', '没有 MIDI 键盘？可以用电脑键盘或点击屏幕上的钢琴键演奏。']),
  ]),
  ('2. 快速上手', [
    ('ol', ['打开 ' + URL + ' ，点击 <b>+ 新建项目</b>。', '把视频文件拖到播放器上（或点击 <b>加载视频</b>）。', '点击 <b>连接 MIDI</b>，在浏览器提示时允许访问。若用电脑键盘演奏可跳过此步。', '在 <b>乐器</b> 面板选择音色（简易标签页 → 点击卡片即可试听）。', '点击红色的 <b>录音</b> 按钮。倒数结束后视频开始播放，你的演奏随之被录下。', '再次点击录音（或按 Esc）停止，然后选择 <b>保存为新图层</b> 或 <b>丢弃</b>。', '重复以上步骤叠加更多图层，并在 <b>音符编辑器</b> 中微调。', '点击 <b>导出混音 (WAV)</b> 下载音频。']),
    ('img', 'full-zh.png', '编辑器整体界面。'),
  ]),
  ('3. 项目与自动保存', [
    ('p', '起始页会列出你的所有项目。每个项目都会打开编辑器，并带有自己的视频、图层、音色和设置。每次修改后片刻内会自动保存，页面顶部显示 <b>已保存</b> 即表示安全。'),
    ('img', 'list-zh.png', '项目列表与说明书链接。'),
    ('ul', ['<b>刷新不丢失：</b>刷新后，图层、音色、设置、播放头位置以及视频本身都会恢复。视频保存在浏览器内部（IndexedDB），不使用任何服务器。', '可在列表中 <b>重命名</b> 项目，也可直接修改编辑器顶部的名称。<b>复制</b> 会同时复制图层和视频，<b>删除</b> 会同时删除二者。', '<b>导出文件 / 导入项目文件</b> 用于备份 (.midimovie.json) 或在电脑之间转移。文件包含音符和音色，<i>不含</i>视频；导入后请重新加载视频。', '项目只保存在你所用的浏览器和设备中。清除网站数据、使用隐私/无痕窗口或换用其他浏览器都看不到它们——请导出文件妥善保管。', '大视频会占用浏览器存储空间，列表页会显示用量。如果浏览器拒绝保存视频，会弹出提示，刷新后需要重新加载视频。']),
  ]),
  ('4. 连接 MIDI 键盘', [
    ('img', 'midi-zh.png', 'MIDI 面板与实时监视器。'),
    ('ul', ['接好键盘，点击 <b>连接 MIDI</b> 并允许访问。已连接的输入设备会列在下方，取消勾选即可忽略该设备；新插入的设备会自动出现。', '<b>通道</b> 可限定只接收某一个 MIDI 通道。<b>力度 → 固定 (100)</b> 会忽略按键力度。', '<b>MIDI 监视器</b> 显示收到的消息（音符开/关、控制变化、弯音轮等），方便确认设备是否工作。', '支持：带力度的音符、延音踏板 (CC 64)、弯音轮（也会被录下）、全部音符关闭。', '<b>八度</b> 与 <b>移调</b>（键盘卡片，或按 Z / X 键）会改变你听到和录下的音高。', '没有 MIDI 时：用电脑键盘 (A W S E D F T G Y H U J K O L P ;) 演奏——琴键上会显示对应字母——或直接点击琴键。Z / X 切换八度。']),
    ('note', '没有声音？浏览器在你与页面交互之前会禁止播放音频。点击页面任意位置（橙色横幅会提示）后再弹奏。'),
  ]),
  ('5. 选择与设计音色', [
    ('p', '<b>乐器</b> 面板有两个标签页。你弹奏时听到的声音就是最终录下的声音。'),
    ('img', 'simple-zh.png', '简易标签页：选择乐器式音色。'),
    ('ul', ['<b>简易</b> — 约 55 种现成音色，分为：参考音色、键盘、主音、贝斯、Pad 与弦乐、拨弦与敲击、EDM、鼓与打击、音效。点击卡片即可选中（并播放一小段试听）。标有“请弹低音”的卡片（底鼓、低频下坠等）在 C1–C2 附近音色最佳。', '三个宏滑块可调整任意音色：<b>明亮度</b>、<b>长度</b>、<b>空间感</b>（混响）。', '<b>保存当前音色</b> 会把你调好的版本存入 <b>我的音色</b>（保存在此浏览器，所有项目共用）。', '<b>参考音色</b> 存放根据你提供的音频或文字描述制作的音色，例如 <b>幽灵合唱</b>——柔和、缓缓升起的合唱，带轻微颤抖（约 3.4 Hz 的颤音与震音）、宽广的立体声和长混响。', '音色由合成器生成，因此钢琴、弦乐等只是近似，并非采样录音。']),
    ('img', 'pro-zh.png', '专业标签页：完整的合成器参数。'),
    ('table', ['分组', '作用'], [
      ['振荡器', '两个振荡器（正弦/三角/锯齿/方波），第二个可调音高与失谐；另有噪声源。'],
      ['FM', '调制器，用于制造钟声、电钢琴和金属质感（深度、比率、衰减）。'],
      ['滤波器', '低通/高通/带通，含截止频率、共振、键盘跟踪和衰减包络（负值为向上扫频）。'],
      ['音量包络', '音量的起音、衰减、延音、释音。'],
      ['音高与颤音', '音高包络（电击、下坠音）、颤音与震音（速度/深度）、弯音范围。'],
      ['输出', '立体声宽度、混响量、电平。']]),
    ('ul', ['<b>预设</b> 菜单和 <b>随机</b> 按钮在专业标签页中。修改任何数值后，音色会变为“自定义”。', '在图层上，<b>使用此音色</b> 会把该图层的音色复制到面板；<b>应用当前乐器</b> 则用面板的音色替换该图层的音色——录完之后也能改进音色。']),
  ]),
  ('6. 录制与图层', [
    ('img', 'stage-zh.png', '播放器、时间轴与走带控制。'),
    ('table', ['设置', '含义'], [
      ['录音起点', '<b>从头开始</b> 会先回到 0:00；<b>当前位置</b> 从播放头所在位置开始。'],
      ['预备倒数', '视频开始前的倒数秒数（带提示音）。可选 关闭 / 1 / 2 / 3 / 5 秒。'],
      ['延迟补偿', '把录下的内容整体提前 (+) 或延后 (−) 若干毫秒，用来抵消硬件延迟。'],
      ['录音时播放已有图层', '录制新图层时同时播放之前的图层。']]),
    ('ol', ['点击 <b>录音</b>，视频开始播放并出现 REC 标记。', '演奏。再次点击 <b>录音</b>、<b>停止</b> 或按 <b>Esc</b>（或等视频播完）即可结束。', '会出现高亮的 <b>新录音</b> 卡片：<b>试听</b> 配合视频回放，<b>保存为新图层</b> 保存，<b>重新录音</b> 丢弃并重录，<b>丢弃</b> 直接删除。']),
    ('img', 'layers-zh.png', '图层：音量、静音/独奏、微调、导出。'),
    ('ul', ['每个图层都有自己的音色、<b>音量</b>、<b>M</b>（静音）、<b>S</b>（独奏）、<b>微调 (毫秒)</b>（整体平移时间）、名称栏、<b>WAV</b>（仅导出该图层）和 <b>×</b>（删除）。', '视频下方的时间轴显示所有图层；点击或拖动可拖动视频进度。', '录音尚未决定保存或丢弃时，录音按钮会被禁用——请先处理。']),
  ]),
  ('7. 音符编辑器（钢琴卷帘）', [
    ('p', '录完后，可以一边看画面一边修正时机和长度。点击图层上的 <b>编辑音符</b>（新录音会自动被选中）。'),
    ('img', 'editor-zh.png', '选中一个音符的音符编辑器。'),
    ('table', ['操作', '方法'], [
      ['移动音符', '左右拖动（时间）、上下拖动（音高）。音符会吸附到所选网格。'],
      ['改变长度', '拖动音符的左边缘或右边缘。'],
      ['添加音符', '双击空白处（默认 250 毫秒）。'],
      ['多选', 'Shift 点击，或在空白处拖出选框。拖动时所有选中的音符一起移动。'],
      ['删除', '选中后按 Delete / Backspace，或点击删除按钮。'],
      ['微调', '方向键：← → 10 毫秒，↑ ↓ 一个半音；按住 Shift 为 100 毫秒 / 一个八度。'],
      ['精确数值', '只选中一个音符时，可在卷帘下方输入 起点 (秒)、长度 (毫秒)、音高和力度。'],
      ['撤销 / 重做', '按钮，或 Ctrl/Cmd + Z (加 Shift 为重做)。'],
      ['拖动视频进度', '点击或拖动卷帘顶部的标尺。移动或选中音符时，视频也会跳到该音符的起点，方便用眼睛判断是否同步。'],
      ['缩放 / 滚动', '缩放滑块或 Ctrl/Cmd + 滚轮；滚轮在时间方向滚动；“适应”框住整个图层；“跟随播放头”在播放时自动滚动。']]),
    ('note', '在视频播放过程中进行的修改，会在松开鼠标后生效。'),
  ]),
  ('8. 视频卡顿为什么不会导致错位', [
    ('p', '每个音符都按 <b>视频自身的时钟</b>（当前播放时间）而不是电脑时钟来保存，图层的回放也按同一个时钟调度。即使浏览器卡顿，10 秒的视频花了 12 秒才播完，画面和音乐也会一起停顿，已录下的音符依然落在正确的画面上。导出时根据这些视频时间位置离线渲染，因此音频文件的长度和对位与视频完全一致。播放器下方的“丢帧数”显示了播放的流畅程度。'),
    ('p', '如果总觉得演奏偏早或偏晚，可使用 <b>延迟补偿</b>（对整段录音）或 <b>微调</b>（对某个图层），再在编辑器里微调单个音符。'),
  ]),
  ('9. 导出音频', [
    ('ul', ['<b>导出混音 (WAV)</b> 会把所有可听见的图层（遵循静音/独奏和音量）渲染为 16 位立体声 WAV，采样率为 44.1 或 48 kHz。<b>标准化</b> 会把最大峰值提升到接近满量程。', '每个图层的 <b>WAV</b> 按钮可单独导出该图层（分轨）。', '文件从 0:00 开始，长度至少与视频相同，并为混响和释音尾巴留出余量。', '要与画面合成，请在任意视频剪辑软件的时间轴上放入该 WAV 和原视频，并使两者都从 0:00 开始。']),
  ]),
  ('10. 快捷键', [
    ('table', ['按键', '功能'], [
      ['空格', '播放 / 暂停'], ['Esc', '停止（或停止录音）'], ['Home', '回到开头'], ['Z / X', '降低 / 升高八度'],
      ['A W S E D F T G Y H U J K O L P ;', '用电脑键盘弹奏'],
      ['Delete', '删除选中的音符'], ['← → ↑ ↓', '微调选中的音符'], ['Ctrl/Cmd + Z', '撤销 (Shift：重做)']]),
  ]),
  ('11. 常见问题', [
    ('table', ['问题', '解决办法'], [
      ['没有声音', '先点击一下页面（在此之前音频被禁用）。检查系统音量，以及图层/乐器电平是否为零。'],
      ['“不支持 Web MIDI”', '请在电脑上使用 Chrome、Edge 或 Opera。Safari 不支持 Web MIDI。'],
      ['看不到键盘', '重新插拔，关闭其他占用该设备的应用，再次点击“连接 MIDI”，并在地址栏的网站设置中检查 MIDI 权限。'],
      ['视频无法播放', '请使用 MP4 (H.264) 或 WebM。部分 MOV/MKV 文件的编码浏览器无法解码，请先转换。'],
      ['音符偏晚', '增大延迟补偿，或对图层使用微调。'],
      ['项目不见了', '项目按浏览器和设备分别保存。请用“导出文件 / 导入项目文件”转移。'],
      ['刷新后视频丢失', '浏览器可能拒绝保存（存储空间已满）。请重新加载视频；腾出空间或导出备份文件。']]),
  ]),
  ('12. 注意事项', [
    ('ul', ['一切都在浏览器本地运行，不会上传或发送到任何服务器。', '音色由内置合成器 (Web Audio) 生成。录制的音频归你所有。', '编辑器中的 Ctrl/Cmd+Z 只撤销音符编辑；删除图层或项目后无法恢复。']),
  ]),
  ]),

'ja': dict(
  lang='ja', file='MidiMovie-manual-ja.pdf', title='MidiMovie 取扱説明書', sub='MIDIキーボードで映像に合わせて演奏し、重ね録りして音声を書き出します。', ver='バージョン 1.0 · 2026-10-07',
  toc='目次',
  sections=[
  ('1. MidiMovieでできること', [
    ('p', 'MidiMovie はウェブブラウザだけで動きます。動画を読み込み、映像を見ながらMIDIキーボード(またはPCのキーボード)で演奏すると、演奏が映像と同期して録音されます。気に入ったテイクは残し、好きなだけレイヤーを重ね、ピアノロール形式のエディターでノートを1つずつ微調整して、WAV音声ファイルとして書き出せます。'),
    ('ul', ['何もアップロードされません。動画・ノート・音色はすべてブラウザの中に保存されます。', 'Chrome または Edge 推奨(MIDIキーボードにはWeb MIDIが必要です)。', 'MIDIキーボードがなくても、PCのキーボードや画面のピアノ鍵盤で演奏できます。']),
  ]),
  ('2. クイックスタート', [
    ('ol', ['' + URL + ' を開き、<b>+ 新規プロジェクト</b> を押します。', 'プレーヤーに動画ファイルをドロップします(または <b>動画を読み込む</b>)。', '<b>MIDIに接続</b> を押し、ブラウザの確認で許可します。PCキーボードで弾く場合は不要です。', '<b>インストゥルメント</b> パネルで音色を選びます(かんたんタブ → カードを押すと試聴できます)。', '赤い <b>録音</b> ボタンを押します。カウントインのあと動画が再生され、演奏が録音されます。', 'もう一度録音(または Esc)で停止し、<b>新規レイヤーとして保存</b> か <b>破棄</b> を選びます。', '同じ手順でレイヤーを重ね、<b>ノートエディター</b> で細かく調整します。', '<b>ミックスを書き出し (WAV)</b> を押して音声をダウンロードします。']),
    ('img', 'full-ja.png', 'エディター画面の全体。'),
  ]),
  ('3. プロジェクトと自動保存', [
    ('p', '最初のページにプロジェクト一覧が表示されます。プロジェクトを開くと、そのプロジェクト専用の動画・レイヤー・音色・設定でエディターが開きます。変更のたびに少し後で自動保存され、画面上部に <b>保存済み</b> と出れば安全です。'),
    ('img', 'list-ja.png', 'プロジェクト一覧と取扱説明書へのリンク。'),
    ('ul', ['<b>リロードしても消えません:</b> リロード後も、レイヤー・音色・設定・再生位置、そして動画そのものが復元されます。動画はブラウザ内(IndexedDB)に保存され、サーバーは使いません。', '<b>名前の変更</b> は一覧から、またはエディター上部の名前欄で行えます。<b>複製</b> はレイヤーと動画ごとコピーし、<b>削除</b> は両方を消します。', '<b>ファイル書き出し / プロジェクトファイルを読み込む</b> でバックアップ(.midimovie.json)やPC間の移動ができます。ファイルにはノートと音色が入りますが、<i>動画は含まれません</i>。読み込み後は動画を読み込み直してください。', 'プロジェクトは使ったブラウザ・端末の中だけにあります。サイトデータの削除、プライベート/シークレットウィンドウ、別のブラウザでは表示されません。大事なものはファイルに書き出してください。', '大きな動画はブラウザの保存容量を使います(使用量は一覧ページに表示)。動画を保存できない場合はメッセージが出て、リロード後に動画の読み込み直しが必要になります。']),
  ]),
  ('4. MIDIキーボードの接続', [
    ('img', 'midi-ja.png', 'MIDIパネルとリアルタイムモニター。'),
    ('ul', ['キーボードを接続して <b>MIDIに接続</b> を押し、許可します。接続された入力デバイスが一覧に出ます(チェックを外すと無視)。後から挿したデバイスも自動で現れます。', '<b>チャンネル</b> で特定のMIDIチャンネルだけ受け付けます。<b>ベロシティ → 固定 (100)</b> は打鍵の強さを無視します。', '<b>MIDIモニター</b> に受信メッセージ(ノートオン/オフ、コントロールチェンジ、ピッチベンドなど)が表示され、機器の動作確認に便利です。', '対応: ベロシティ付きノート、サスティンペダル(CC 64)、ピッチベンド(録音もされます)、オールノートオフ。', '<b>オクターブ</b> と <b>トランスポーズ</b>(キーボードのカード、または Z / X キー)で、聞こえる音・録音される音の高さを変えられます。', 'MIDIがないとき: PCキーボード (A W S E D F T G Y H U J K O L P ;) で演奏できます。鍵盤に対応する文字が表示されます。鍵盤のクリックでも弾けます。Z / X でオクターブ変更。']),
    ('note', '音が出ない場合: ブラウザはページを操作するまで音声を止めています。画面のどこかをクリックして(オレンジのバナーが案内します)、もう一度弾いてください。'),
  ]),
  ('5. 音色の選択と作り込み', [
    ('p', '<b>インストゥルメント</b> パネルには2つのタブがあります。演奏中に聞こえる音が、そのまま録音されます。'),
    ('img', 'simple-ja.png', 'かんたんタブ: 楽器風の音色を選ぶ。'),
    ('ul', ['<b>かんたん</b> — 約55種類の出来合いの音色を、リファレンス / 鍵盤 / リード / ベース / パッド・弦 / 撥弦・打楽器的 / EDM / ドラム・ヒット / 効果音 のカテゴリーに収録。カードを押すと選択され、短い試聴音が鳴ります。「低音で弾く」と書かれたカード(キック、サブドロップなど)は C1〜C2 付近が最適です。', '3つのマクロスライダーで、どの音色も調整できます: <b>明るさ</b>、<b>長さ</b>、<b>空間</b>(リバーブ)。', '<b>現在の音色を保存</b> で、自分用の音色を <b>マイサウンド</b> に保存できます(このブラウザに保存され、全プロジェクトで共通)。', '<b>リファレンス</b> には、お預かりした音声や言葉の説明から作った音色が入ります。例: <b>ゴーストコーラス</b> — ゆっくり立ち上がる柔らかいコーラスで、わずかに震え(約3.4Hzのビブラートとトレモロ)、広いステレオと長いリバーブを持ちます。', '音色はシンセサイザーで生成しているため、ピアノや弦はサンプル録音ではなく近似です。']),
    ('img', 'pro-ja.png', 'プロタブ: シンセサイザーの全パラメーター。'),
    ('table', ['グループ', '役割'], [
      ['オシレーター', '2つのオシレーター(サイン/三角/ノコギリ/矩形)。2つ目はピッチとデチューン可。ノイズ源もあります。'],
      ['FM', 'ベル、エレピ、金属的な音を作る変調器(量・比・ディケイ)。'],
      ['フィルター', 'ローパス/ハイパス/バンドパス。カットオフ、レゾナンス、キートラッキング、減衰エンベロープ(マイナスで上向きにスイープ)。'],
      ['アンプエンベロープ', '音量のアタック・ディケイ・サスティン・リリース。'],
      ['ピッチ / ビブラート', 'ピッチエンベロープ(ザップ、落下音)、ビブラートとトレモロ(速度/深さ)、ベンドレンジ。'],
      ['出力', 'ステレオの広がり、リバーブ量、レベル。']]),
    ('ul', ['<b>プリセット</b> メニューと <b>ランダム</b> ボタンはプロタブにあります。値を変えると音色は「カスタム」になります。', 'レイヤーの <b>この音色を使う</b> はそのレイヤーの音色をパネルにコピー、<b>現在の音色を適用</b> はパネルの音色でレイヤーの音色を置き換えます。録音後に音色を良くすることもできます。']),
  ]),
  ('6. 録音とレイヤー', [
    ('img', 'stage-ja.png', 'プレーヤー、タイムライン、トランスポート。'),
    ('table', ['設定', '意味'], [
      ['録音開始位置', '<b>最初から</b> は先に0:00へ戻します。<b>現在位置から</b> は再生ヘッドの位置から始めます。'],
      ['カウントイン', '動画が始まる前のカウントダウン秒数(ビープ付き)。なし / 1 / 2 / 3 / 5 秒。'],
      ['レイテンシ補正', '録音内容全体を数ミリ秒だけ前(+)または後ろ(−)にずらし、機器の遅延を打ち消します。'],
      ['録音中に既存レイヤーも再生', '新しいレイヤーを録る間、既存のレイヤーも鳴らします。']]),
    ('ol', ['<b>録音</b> を押すと動画が再生され、REC表示が出ます。', '演奏します。もう一度 <b>録音</b>、<b>停止</b>、または <b>Esc</b> で終了します(動画が最後まで進んでも終了します)。', '強調表示された <b>新しいテイク</b> カードが出ます。<b>プレビュー</b> は映像と一緒に再生、<b>新規レイヤーとして保存</b> は保存、<b>もう一度録音</b> は破棄してやり直し、<b>破棄</b> は捨てます。']),
    ('img', 'layers-ja.png', 'レイヤー: 音量、ミュート/ソロ、ずらし、書き出し。'),
    ('ul', ['各レイヤーには、固有の音色、<b>音量</b>、<b>M</b>(ミュート)、<b>S</b>(ソロ)、<b>ずらし (ms)</b>(レイヤー全体を時間方向にずらす)、名前欄、<b>WAV</b>(そのレイヤーだけ書き出し)、<b>×</b>(削除)があります。', '映像の下のタイムラインに全レイヤーが表示され、クリックやドラッグで映像をスクラブできます。', 'テイクの保存/破棄を決めるまで、録音ボタンは押せません。先に決めてください。']),
  ]),
  ('7. ノートエディター(ピアノロール)', [
    ('p', '録音後、映像を見ながらタイミングや長さを修正できます。レイヤーの <b>ノートを編集</b> を押します(新しいテイクは自動で選択されます)。'),
    ('img', 'editor-ja.png', 'ノートを1つ選択したノートエディター。'),
    ('table', ['操作', '方法'], [
      ['ノートの移動', '左右(時間)・上下(音程)にドラッグ。選んだグリッドにスナップします。'],
      ['長さの変更', 'ノートの左端または右端をドラッグ。'],
      ['ノートの追加', '空いている場所をダブルクリック(初期値 250 ms)。'],
      ['複数選択', 'Shift+クリック、または空き領域をドラッグして範囲選択。ドラッグすると選択したノートがまとめて動きます。'],
      ['削除', '選択して Delete / Backspace、または削除ボタン。'],
      ['微調整', '矢印キー: ← → は10 ms、↑ ↓ は半音。Shiftで100 ms / 1オクターブ。'],
      ['正確な数値', 'ノートを1つ選ぶと、ロール下で 開始(秒)・長さ(ms)・音程・ベロシティを数値入力できます。'],
      ['元に戻す / やり直し', 'ボタン、または Ctrl/Cmd + Z (Shiftでやり直し)。'],
      ['映像のスクラブ', 'ロール上部のルーラーをクリック/ドラッグ。ノートを動かす・選ぶと映像もそのノートの開始位置へ移動するので、目でズレを確認できます。'],
      ['ズーム / スクロール', 'ズームスライダー、または Ctrl/Cmd + ホイール。ホイールで時間方向にスクロール。「フィット」でレイヤー全体を表示、「再生位置に追従」で再生中に自動スクロール。']]),
    ('note', '動画の再生中に行った編集は、マウスを離したときに反映されます。'),
  ]),
  ('8. 映像がもたついてもズレない理由', [
    ('p', 'すべてのノートは、パソコンの時計ではなく <b>映像自身の時計</b>(現在の再生時間)を基準に保存され、レイヤーの再生も同じ時計に合わせて鳴らされます。ブラウザが詰まって10秒の動画が12秒かかっても、映像と音楽は一緒に止まり、録音したノートは正しいコマに乗ったままです。書き出しもその映像上の位置からオフラインでレンダリングするため、音声ファイルの長さと位置は映像と正確に一致します。プレーヤー下の「コマ落ち」は再生の荒れ具合の目安です。'),
    ('p', '演奏がいつも早い・遅いと感じるときは、<b>レイテンシ補正</b>(テイク全体)や <b>ずらし</b>(レイヤー単位)を使い、さらにエディターでノート単位に調整してください。'),
  ]),
  ('9. 音声の書き出し', [
    ('ul', ['<b>ミックスを書き出し (WAV)</b> は、聞こえているレイヤー(ミュート/ソロと音量を反映)を、44.1 または 48 kHz の16bitステレオWAVにレンダリングします。<b>ノーマライズ</b> は最大ピークをフルスケール直前まで持ち上げます。', '各レイヤーの <b>WAV</b> ボタンで、そのレイヤー単体(ステム)を書き出せます。', 'ファイルは 0:00 から始まり、動画と同じ長さ以上で、リバーブやリリースの余韻分も含みます。', '映像と合わせるには、動画編集ソフトのタイムラインにこのWAVと元の動画を、どちらも 0:00 から置いてください。']),
  ]),
  ('10. キーボードショートカット', [
    ('table', ['キー', '動作'], [
      ['Space', '再生 / 一時停止'], ['Esc', '停止(録音も停止)'], ['Home', '先頭へ'], ['Z / X', 'オクターブ下げる / 上げる'],
      ['A W S E D F T G Y H U J K O L P ;', 'PCキーボードで演奏'],
      ['Delete', '選択したノートを削除'], ['← → ↑ ↓', '選択したノートを微調整'], ['Ctrl/Cmd + Z', '元に戻す (Shift: やり直し)']]),
  ]),
  ('11. トラブルシューティング', [
    ('table', ['症状', '対処'], [
      ['音が出ない', 'ページを一度クリックしてください(それまで音声はブロックされます)。システム音量や、レイヤー/音色のレベルが0でないか確認します。'],
      ['「Web MIDIに対応していません」', 'パソコンの Chrome、Edge、Opera をお使いください。SafariはWeb MIDI非対応です。'],
      ['キーボードが一覧に出ない', '挿し直し、デバイスを使っている他のアプリを閉じ、もう一度「MIDIに接続」を押します。アドレスバーのサイト設定でMIDIの許可も確認してください。'],
      ['動画が再生できない', 'MP4 (H.264) か WebM をお使いください。一部のMOV/MKVはブラウザが読めないコーデックなので、変換が必要です。'],
      ['ノートが遅れて感じる', 'レイテンシ補正を上げるか、レイヤーのずらしを使います。'],
      ['プロジェクトが見つからない', 'プロジェクトはブラウザ・端末ごとに保存されます。「ファイル書き出し / プロジェクトファイルを読み込む」で移してください。'],
      ['リロードで動画が消えた', 'ブラウザが保存を拒否した可能性があります(容量不足)。動画を読み込み直し、空き容量の確保かバックアップ書き出しをしてください。']]),
  ]),
  ('12. 補足', [
    ('ul', ['すべてブラウザ内でローカルに動作し、どのサーバーにも送信・アップロードされません。', '音色は内蔵シンセサイザー(Web Audio)で生成されます。録音した音声はあなたのものです。', 'エディターの Ctrl/Cmd+Z で戻せるのはノート編集のみです。レイヤーやプロジェクトの削除は元に戻せません。']),
  ]),
  ]),
}

CSS = """
@page { size: A4; margin: 16mm 15mm 18mm; }
* { box-sizing: border-box; }
body { font-family: "Noto Sans CJK JP","Noto Sans CJK SC","Noto Sans",system-ui,sans-serif; color:#1b1d24; font-size:10.4pt; line-height:1.62; margin:0; }
.cover { height: 255mm; display:flex; flex-direction:column; justify-content:center; page-break-after:always; }
.cover .logo { width:20mm; height:20mm; background:#101216; border-radius:4mm; padding:3mm; margin-bottom:10mm; }
.cover .logo rect { fill:#ff7a45; }
.cover h1 { font-size:30pt; margin:0 0 4mm; letter-spacing:.3px; }
.cover p.sub { font-size:13pt; color:#454a58; margin:0 0 10mm; max-width:140mm; }
.cover .meta { color:#6a7080; font-size:10pt; }
.cover .url { margin-top:4mm; font-weight:700; color:#d4521f; font-size:11pt; }
.toc { page-break-after:always; }
.toc h2 { font-size:16pt; margin:0 0 6mm; border:0; }
.toc ol { list-style:none; padding:0; margin:0; }
.toc li { padding:2.2mm 0; border-bottom:1px solid #e3e5ea; font-size:11pt; }
h2 { font-size:15pt; margin:9mm 0 3mm; padding-bottom:1.5mm; border-bottom:2px solid #ff7a45; page-break-after:avoid; }
section { page-break-inside:auto; }
p { margin:0 0 3mm; }
ul, ol { margin:0 0 3.5mm; padding-left:6mm; }
li { margin:0 0 1.4mm; }
figure { margin:3mm 0 5mm; text-align:center; page-break-inside:avoid; }
figure img { max-width:100%; max-height:118mm; border:1px solid #d9dce3; border-radius:2mm; }
figcaption { font-size:8.8pt; color:#6a7080; margin-top:1.5mm; }
table { border-collapse:collapse; width:100%; margin:2mm 0 5mm; font-size:9.6pt; page-break-inside:auto; }
tr { page-break-inside:avoid; }
th, td { border:1px solid #d9dce3; padding:1.6mm 2.4mm; vertical-align:top; text-align:left; }
th { background:#f1f2f6; }
td:first-child { font-weight:600; width:34%; }
.note { background:#fff4ec; border-left:3px solid #ff7a45; padding:2.4mm 3.5mm; margin:2mm 0 4mm; font-size:9.8pt; }
b { font-weight:700; }
"""

def block(b):
    k = b[0]
    if k == 'p': return f'<p>{b[1]}</p>'
    if k == 'ul': return '<ul>' + ''.join(f'<li>{x}</li>' for x in b[1]) + '</ul>'
    if k == 'ol': return '<ol>' + ''.join(f'<li>{x}</li>' for x in b[1]) + '</ol>'
    if k == 'img': return f'<figure><img src="img/{b[1]}"><figcaption>{b[2]}</figcaption></figure>'
    if k == 'note': return f'<div class="note">{b[1]}</div>'
    if k == 'table':
        head = ''.join(f'<th>{h}</th>' for h in b[1]); rows = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in b[2])
        return f'<table><tr>{head}</tr>{rows}</table>'
    return ''

def page(c):
    toc = ''.join(f'<li>{esc(t)}</li>' for t, _ in c['sections'])
    secs = ''.join(f'<section><h2>{t}</h2>' + ''.join(block(b) for b in bl) + '</section>' for t, bl in c['sections'])
    logo = '<svg class="logo" viewBox="0 0 32 32"><rect x="6" y="7" width="4" height="18" rx="1"/><rect x="14" y="12" width="4" height="13" rx="1"/><rect x="22" y="5" width="4" height="20" rx="1"/></svg>'
    return f'''<!doctype html><html lang="{c['lang']}"><head><meta charset="utf-8"><title>{esc(c['title'])}</title><style>{CSS}</style></head><body>
<div class="cover">{logo}<h1>{esc(c['title'])}</h1><p class="sub">{esc(c['sub'])}</p><div class="meta">{esc(c['ver'])}</div><div class="url">{URL}</div></div>
<div class="toc"><h2>{esc(c['toc'])}</h2><ol>{toc}</ol></div>{secs}</body></html>'''

async def main():
    out = ROOT / 'manual'; out.mkdir(exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(); 
        for key, c in CONTENT.items():
            f = out / f'_manual-{key}.html'; f.write_text(page(c), encoding='utf-8')
            pg = await b.new_page(); await pg.goto(f.as_uri()); await pg.wait_for_timeout(500)
            await pg.pdf(path=str(out / c['file']), format='A4', print_background=True, display_header_footer=True,
                         header_template='<span></span>',
                         footer_template='<div style="font-size:8px;color:#8a8f9c;width:100%;text-align:center;font-family:sans-serif"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
                         margin=dict(top='16mm', bottom='18mm', left='15mm', right='15mm'))
            await pg.close(); f.unlink()
            print('built', c['file'])
        await b.close()
asyncio.run(main())
