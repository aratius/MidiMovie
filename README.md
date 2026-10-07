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
| `tools/build_manual.py` | 説明書PDFの生成スクリプト (Playwright) |

## 特長 / Features

- 映像を読み込み、再生しながらMIDIキーボード（またはPCキーボード）で録音。テイクは採用/破棄、レイヤーで重ね録り
- 音は「映像の時間」で保存し、オフラインレンダリングで書き出すので、映像がカクついてもズレない
- シンプル(プリセット56種・リファレンス音色含む) / プロ(生パラメータ)の2タブ
- ノートエディタ(ピアノロール)で録音後に位置・長さ・音程を調整
- WAV書き出し (ミックス / レイヤー別)
- EN / 中文 / 日本語 UI
- プロジェクトはブラウザのIndexedDBに自動保存（映像含む）。サーバー・DB不要。JSONで書き出し/読み込みも可能（映像は含まれません）

## ローカルで動かす / Run locally

ビルド不要。静的ファイルなので任意のHTTPサーバーで配信します（Web MIDI/IndexedDBのため `file://` ではなく http 推奨）。

```
python3 -m http.server 8000   # → http://localhost:8000/
```

Chrome / Edge / Opera 推奨 (Web MIDI対応)。
