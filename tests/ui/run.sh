#!/bin/bash
# Runs one UI test file inside the real page in headless Chrome and prints its results.
# usage: tests/ui/run.sh tests/ui/ui4.js [hash]   Lines starting "data-err" are failures.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TEST="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
PAGE="$ROOT/_uitest.html"
trap 'rm -f "$PAGE"' EXIT
python3 -I -c "
import sys;s=open(sys.argv[1],encoding='utf-8').read();t=open(sys.argv[2],encoding='utf-8').read()
open(sys.argv[3],'w',encoding='utf-8').write(s.replace('<script src=\"js/app.js\"></script>','<script src=\"js/app.js\"></script><script>'+t+'</script>'))" "$ROOT/index.html" "$TEST" "$PAGE"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
"$CHROME" --headless=new --disable-gpu --allow-file-access-from-files --virtual-time-budget=10000 --window-size=1400,1000 --dump-dom "file://$PAGE#${2:-}" 2>/dev/null | tr '\n' ' ' | grep -o 'data-\(log\|err\)="[^"]*"' | sed 's/ || /\n/g; s/&quot;/"/g; s/&amp;/\&/g; s/&lt;/</g' || true
