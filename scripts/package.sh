#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/../tmt-bridge-lens-v10.zip"
cd "$ROOT"
rm -f "$OUT"
zip -r "$OUT" \
  manifest.json \
  src \
  assets \
  LICENSE \
  README.md \
  -x "*.DS_Store"
echo "Created $OUT"
