#!/usr/bin/env bash
# Test suite for cleanup-proxy-sessions.sh
# Run: bash skills/round-robin/cleanup-proxy-sessions.test.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT="$SCRIPT_DIR/cleanup-proxy-sessions.sh"
TMPDIR="$(mktemp -d)"
PASS=0
FAIL=0

trap 'rm -rf "$TMPDIR"' EXIT

# ── Helpers ──────────────────────────────────────────────────────────────────
green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    green "  PASS: $label"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    green "  PASS: $label"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label (expected to contain '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if ! echo "$haystack" | grep -qF "$needle"; then
    green "  PASS: $label"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $label (expected NOT to contain '$needle')"
    FAIL=$((FAIL + 1))
  fi
}

# ── Setup fixture data ───────────────────────────────────────────────────────
setup_fixtures() {
  local dir="$1"
  mkdir -p "$dir/agents/main/sessions"

  local now
  now=$(node -e "console.log(Date.now())")
  local stale=$((now - 14400000))  # 4h ago
  local recent=$((now - 600000))    # 10min ago

  # Create session files
  echo '{"type":"session"}' > "$dir/agents/main/sessions/stale-1.jsonl"
  echo '{"type":"session"}' > "$dir/agents/main/sessions/stale-2.jsonl"
  echo '{"type":"session"}' > "$dir/agents/main/sessions/recent.jsonl"
  echo '{"type":"session"}' > "$dir/agents/main/sessions/native.jsonl"

  # Create sessions.json with mix of stale proxy, recent proxy, and native sessions
  cat > "$dir/agents/main/sessions/sessions.json" <<ENDJSON
{
  "agent:main:proxy:stale-1": {
    "updatedAt": $stale,
    "sessionFile": "$dir/agents/main/sessions/stale-1.jsonl"
  },
  "agent:main:proxy:stale-2": {
    "updatedAt": $stale,
    "sessionFile": "$dir/agents/main/sessions/stale-2.jsonl"
  },
  "agent:main:proxy:recent": {
    "updatedAt": $recent,
    "sessionFile": "$dir/agents/main/sessions/recent.jsonl"
  },
  "agent:main:main": {
    "updatedAt": $stale,
    "sessionFile": "$dir/agents/main/sessions/native.jsonl"
  }
}
ENDJSON
}

# ── Test 1: Time-based dry run ───────────────────────────────────────────────
echo "Test 1: Time-based dry run (SMART=0)"
T1_DIR="$TMPDIR/t1"
setup_fixtures "$T1_DIR"

OUTPUT=$(OPENCLAW_DIR="$T1_DIR" DRY_RUN=1 STALE_MS=3600000 SMART=0 bash "$CLEANUP_SCRIPT" 2>&1)

assert_contains "identifies stale proxy session 1" "DELETE agent:main:proxy:stale-1" "$OUTPUT"
assert_contains "identifies stale proxy session 2" "DELETE agent:main:proxy:stale-2" "$OUTPUT"
assert_not_contains "skips recent proxy session" "agent:main:proxy:recent" "$OUTPUT"
assert_not_contains "skips native session" "agent:main:main" "$OUTPUT"

# Verify no files were actually renamed (dry run)
assert_eq "stale-1.jsonl still exists (dry run)" "true" "$([ -f "$T1_DIR/agents/main/sessions/stale-1.jsonl" ] && echo true || echo false)"
echo ""

# ── Test 2: Time-based actual run ────────────────────────────────────────────
echo "Test 2: Time-based actual run"
T2_DIR="$TMPDIR/t2"
setup_fixtures "$T2_DIR"

OUTPUT=$(OPENCLAW_DIR="$T2_DIR" DRY_RUN=0 STALE_MS=3600000 SMART=0 bash "$CLEANUP_SCRIPT" 2>&1)

assert_contains "reports deleted count" "deleted 2" "$OUTPUT"

