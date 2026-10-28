#!/bin/bash
# Runs every SignalDesk test: server unit tests, database tests (PGlite), UI tests in headless
# Chrome, and a browser check that the page loads and every view opens without errors.
# usage: npm test     (needs Google Chrome for the UI and browser checks)
set -uo pipefail
cd "$(dirname "$0")/.."
failed=0
# The page loads the combined files, so build them from the current sources first.
node scripts/build.mjs >/dev/null || { echo "Build failed. Run: npm run bundle"; exit 1; }
if [ -t 1 ]; then green=$'\033[32m'; red=$'\033[31m'; plain=$'\033[0m'; else green=''; red=''; plain=''; fi
pass() { printf '  %s✓%s %s\n' "$green" "$plain" "$1"; }
fail() { printf '  %s✕%s %s\n%s\n' "$red" "$plain" "$1" "$2"; failed=1; }

echo "Code check"
out=$(npx --no-install eslint js api sw.js scripts 2>&1) && pass "eslint" || fail "eslint" "$(echo "$out" | tail -15)"

echo "Server"
for test in tests/unit/*.test.js; do
  out=$(node "$test" 2>&1) && pass "$(basename "$test")" || fail "$(basename "$test")" "$(echo "$out" | tail -15)"
done

echo "Database"
for test in tests/db/upgrade.test.mjs tests/db/queue.test.mjs; do
  out=$(node "$test" 2>&1) && pass "$(basename "$test")" || fail "$(basename "$test")" "$(echo "$out" | grep -v '^    at ' | tail -15)"
done

echo "Interface"
for test in tests/ui/ui*.js; do
  out=$(bash tests/ui/run.sh "$test" 2>&1)
  if [ -z "$out" ]; then fail "$(basename "$test")" "  No output. Is Chrome installed?"
  elif echo "$out" | grep -q 'data-err='; then fail "$(basename "$test")" "$(echo "$out" | grep 'data-err=' | head -5)"
  else pass "$(basename "$test")"; fi
done

echo "Browser"
for step in tests/browser/load.mjs tests/browser/controls.mjs tests/browser/composer.mjs tests/browser/beta.mjs tests/browser/network.mjs tests/browser/home.mjs tests/browser/tour.mjs tests/browser/media.mjs tests/browser/formats.mjs tests/browser/workflows.mjs tests/browser/csp.mjs tests/browser/a11y.mjs; do
  out=$(SHOTS="${TMPDIR:-/tmp}/" node tests/browser/cdp.mjs "$step" 2>&1 | grep -v 'offline in this test')
  if echo "$out" | grep -q '\[exception\]\|\[console.error\]'; then fail "$(basename "$step")" "$(echo "$out" | grep '\[exception\]\|\[console.error\]' | head -5)"
  else pass "$(basename "$step")"; fi
done

[ $failed -eq 0 ] && echo "All tests passed." || { echo "Some tests failed."; exit 1; }
