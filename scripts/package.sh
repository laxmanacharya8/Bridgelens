#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/../tmt-bridge-lens-v10.zip"
cd "$ROOT"
rm -f "$OUT"
zip -r "$OUT" . \
  -x "*.DS_Store" \
  -x "*.env" \
  -x "node_modules/*" \
  -x "dist/*" \
  -x "*.zip"
echo "Created $OUT"
