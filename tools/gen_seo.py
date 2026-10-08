#!/usr/bin/env python3
"""Generates the static SEO pages: /ja/ /zh/ landing pages and the guide in 3 languages (+ sitemap.xml).
Run from the repo root: python3 tools/gen_seo.py"""
import json, os, html
BASE = 'https://midimovie.aualrxse.com/'
L = {
 'en': dict(code='en', dir='', guide='guide/score-video-with-midi-keyboard.html', label='English', app='Open MidiMovie',
  title='MidiMovie – Score videos with a MIDI keyboard in your browser',
  desc='Free browser tool: play a MIDI keyboard along to a video, record layered takes and export WAV, MIDI or MP4. No install, no account.',
  h1='Score a video with your MIDI keyboard — in your browser',
  lead='MidiMovie lets you play along to a video, record layered takes in sync, edit them in a piano roll and export the result as WAV, MIDI or MP4. It runs entirely in your browser: no install, no account, and your videos never leave your device.',
  featT='What you can do', feats=['Play along to any video with a MIDI keyboard, your computer keyboard or touch keys','Record layered takes; slow-motion recording and frame stepping keep tricky scenes in sync','Piano-roll editing, 70+ preset sounds and a sampler for your own sounds','Convert a recording or hummed melody to MIDI notes','Export WAV, MIDI, stems or a finished MP4 with your new music'],
  priceT='Free and Pro', price='Free: everything you need to record and edit, WAV and MIDI export, up to 2 layers. Pro (one-time purchase, no subscription): sampler, audio → MIDI, MP4 export, stems export and unlimited layers.',
  gl='Read the guide: how to score a video with a MIDI keyboard', open='Open the app',
  guideTitle='How to score a video with a MIDI keyboard in your browser – MidiMovie',
  guideDesc='Step-by-step: add music to a video by playing a MIDI keyboard along to it. Record layered takes and export WAV or MP4 for free in your browser.',
  gh1='How to score a video with a MIDI keyboard in your browser',
  glead='This guide shows how to add original music to a video by playing it live. You need a computer with Chrome or Edge, a video file, and a MIDI keyboard (your computer keyboard works too).',
  steps=[('Open MidiMovie and create a project','Open the app and press "New project". Everything is saved automatically in your browser.'),('Load your video','Drop a video file onto the stage. It stays on your device and is never uploaded.'),('Connect your MIDI keyboard','Press "Connect MIDI" and allow access in the browser. No keyboard? Turn on the computer keyboard (A–K keys) or use the on-screen keys.'),('Choose a sound','Pick a preset in Simple mode, or build your own in Pro mode. Pro also adds a sampler for your own recordings.'),('Record a take','Press the red button and play along to the picture. Use slow playback (¾, ½, ¼) for fast passages and add markers at key moments.'),('Layer and edit','Keep the take, then record more layers on top. Fix notes in the piano roll: move, resize, transpose or change velocity.'),('Export','Export the mix as WAV or the notes as a MIDI file for free. Export the finished video with your music as MP4 with Pro.')],
  faqT='FAQ', faq=[('Do I need to install anything?','No. MidiMovie runs in the browser. Chrome or Edge is recommended because of their MIDI support.'),('Is it free?','Yes for recording, editing, and WAV and MIDI export with up to 2 layers. Pro is a one-time purchase that unlocks the sampler, audio → MIDI, MP4 export, stems and unlimited layers.'),('Are my videos uploaded anywhere?','No. Videos and projects stay in your browser on your device.'),('Which MIDI keyboards work?','Any class-compliant USB MIDI keyboard that your browser can see. You can also play with the computer keyboard.')]),
 'ja': dict(code='ja', dir='ja/', guide='ja/guide.html', label='日本語', app='MidiMovie を開く',
  title='MidiMovie – MIDIキーボードで映像に音楽をつける無料ブラウザツール',
  desc='映像に合わせてMIDIキーボードを演奏し、重ね録りしてWAV・MIDI・MP4で書き出せる無料のブラウザツール。インストール・アカウント不要。',
  h1='MIDIキーボードで映像に音楽をつける — ブラウザだけで',
  lead='MidiMovie は、映像を見ながらMIDIキーボードを演奏して録音し、重ね録りやピアノロール編集をして、WAV・MIDI・MP4で書き出せるブラウザツールです。インストールもアカウントも不要で、映像は端末の外に出ません。',
  featT='できること', feats=['MIDIキーボード・PCキーボード・画面の鍵盤で、好きな映像に合わせて演奏','重ね録り。スロー録音とコマ送りで、難しい場面にも合わせやすい','ピアノロール編集、70種以上のプリセット音色、自分の音を使えるサンプラー','歌や鼻歌の録音をMIDIノートに変換','WAV・MIDI・ステム、そして新しい音楽をつけたMP4を書き出し'],
  priceT='無料版とPro版', price='無料：録音と編集、WAV・MIDIの書き出し、2レイヤーまで。Pro（買い切り・サブスクなし）：サンプラー、音声→MIDI、MP4書き出し、ステム書き出し、レイヤー無制限。',
  gl='ガイド：MIDIキーボードで映像に音楽をつける方法', open='アプリを開く',
  guideTitle='MIDIキーボードで映像に音楽をつける方法（ブラウザだけ）– MidiMovie',
  guideDesc='映像に合わせてMIDIキーボードを演奏して音楽をつける手順。重ね録りしてWAVやMP4を、ブラウザだけで無料で書き出せます。',
  gh1='MIDIキーボードで映像に音楽をつける方法',
  glead='映像を見ながら生演奏して、オリジナルの音楽をつける手順です。必要なのは、ChromeかEdgeが使えるパソコン、映像ファイル、MIDIキーボード（PCキーボードでも可）です。',
  steps=[('MidiMovie を開いてプロジェクトを作る','アプリを開いて「新規プロジェクト」を押します。内容はブラウザに自動保存されます。'),('映像を読み込む','映像ファイルをステージにドロップします。映像は端末の中にだけあり、アップロードされません。'),('MIDIキーボードをつなぐ','「MIDIを接続」を押して、ブラウザの許可を出します。キーボードがなければ、PCキーボード（A〜Kキー）や画面の鍵盤が使えます。'),('音色を選ぶ','シンプルモードでプリセットを選ぶか、プロモードで自分で作ります。Proなら、自分の録音を使うサンプラーも使えます。'),('テイクを録音する','赤いボタンを押して、映像に合わせて演奏します。速い場面はスロー再生（¾・½・¼）で、決めどころにはマーカーを置きます。'),('重ねて編集する','テイクを採用して、さらにレイヤーを重ねます。ピアノロールで、音の位置・長さ・音程・強さを直せます。'),('書き出す','ミックスのWAV、MIDIファイルは無料で書き出せます。音楽をつけた映像をMP4で書き出すのはProです。')],
  faqT='よくある質問', faq=[('インストールは必要ですか？','不要です。ブラウザで動きます。MIDI対応のため、ChromeかEdgeを推奨します。'),('無料で使えますか？','録音、編集、WAV・MIDIの書き出し（2レイヤーまで）は無料です。Proは買い切りで、サンプラー、音声→MIDI、MP4書き出し、ステム、レイヤー無制限が使えます。'),('映像はどこかにアップロードされますか？','されません。映像もプロジェクトも、あなたの端末のブラウザ内に保存されます。'),('どのMIDIキーボードが使えますか？','ブラウザが認識できるUSB MIDIキーボードなら使えます。PCキーボードでも演奏できます。')]),
 'zh': dict(code='zh', dir='zh/', guide='zh/guide.html', label='中文', app='打开 MidiMovie',
  title='MidiMovie – 在浏览器里用 MIDI 键盘为视频配乐（免费）',
  desc='免费浏览器工具：用 MIDI 键盘配合视频演奏，叠加录音并导出 WAV、MIDI 或 MP4。无需安装、无需账号。',
  h1='在浏览器里用 MIDI 键盘为视频配乐',
  lead='MidiMovie 让你一边看视频一边用 MIDI 键盘演奏并录音，叠加多层、在钢琴卷帘里编辑，最后导出 WAV、MIDI 或 MP4。完全在浏览器中运行，无需安装、无需账号，视频不会离开你的设备。',
  featT='你可以做什么', feats=['用 MIDI 键盘、电脑键盘或屏幕键盘，配合任意视频演奏','叠加多层录音；慢速录音和逐帧移动让复杂画面也能对上','钢琴卷帘编辑、70 多种预设音色，以及可使用自己声音的采样器','把人声或哼唱的录音转换成 MIDI 音符','导出 WAV、MIDI、分轨，或配上新音乐的 MP4'],
  priceT='免费版与 Pro 版', price='免费：录音与编辑、导出 WAV 和 MIDI，最多 2 个图层。Pro（一次性购买，无订阅）：采样器、音频→MIDI、MP4 导出、分轨导出、不限图层。',
  gl='指南：如何用 MIDI 键盘为视频配乐', open='打开应用',
  guideTitle='如何在浏览器里用 MIDI 键盘为视频配乐 – MidiMovie',
  guideDesc='分步指南：配合视频演奏 MIDI 键盘来为视频配乐，叠加录音，并免费在浏览器中导出 WAV 或 MP4。',
  gh1='如何在浏览器里用 MIDI 键盘为视频配乐',
  glead='本指南介绍如何一边看视频一边现场演奏，为视频加上原创音乐。你需要一台能用 Chrome 或 Edge 的电脑、一个视频文件和一个 MIDI 键盘（电脑键盘也可以）。',
  steps=[('打开 MidiMovie 并新建项目','打开应用，点击“新建项目”。内容会自动保存在浏览器中。'),('载入视频','把视频文件拖到舞台上。视频只在你的设备里，不会被上传。'),('连接 MIDI 键盘','点击“连接 MIDI”，并在浏览器中允许访问。没有键盘？可以打开电脑键盘（A–K 键）或使用屏幕键盘。'),('选择音色','在简易模式中选择预设，或在专业模式中自己调制。Pro 版还有可使用自己录音的采样器。'),('录制一遍','点击红色按钮，配合画面演奏。快速段落可用慢速播放（¾、½、¼），关键位置可放置标记。'),('叠加与编辑','保留这一遍，再叠加更多图层。在钢琴卷帘里调整音符的位置、长度、音高和力度。'),('导出','免费导出混音 WAV 或 MIDI 文件。导出配好音乐的 MP4 视频需要 Pro 版。')],
  faqT='常见问题', faq=[('需要安装吗？','不需要，直接在浏览器里运行。因为 MIDI 支持，推荐使用 Chrome 或 Edge。'),('免费吗？','录音、编辑，以及最多 2 个图层的 WAV 和 MIDI 导出是免费的。Pro 为一次性购买，解锁采样器、音频→MIDI、MP4 导出、分轨导出和不限图层。'),('视频会被上传吗？','不会。视频和项目都保存在你设备的浏览器中。'),('哪些 MIDI 键盘可用？','浏览器能识别的 USB MIDI 键盘都可以。也可以直接用电脑键盘演奏。')]),
}
HREF = {'en': BASE, 'ja': BASE + 'ja/', 'zh': BASE + 'zh/'}
GHREF = {k: BASE + v['guide'] for k, v in L.items()}
e = html.escape
def alt(m):
    return ''.join(f'<link rel="alternate" hreflang="{k}" href="{m[k]}">' for k in ['en', 'ja', 'zh']) + f'<link rel="alternate" hreflang="x-default" href="{m["en"]}">'
