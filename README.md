# MidiMovie

MIDIキーボードで映像に合わせて演奏し、重ね録りして音声を書き出すブラウザツール。
Score a video with a MIDI keyboard — record layered takes in real time and export the audio.

**https://aratius.github.io/MidiMovie/**

## 構成 / Structure

| Path | 内容 |
|---|---|
| `index.html` | プロジェクト一覧 + 取扱説明書への導線 / Project list + manual links |
| `editor.html?p=<id>` | エディタ本体 / The editor |
| `manual/MidiMovie-manual-{en,zh,ja}.pdf` | 取扱説明書 (3言語) / User manual |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA (インストール / オフライン) |
| `tools/` | 説明書PDFとスクリーンショットの生成スクリプト (Playwright) |

## 特長 / Features

- 映像を読み込み、再生しながらMIDIキーボード（またはPCキーボード・タッチ鍵盤）で録音。テイクは採用/破棄、レイヤーで重ね録り
- 音は「映像の時間」で保存し、オフラインレンダリングで書き出すので、映像がカクついてもズレない
- スロー再生（¾ ½ ¼）で録音、コマ送り、マーカー
- シンプル(プリセット70種超・リファレンス音色含む) / プロ(生パラメータ) / サンプラー(音声ファイル・マイク・映像の音声。音程で弾く / 自動チョップして鍵ごとに割り当て)
- ノートエディタ(ピアノロール): 位置・長さ・音程、コピー/ペースト/複製、移調、ベロシティレーン
- 音声→MIDI(単音のメロディ): 歌・鼻歌・単音の楽器の録音を新しいレイヤーのノートに変換（YINピッチ検出、外部モデル不要）。和音は Basic Pitch を同梱して対応（`bash tools/vendor-basic-pitch.sh` を1回実行して `vendor/` をコミット）
- 書き出し: WAV(ミックス / ステムZIP)、ラウドネス(LUFS)調整、MIDI(.mid) 書き出し・読み込み
- プロジェクトはブラウザのIndexedDBに自動保存（映像含む）。サーバー・DB不要。映像・サンプル込みのZIPバックアップ/復元
- EN / 中文 / 日本語 UI

## ローカルで動かす / Run locally

ビルド不要。静的ファイルなので任意のHTTPサーバーで配信します（Web MIDI/IndexedDBのため `file://` ではなく http 推奨）。

```
python3 -m http.server 8000   # → http://localhost:8000/
```

Chrome / Edge / Opera 推奨 (Web MIDI対応)。