# Verify stale files are renamed
assert_eq "stale-1.jsonl renamed" "false" "$([ -f "$T2_DIR/agents/main/sessions/stale-1.jsonl" ] && echo true || echo false)"
assert_eq "stale-2.jsonl renamed" "false" "$([ -f "$T2_DIR/agents/main/sessions/stale-2.jsonl" ] && echo true || echo false)"
assert_eq "recent.jsonl untouched" "true" "$([ -f "$T2_DIR/agents/main/sessions/recent.jsonl" ] && echo true || echo false)"
assert_eq "native.jsonl untouched" "true" "$([ -f "$T2_DIR/agents/main/sessions/native.jsonl" ] && echo true || echo false)"

# Verify sessions.json updated
REMAINING=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$T2_DIR/agents/main/sessions/sessions.json','utf8'))).join(','))")
assert_contains "sessions.json keeps recent proxy" "agent:main:proxy:recent" "$REMAINING"
assert_contains "sessions.json keeps native" "agent:main:main" "$REMAINING"
assert_not_contains "sessions.json removes stale-1" "stale-1" "$REMAINING"
assert_not_contains "sessions.json removes stale-2" "stale-2" "$REMAINING"
echo ""

# ── Test 3: No stale sessions ───────────────────────────────────────────────
echo "Test 3: No stale sessions (should exit cleanly)"
T3_DIR="$TMPDIR/t3"
setup_fixtures "$T3_DIR"

OUTPUT=$(OPENCLAW_DIR="$T3_DIR" DRY_RUN=1 STALE_MS=99999999999 SMART=0 bash "$CLEANUP_SCRIPT" 2>&1)

assert_eq "no output when nothing stale" "" "$OUTPUT"
echo ""

# ── Test 4: Missing sessions.json ────────────────────────────────────────────
echo "Test 4: Missing sessions.json (should exit cleanly)"
T4_DIR="$TMPDIR/t4"
mkdir -p "$T4_DIR"

EXIT_CODE=0
OPENCLAW_DIR="$T4_DIR" bash "$CLEANUP_SCRIPT" 2>&1 || EXIT_CODE=$?
assert_eq "exits 0 when sessions.json missing" "0" "$EXIT_CODE"
echo ""

# ── Test 5: Smart mode with Ollama unavailable ───────────────────────────────
echo "Test 5: Smart mode, Ollama unavailable (falls back to time-based or time-based)"
T5_DIR="$TMPDIR/t5"
setup_fixtures "$T5_DIR"

# Use a port where nothing is listening; script may set SMART=0 when model unavailable
OUTPUT=$(OPENCLAW_DIR="$T5_DIR" DRY_RUN=1 STALE_MS=3600000 SMART=1 OLLAMA_URL="http://127.0.0.1:19999" bash "$CLEANUP_SCRIPT" 2>&1)

# Either falls back (smart attempted, failed) or runs time-based (SMART forced to 0)
assert_contains "deletes stale sessions when Ollama down" "DELETE agent:main:proxy:stale-1" "$OUTPUT"
echo ""

# ── Test 6: ALL=1 mode, protected session preserved ──────────────────────────
echo "Test 6: ALL=1 cleans non-protected, keeps agent:main:main"
T6_DIR="$TMPDIR/t6"
setup_fixtures "$T6_DIR"

OUTPUT=$(OPENCLAW_DIR="$T6_DIR" DRY_RUN=1 STALE_MS=3600000 ALL=1 bash "$CLEANUP_SCRIPT" 2>&1)
assert_contains "deletes proxy sessions" "DELETE agent:main:proxy:stale-1" "$OUTPUT"
assert_not_contains "never deletes agent:main:main" "agent:main:main" "$OUTPUT"

# Actual run: verify agent:main:main remains in sessions.json
OPENCLAW_DIR="$T6_DIR" DRY_RUN=0 STALE_MS=3600000 ALL=1 bash "$CLEANUP_SCRIPT" 2>&1 >/dev/null
REMAINING=$(node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('$T6_DIR/agents/main/sessions/sessions.json','utf8'))).join(','))")
assert_contains "sessions.json keeps agent:main:main" "agent:main:main" "$REMAINING"
assert_contains "sessions.json keeps recent proxy" "agent:main:proxy:recent" "$REMAINING"
echo ""

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  green "All $PASS tests passed"
else
  red "$FAIL failed, $PASS passed"
  exit 1
fi
