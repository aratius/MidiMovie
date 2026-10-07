"""Manual content for the v3 features. patch(CONTENT) edits/extends the base sections in build_manual.py."""
import re

X = {
'en': dict(
 rec_rows=[['Speed', 'Playback speed while recording: 1×, ¾, ½ or ¼ (see the next section).'],
  ['Record from', '<b>Beginning</b> rewinds to 0:00 first. <b>Current position</b> starts where the playhead is.'],
  ['Count-in', 'Seconds of count-down (with beeps) before the video starts. Off / 1 / 2 / 3 / 5 s.']],
 rec_note='<b>Latency compensation</b> and <b>Hear existing layers while recording</b> live in <b>Settings</b> (the slider icon at the top right).',
 roll_rows=[['Copy / paste / duplicate', 'Ctrl/Cmd + C copies the selected notes, Ctrl/Cmd + V pastes them at the playhead, Ctrl/Cmd + D duplicates them right after the selection, Ctrl/Cmd + A selects everything. The same actions are buttons under the roll.'],
  ['Transpose selection', 'The −12 −1 +1 +12 buttons move the selected notes by octaves / semitones.'],
  ['Velocity lane', 'The strip under the roll shows every note’s velocity as a stem. Drag a stem up or down (all selected notes move together), or drag across empty space to paint velocities. Untick “Velocity lane” to hide it.']],
 slow=('Slow-motion recording, frames and markers', [
  ('p', 'Tricky moments are easier to score slowly. Notes are stored in <b>video time</b>, so a take played at half speed lines up perfectly at normal speed.'),
  ('table', ['Control', 'What it does'], [
    ['Speed 1× ¾ ½ ¼', 'Playback speed for playing and recording (under the player; locked while recording).'],
    ['◀ ▶ buttons · , and . keys', 'Step one video frame back / forward (Shift = ten frames). The frame rate is detected automatically. With no note selected, ← → do the same.'],
    ['Flag button · M', 'Drop a marker at the playhead; press again on the same spot to remove it. Markers appear on the timeline and in the note editor, notes snap to them, and they are exported to MIDI.'],
    ['[ and ]', 'Jump to the previous / next marker.'],
    ['Flag on the timeline', 'Click to jump there · double-click to rename · Shift-click to delete.']]),
  ('note', 'Latency compensation is applied in real time, so it stays correct at slow speeds.')]),
 sampler=('Sampler: turn any sound into an instrument', [
  ('p', 'The <b>Sampler</b> tab in the Instrument panel makes footsteps, a door slam or your own voice playable from the keyboard.'),
  ('img', 'sampler-en.png', 'The Sampler tab with a loaded sound.'),
  ('ul', ['<b>Add audio file</b> (WAV, MP3, M4A, OGG …), <b>Record mic</b> (up to 30 s; the browser asks permission) or <b>From video audio</b> (the loaded video’s soundtrack).',
   'Select a sample to see its waveform. Drag the orange handles to trim the start and end.',
   '<b>Original pitch</b> is the key that plays the sample unchanged; other keys play it higher or lower. Choose <i>No pitch change</i> for one-shot sound effects. <b>Loop while held</b> sustains the trimmed region.',
   'Attack, Release, Tone, Reverb and Level shape the result. A sampler sound works like any other: record with it and each layer remembers its sample.',
   'Samples are stored in your browser and shared by all projects. Backups (ZIP) include the samples a project uses.'])]),
 export=('Exporting audio and MIDI', [
  ('img', 'export-en.png', 'The Export dialog.'),
  ('ul', ['Press <b>Export</b> (top right). <b>Export mix (WAV)</b> renders all audible layers (Mute/Solo and volumes respected) as a 16-bit stereo WAV at 44.1 or 48 kHz.',
   '<b>Loudness</b>: <i>Off</i> keeps the level as played. <i>Peak −1 dBFS</i> raises the loudest peak to −1 dBFS. <i>Target loudness</i> measures integrated loudness (LUFS, ITU-R BS.1770) and adjusts it to your target — −14 for streaming, −16 podcasts, −23 broadcast — with a limiter keeping peaks under −1 dBFS. The measured result is shown after export.',
   '<b>Stems (ZIP)</b> exports every layer as its own WAV at its original level. A layer’s <b>⋯</b> menu exports just that layer as WAV or MIDI.',
   '<b>Export MIDI (.mid)</b> writes every layer as a track (timing matches the video 1:1) together with your markers, for any DAW.',
   'The level meter beside the volume control shows the master output; click it to reset the peak. It turns red when the signal reaches 0 dBFS.',
   'To combine with the picture, put the WAV and the original video on a timeline in any video editor, both starting at 0:00.'])]),
 backup=('Backups, MIDI import, offline use and touch', [
  ('ul', ['<b>Project → Export backup (ZIP)</b> bundles the project, its video and its samples into one file. <b>Restore from backup</b> (in that dialog, or <i>Import backup / file</i> on the project list) creates a new project from it — ideal for another computer or a safe copy. Every project card also has a <b>Backup</b> button.',
   '<b>Project → Import .mid</b> adds the tracks of a MIDI file as new layers using the current instrument (markers are imported too).',
   '<b>Install as an app:</b> use the install icon in Chrome / Edge’s address bar, or “Add to Home Screen” on a tablet. After one online visit the app also works offline.',
   '<b>Touch screens:</b> the on-screen keyboard supports several fingers and sliding between keys; touching nearer the bottom of a key plays louder. On narrow screens it shows three octaves with ‹ › buttons to move.',
   'The keyboard icon at the top right lists every shortcut (or press <b>?</b>).'])]),
 keys=[['Space', 'Play / pause'], ['Esc', 'Stop (or stop recording)'], ['Home', 'Go to start'], [', and .', 'Step one frame (Shift: ten)'], ['M', 'Add / remove marker'], ['[ and ]', 'Previous / next marker'],
  ['Z / X', 'Octave down / up'], ['A W S E D F T G Y H U J K O L P ;', 'Play notes with the computer keyboard'], ['Ctrl/Cmd + C · V · D · A', 'Copy · paste · duplicate · select all notes'],
  ['Delete', 'Delete selected notes'], ['← → ↑ ↓', 'Nudge selected notes (← → step frames when nothing is selected)'], ['Ctrl/Cmd + Z', 'Undo (Shift: redo)'], ['?', 'Show the shortcut list']],
 proj_extra='<b>Backup (ZIP)</b> in the editor’s <b>Project</b> dialog (or on each project card) saves the project <i>with</i> its video and samples.',
 index_note=None),
'zh': dict(
 rec_rows=[['速度', '录音时的播放速度：1×、¾、½ 或 ¼（见下一节）。'],
  ['录音起点', '<b>开头</b> 会先回到 0:00。<b>当前位置</b> 从播放头处开始。'],
  ['倒数', '视频开始前的倒数秒数（带提示音）。关 / 1 / 2 / 3 / 5 秒。']],
 rec_note='<b>延迟补偿</b> 与 <b>录音时听到已有图层</b> 位于 <b>设置</b>（右上角的滑块图标）。',
 roll_rows=[['复制 / 粘贴 / 重复', 'Ctrl/Cmd + C 复制所选音符，Ctrl/Cmd + V 粘贴到播放头处，Ctrl/Cmd + D 紧接所选内容重复一份，Ctrl/Cmd + A 全选。卷帘下方也有对应按钮。'],
  ['移调所选音符', '用 −12 −1 +1 +12 按钮按八度 / 半音移动所选音符。'],
  ['力度通道', '卷帘下方的条带以竖线显示每个音符的力度。上下拖动竖线（所选音符一起变化），或在空白处横向拖动来“涂抹”力度。取消勾选“力度通道”可隐藏。']],
 slow=('慢速录音、逐帧与标记', [
  ('p', '难弹的段落放慢来配乐更轻松。音符按 <b>视频时间</b> 保存，所以用半速弹奏的录音在正常速度下依然完全对齐。'),
  ('table', ['操作', '作用'], [
    ['速度 1× ¾ ½ ¼', '演奏与录音时的播放速度（位于播放器下方；录音中锁定）。'],
    ['◀ ▶ 按钮 · 逗号 , 与句号 . 键', '逐帧后退 / 前进（Shift = 10 帧）。帧率会自动检测。未选中音符时，← → 同样逐帧移动。'],
    ['旗帜按钮 · M', '在播放头处放置标记；在同一位置再按一次则删除。标记会显示在时间轴和音符编辑器中，音符可吸附到标记，并会导出到 MIDI。'],
    ['[ 与 ]', '跳到上一个 / 下一个标记。'],
    ['时间轴上的旗帜', '单击跳转 · 双击重命名 · Shift 单击删除。']]),
  ('note', '延迟补偿按真实时间计算，因此在慢速下依然准确。')]),
 sampler=('采样器：把任意声音变成乐器', [
  ('p', '乐器面板中的 <b>采样器</b> 标签页，可让脚步声、关门声或你自己的声音用键盘弹奏出来。'),
  ('img', 'sampler-zh.png', '已载入声音的采样器标签页。'),
  ('ul', ['<b>添加音频文件</b>（WAV、MP3、M4A、OGG …）、<b>麦克风录音</b>（最长 30 秒；浏览器会请求权限）或 <b>提取视频音频</b>（已加载视频的音轨）。',
   '选中采样后会显示波形。拖动橙色手柄可裁剪起点和终点。',
   '<b>原始音高</b> 是原样播放该采样的琴键，其他琴键会更高或更低。一次性音效请选择 <i>不变调</i>。<b>按住时循环</b> 会持续播放裁剪区间。',
   '起音、释音、音色明暗、混响和电平可调整效果。采样器音色与其他音色用法相同：用它录音，每个图层都会记住自己的采样。',
   '采样保存在你的浏览器中，所有项目共用。备份 (ZIP) 会包含项目所用的采样。'])]),
 export=('导出音频与 MIDI', [
  ('img', 'export-zh.png', '导出对话框。'),
  ('ul', ['点击右上角的 <b>导出</b>。<b>导出混音 (WAV)</b> 会把所有可听图层（遵循静音/独奏与音量）渲染为 16 位立体声 WAV，采样率 44.1 或 48 kHz。',
   '<b>响度</b>：<i>关闭</i> 保持演奏时的电平；<i>峰值 −1 dBFS</i> 把最大峰值提到 −1 dBFS；<i>目标响度</i> 会测量整体响度（LUFS，ITU-R BS.1770）并调整到你设定的目标——流媒体 −14、播客 −16、广播 −23——同时用限幅器让峰值不超过 −1 dBFS。导出后会显示测量结果。',
   '<b>分轨 (ZIP)</b> 把每个图层按原始电平导出为单独的 WAV。图层的 <b>⋯</b> 菜单可只导出该图层的 WAV 或 MIDI。',
   '<b>导出 MIDI (.mid)</b> 把每个图层写成一条音轨（时间与视频 1:1 对应），并附带你的标记，可在任何 DAW 中使用。',
   '音量控件旁的电平表显示主输出；点击可重置峰值。信号达到 0 dBFS 时会变红。',
   '要与画面合成，请在任意视频编辑软件的时间轴上放入 WAV 和原视频，二者都从 0:00 开始。'])]),
 backup=('备份、MIDI 导入、离线使用与触屏', [
  ('ul', ['<b>项目 → 导出备份 (ZIP)</b> 把项目、视频和采样打包成一个文件。<b>从备份恢复</b>（在该对话框中，或在项目列表的 <i>导入备份 / 文件</i>）会据此创建新项目——适合换电脑或留作安全副本。每张项目卡片上也有 <b>备份</b> 按钮。',
   '<b>项目 → 导入 .mid</b> 会把 MIDI 文件的各音轨作为新图层加入，使用当前乐器（标记也会一并导入）。',
   '<b>安装为应用：</b>在 Chrome / Edge 的地址栏点击安装图标，或在平板上选择“添加到主屏幕”。联网访问一次后，也可以离线使用。',
   '<b>触屏：</b>屏幕琴键支持多指同时按下和在琴键间滑动；触摸琴键越靠下，声音越响。在窄屏上显示三个八度，并有 ‹ › 按钮移动范围。',
   '右上角的键盘图标会列出所有快捷键（或按 <b>?</b>）。'])]),
 keys=[['Space', '播放 / 暂停'], ['Esc', '停止（或停止录音）'], ['Home', '回到开头'], [', 与 .', '逐帧移动（Shift：10 帧）'], ['M', '添加 / 删除标记'], ['[ 与 ]', '上一个 / 下一个标记'],
  ['Z / X', '降 / 升八度'], ['A W S E D F T G Y H U J K O L P ;', '用电脑键盘弹奏'], ['Ctrl/Cmd + C · V · D · A', '复制 · 粘贴 · 重复 · 全选音符'],
  ['Delete', '删除所选音符'], ['← → ↑ ↓', '微调所选音符（未选中时 ← → 逐帧移动）'], ['Ctrl/Cmd + Z', '撤销（Shift：重做）'], ['?', '显示快捷键列表']],
 proj_extra='编辑器 <b>项目</b> 对话框（或每张项目卡片）里的 <b>备份 (ZIP)</b> 会连同视频和采样一起保存项目。'),
'ja': dict(
 rec_rows=[['再生速度', '録音中の再生速度: 1×、¾、½、¼（次の章を参照）。'],
  ['録音の開始位置', '<b>先頭</b> は先に0:00へ戻ります。<b>現在位置</b> は再生ヘッドの位置から始めます。'],
  ['カウントイン', '映像が始まる前のカウントダウン（ビープ付き）。オフ / 1 / 2 / 3 / 5 秒。']],
 rec_note='<b>レイテンシ補正</b> と <b>録音中に既存レイヤーを聞く</b> は <b>設定</b>（右上のスライダーのアイコン）にあります。',
 roll_rows=[['コピー / ペースト / 複製', 'Ctrl/Cmd + C で選択ノートをコピー、Ctrl/Cmd + V で再生ヘッドの位置にペースト、Ctrl/Cmd + D で選択範囲の直後に複製、Ctrl/Cmd + A で全選択。ロール下のボタンでも操作できます。'],
  ['選択ノートの移調', '−12 −1 +1 +12 のボタンで、選択ノートをオクターブ / 半音単位で動かします。'],
  ['ベロシティレーン', 'ロール下の帯に、各ノートのベロシティが棒で表示されます。棒を上下にドラッグ（選択中のノートは一緒に変わります）、または何もない場所を横になぞると連続して描けます。「ベロシティレーン」のチェックを外すと隠せます。']],
 slow=('スロー録音・コマ送り・マーカー', [
  ('p', '難しい場面はゆっくり再生して音を付けると楽です。ノートは <b>映像の時間</b> で保存されるので、半分の速さで弾いたテイクも通常速度できっちり合います。'),
  ('table', ['操作', '内容'], [
    ['速度 1× ¾ ½ ¼', '演奏・録音時の再生速度（プレーヤーの下。録音中は変更不可）。'],
    ['◀ ▶ ボタン · , と . キー', '1フレーム戻る / 進む（Shiftで10フレーム）。フレームレートは自動検出。ノート未選択のときは ← → でも同じ操作ができます。'],
    ['旗ボタン · M', '再生ヘッドの位置にマーカーを置きます。同じ位置でもう一度押すと削除。マーカーはタイムラインとノートエディタに表示され、ノートが吸着し、MIDIにも書き出されます。'],
    ['[ と ]', '前 / 次のマーカーへジャンプ。'],
    ['タイムライン上の旗', 'クリックでジャンプ · ダブルクリックで名前変更 · Shift+クリックで削除。']]),
  ('note', 'レイテンシ補正は実時間で効くので、スロー再生でも正しく働きます。')]),
 sampler=('サンプラー: どんな音も楽器に', [
  ('p', '楽器パネルの <b>サンプラー</b> タブで、足音やドアの音、自分の声などを鍵盤で演奏できるようになります。'),
  ('img', 'sampler-ja.png', '音を読み込んだサンプラータブ。'),
  ('ul', ['<b>音声ファイルを追加</b>（WAV、MP3、M4A、OGG など）、<b>マイクで録音</b>（最長30秒。ブラウザが許可を求めます）、<b>映像の音声から</b>（読み込み済み映像のサウンドトラック）。',
   'サンプルを選ぶと波形が表示されます。オレンジのハンドルをドラッグして開始・終了位置をトリミングできます。',
   '<b>元の音程</b> はサンプルがそのまま鳴る鍵で、他の鍵は高く / 低く鳴ります。単発の効果音には <i>音程を変えない</i> を選びます。<b>押している間ループ</b> はトリミングした範囲を持続させます。',
   'アタック、リリース、トーン、リバーブ、レベルで音を整えます。サンプラーの音も他の音色と同じ使い方で、録音すると各レイヤーが自分のサンプルを覚えています。',
   'サンプルはブラウザに保存され、全プロジェクトで共有されます。バックアップ (ZIP) にはプロジェクトが使うサンプルも含まれます。'])]),
 export=('音声とMIDIの書き出し', [
  ('img', 'export-ja.png', '書き出しダイアログ。'),
  ('ul', ['右上の <b>書き出し</b> を押します。<b>ミックスを書き出し (WAV)</b> は、聞こえている全レイヤー（ミュート/ソロと音量を反映）を16bitステレオWAV（44.1 / 48 kHz）にします。',
   '<b>ラウドネス</b>: <i>オフ</i> は演奏のままの音量、<i>ピーク −1 dBFS</i> は最大ピークを −1 dBFS に揃え、<i>ラウドネス目標</i> は統合ラウドネス（LUFS、ITU-R BS.1770）を測って目標値に合わせます（配信 −14、ポッドキャスト −16、放送 −23）。リミッターがピークを −1 dBFS 以下に抑えます。書き出し後に測定結果が表示されます。',
   '<b>ステム (ZIP)</b> は各レイヤーを元の音量のまま個別のWAVにします。レイヤーの <b>⋯</b> メニューから、そのレイヤーだけをWAV / MIDIで書き出すこともできます。',
   '<b>MIDIを書き出し (.mid)</b> は、全レイヤーを1トラックずつ（時間は映像と1:1）マーカー付きで書き出します。どのDAWでも使えます。',
   '音量つまみの横のレベルメーターはマスター出力を表します。クリックでピークをリセット。0 dBFS に達すると赤くなります。',
   '映像と合わせるには、動画編集ソフトのタイムラインにWAVと元の映像を、どちらも0:00から置きます。'])]),
 backup=('バックアップ・MIDI読み込み・オフライン・タッチ操作', [
  ('ul', ['<b>プロジェクト → バックアップを書き出し (ZIP)</b> は、プロジェクト・映像・サンプルを1つのファイルにまとめます。<b>バックアップから復元</b>（このダイアログ、または一覧の <i>バックアップ / ファイルを読み込む</i>）で新しいプロジェクトとして作られます。別のPCへの移動や安全なコピーに便利です。各プロジェクトカードにも <b>バックアップ</b> ボタンがあります。',
   '<b>プロジェクト → .mid を読み込む</b> は、MIDIファイルのトラックを現在の楽器で新しいレイヤーとして追加します（マーカーも取り込み）。',
   '<b>アプリとしてインストール:</b> Chrome / Edge のアドレスバーのインストールアイコン、またはタブレットの「ホーム画面に追加」を使います。一度オンラインで開けば、オフラインでも動きます。',
   '<b>タッチ画面:</b> 画面の鍵盤は複数の指での同時押しや、鍵の間のスライドに対応します。鍵の下側を触るほど強く鳴ります。狭い画面では3オクターブ表示で、‹ › ボタンで移動します。',
   '右上のキーボードのアイコンでショートカット一覧を表示できます（<b>?</b> キーでも可）。'])]),
 keys=[['Space', '再生 / 一時停止'], ['Esc', '停止（録音の停止）'], ['Home', '先頭へ'], [', と .', '1フレーム送り / 戻し（Shiftで10フレーム）'], ['M', 'マーカーの追加 / 削除'], ['[ と ]', '前 / 次のマーカーへ'],
  ['Z / X', 'オクターブ下げ / 上げ'], ['A W S E D F T G Y H U J K O L P ;', 'PCキーボードで演奏'], ['Ctrl/Cmd + C · V · D · A', 'ノートのコピー · ペースト · 複製 · 全選択'],
  ['Delete', '選択ノートを削除'], ['← → ↑ ↓', '選択ノートを微調整（未選択のとき ← → はコマ送り）'], ['Ctrl/Cmd + Z', '元に戻す（Shiftでやり直し）'], ['?', 'ショートカット一覧を表示']],
 proj_extra='エディタの <b>プロジェクト</b> ダイアログ（または各プロジェクトカード）の <b>バックアップ (ZIP)</b> は、映像とサンプルも含めて保存します。'),
}

def patch(CONTENT):
    for lang, c in CONTENT.items():
        x = X[lang]; S = c['sections']
        def strip(title): return re.sub(r'^\d+\.\s*', '', title)
        # base order: 0 what,1 quick,2 projects,3 midi,4 sounds,5 record,6 roll,7 sync,8 export,9 keys,10 trouble,11 notes
        # recording table
        for i, b in enumerate(S[5][1]):
            if b[0] == 'table': S[5][1][i] = ('table', b[1], x['rec_rows']); S[5][1].insert(i + 1, ('note', x['rec_note'])); break
        for b in S[6][1]:
            if b[0] == 'table': b[2].extend(x['roll_rows']); break
        S[2][1].append(('ul', [x['proj_extra']]))
        keys_tbl = ('table', S[9][1][0][1], x['keys'])
        new = [S[0], S[1], S[2], S[3], S[4], S[5], S[6], x['slow'], x['sampler'], S[7], x['export'], x['backup'], (S[9][0], [keys_tbl]), S[10], S[11]]
        c['sections'] = [(f'{n}. {strip(s[0])}', s[1]) for n, s in enumerate(new, 1)]
        c['ver'] = c['ver'].replace('1.0', '2.0')