def head(l, title, desc, url, m, extra=''):
    return f'''<!doctype html>
<html lang="{'zh-Hans' if l['code']=='zh' else l['code']}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title><meta name="description" content="{e(desc)}"><link rel="canonical" href="{url}">{alt(m)}
<meta property="og:type" content="website"><meta property="og:site_name" content="MidiMovie"><meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}"><meta property="og:url" content="{url}"><meta property="og:image" content="{BASE}icons/og.png"><meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0d0e11"><link rel="icon" href="{{R}}icons/icon-192.png"><link rel="stylesheet" href="{{R}}seo.css">{extra}</head><body>'''
def nav(l, here):
    sw = ' · '.join(f'<a href="{HREF[k]}" hreflang="{k}"{" aria-current=page" if k==l["code"] and here=="home" else ""}>{L[k]["label"]}</a>' for k in ['en', 'ja', 'zh'])
    return f'<header><a class="logo" href="{BASE}">MidiMovie</a><nav>{sw}</nav></header><main>'
def foot(l):
    return f'</main><footer><a href="{BASE}terms.html">Terms</a> · <a href="{BASE}privacy.html">Privacy</a> · <a href="{BASE}tokushoho.html">特定商取引法</a></footer></body></html>'
def write(path, content, R):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    open(path, 'w', encoding='utf-8').write(content.replace('{R}', R))
urls = [BASE]
for k, l in L.items():
    R = '../' if l['dir'] else ''
    app = BASE
    if l['dir']:
        ld = {"@context": "https://schema.org", "@type": "WebApplication", "name": "MidiMovie", "url": HREF[k], "inLanguage": k, "applicationCategory": "MultimediaApplication", "operatingSystem": "Any (web browser)", "description": l['desc'], "offers": [{"@type": "Offer", "name": "Free", "price": "0", "priceCurrency": "USD"}, {"@type": "Offer", "name": "Pro", "price": "19", "priceCurrency": "USD"}]}
        body = head(l, l['title'], l['desc'], HREF[k], HREF, f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>') + nav(l, 'home')
        body += f'<h1>{e(l["h1"])}</h1><p class="lead">{e(l["lead"])}</p><p><a class="btn" href="{app}">{e(l["open"])}</a></p>'
        body += f'<h2>{e(l["featT"])}</h2><ul>{"".join(f"<li>{e(x)}</li>" for x in l["feats"])}</ul><h2>{e(l["priceT"])}</h2><p>{e(l["price"])}</p><p><a href="{BASE+l["guide"]}">{e(l["gl"])}</a></p>' + foot(l)
        write(l['dir'] + 'index.html', body, R); urls.append(HREF[k])
    # guide
    gR = '../' if k == 'en' else '../'
    ld = {"@context": "https://schema.org", "@type": "FAQPage", "inLanguage": k, "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in l['faq']]}
    g = head(l, l['guideTitle'], l['guideDesc'], BASE + l['guide'], GHREF, f'<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>') + nav(l, 'guide')
    g += f'<h1>{e(l["gh1"])}</h1><p class="lead">{e(l["glead"])}</p><ol>{"".join(f"<li><strong>{e(a)}</strong><br>{e(b)}</li>" for a, b in l["steps"])}</ol><p><a class="btn" href="{app}">{e(l["open"])}</a></p><h2>{e(l["faqT"])}</h2>{"".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in l["faq"])}' + foot(l)
    write(l['guide'], g, gR); urls.append(BASE + l['guide'])
urls += [BASE + x for x in ['terms.html', 'privacy.html', 'tokushoho.html', 'manual/MidiMovie-manual-en.pdf', 'manual/MidiMovie-manual-ja.pdf', 'manual/MidiMovie-manual-zh.pdf']]
open('sitemap.xml', 'w').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{u}</loc></url>\n' for u in urls) + '</urlset>\n')
print(len(urls), 'urls')
