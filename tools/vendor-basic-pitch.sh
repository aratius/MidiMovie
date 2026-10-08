#!/usr/bin/env bash
# Fetches Spotify's Basic Pitch (Apache-2.0) + TensorFlow.js from npm and bundles them into vendor/basic-pitch/
# so the site can transcribe chords without any server or CDN. Run once from anywhere (needs node + npm):
#   bash tools/vendor-basic-pitch.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/basic-pitch"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund @spotify/basic-pitch@1.0.1 @tensorflow/tfjs@4.22.0 esbuild@0.24.0
echo "export * from '@spotify/basic-pitch';" > entry.js
mkdir -p "$OUT/model"
npx esbuild entry.js --bundle --format=iife --global-name=BasicPitchLib --platform=browser --target=es2020 --minify --legal-comments=none --outfile="$OUT/basic-pitch.bundle.js"
cp node_modules/@spotify/basic-pitch/model/* "$OUT/model/"
cp node_modules/@spotify/basic-pitch/LICENSE "$OUT/LICENSE-basic-pitch.txt" 2>/dev/null || true
cp node_modules/@tensorflow/tfjs/LICENSE "$OUT/LICENSE-tfjs.txt" 2>/dev/null || true
echo; echo "Done. Files in $OUT:"; ls -lh "$OUT" "$OUT/model"
echo; echo "Next: git add vendor && git commit -m 'Vendor Basic Pitch' && git push"
