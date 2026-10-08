#!/usr/bin/env bash
# Fetches Mediabunny (MPL-2.0, in-browser media muxing via WebCodecs) from npm and bundles it into vendor/mediabunny/
# so the site can export your video with the new music, without a server or a CDN. Needs node + npm. Run once:
#   bash tools/vendor-mediabunny.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/vendor/mediabunny"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cd "$TMP"
npm init -y >/dev/null
npm install --no-audit --no-fund mediabunny esbuild@0.24.0
echo "export * from 'mediabunny';" > entry.js
mkdir -p "$OUT"
npx esbuild entry.js --bundle --format=iife --global-name=MediabunnyLib --platform=browser --target=es2022 --minify --legal-comments=none --outfile="$OUT/mediabunny.bundle.js"
cp node_modules/mediabunny/LICENSE "$OUT/LICENSE-mediabunny.txt" 2>/dev/null || true
node -e "console.log('mediabunny version', require('./node_modules/mediabunny/package.json').version)"
echo; echo "Done:"; ls -lh "$OUT"
echo; echo "Next: git add vendor && git commit -m 'Vendor Mediabunny' && git push"
