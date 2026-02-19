#!/usr/bin/env bash
set -euo pipefail

MEMORY_DIR="/root/.openclaw/workspace/memory"
STATE_DIR="/root/.openclaw/var/ops-state"
LOG_DIR="/root/.openclaw/logs"
CONFIG="/root/.openclaw/openclaw.json"
COMBINED_REPORT="$MEMORY_DIR/ops-combined-report.md"
COOLDOWN_STATE="$STATE_DIR/cooldown-counters.json"
MAX_LOG_SIZE=5242880  # 5MB

mkdir -p "$MEMORY_DIR" "$STATE_DIR" "$LOG_DIR"

ts="$(date -u +"%Y-%m-%d %H:%M UTC")"

# --- Unit health ---
unit_state() { systemctl --user is-active "$1" 2>/dev/null || echo "inactive"; }
unit_last_line() { journalctl --user -u "$1" -n 1 --no-pager -o short-iso 2>/dev/null | tail -1 || echo "no logs"; }

GW_STATE=$(unit_state openclaw-gateway.service)
WEB_GUARD_STATE=$(unit_state openclaw-websearch-guard.timer)
INVARIANTS_STATE=$(unit_state openclaw-workspace-invariants.timer)
SCANNER_STATE=$(unit_state skill-scanner.timer)

# --- Workspace invariants (inline, replaces separate timer) ---
BASE="/root/.openclaw/workspace/telegram-isolated"
mkdir -p "$BASE"
[ ! -f "$BASE/MEMORY.md" ] && cat > "$BASE/MEMORY.md" <<'EOM'
# MEMORY.md - Telegram Isolated Workspace
Keep telegram-isolated specific context here.
EOM
[ ! -f "$BASE/USER.md" ] && cat > "$BASE/USER.md" <<'EOM'
# USER.md - Telegram Isolated Workspace
Isolated user context file.
EOM

# --- Cooldown counters (incremental) ---
JOURNAL_CURSOR_FILE="$STATE_DIR/journal-cursor"
JOURNAL_ARGS=("journalctl" "--user" "-u" "openclaw-gateway.service" "--no-pager" "-o" "short-iso")
if [ -f "$JOURNAL_CURSOR_FILE" ]; then
  JOURNAL_ARGS+=("--after-cursor=$(cat "$JOURNAL_CURSOR_FILE")")
else
  JOURNAL_ARGS+=("--since" "24 hours ago")
fi

NEW_LOGS=$("${JOURNAL_ARGS[@]}" 2>/dev/null || true)
NEW_CURSOR=$(journalctl --user -u openclaw-gateway.service -n 1 --show-cursor --no-pager -o short-iso 2>/dev/null | grep '^-- cursor:' | sed 's/^-- cursor: //' || true)
[ -n "$NEW_CURSOR" ] && echo "$NEW_CURSOR" > "$JOURNAL_CURSOR_FILE"

count_pattern() { echo "$NEW_LOGS" | grep -c "$1" 2>/dev/null || echo 0; }

TIMEOUT_NEW=$(count_pattern "embedded run timeout")
COOLDOWN_NEW=$(count_pattern "all in cooldown or unavailable")
LLM_TIMEOUT_NEW=$(count_pattern "LLM request timed out")
READ_NOPATH_NEW=$(count_pattern "read tool called without path")
KEY_LIMIT_NEW=$(count_pattern "Key limit exceeded")
RESTART_NEW=$(count_pattern "received SIGUSR1; restarting")

python3 - "$COOLDOWN_STATE" "$TIMEOUT_NEW" "$COOLDOWN_NEW" "$LLM_TIMEOUT_NEW" "$READ_NOPATH_NEW" "$KEY_LIMIT_NEW" "$RESTART_NEW" <<'PY'
import json, sys, time
from pathlib import Path

state_path = Path(sys.argv[1])
new = dict(zip(
    ["embedded_timeout","cooldown_unavailable","llm_timed_out","read_without_path","key_limit_exceeded","gateway_restart"],
    [int(x) for x in sys.argv[2:8]]
))

now = time.time()
cutoff = now - 86400

if state_path.exists():
    state = json.loads(state_path.read_text())
else:
    state = {"events": [], "rolling": {}}

for k, v in new.items():
    if v > 0:
        state["events"].append({"ts": now, "type": k, "count": v})

state["events"] = [e for e in state["events"] if e["ts"] > cutoff]

rolling = {}
for e in state["events"]:
    rolling[e["type"]] = rolling.get(e["type"], 0) + e["count"]
state["rolling"] = rolling
state["last_update"] = now

state_path.write_text(json.dumps(state, indent=2))
for k in ["embedded_timeout","cooldown_unavailable","llm_timed_out","read_without_path","key_limit_exceeded","gateway_restart"]:
    print(f"{k}={rolling.get(k, 0)}")
PY

# read rolling values back
ROLLING=$(python3 -c "
import json; from pathlib import Path
s=json.loads(Path('$COOLDOWN_STATE').read_text())
r=s.get('rolling',{})
for k in ['embedded_timeout','cooldown_unavailable','llm_timed_out','read_without_path','key_limit_exceeded','gateway_restart']:
    print(f'{k}={r.get(k,0)}')
")
eval "$ROLLING"

if [ "$cooldown_unavailable" -eq 0 ] && [ "$embedded_timeout" -eq 0 ]; then
  HEALTH_STATUS="Stable"
else
  HEALTH_STATUS="Degraded"
fi

# --- Log rotation ---
rotate_log() {
  local logfile="$1"
  if [ -f "$logfile" ] && [ "$(stat -c%s "$logfile" 2>/dev/null || stat -f%z "$logfile" 2>/dev/null || echo 0)" -gt "$MAX_LOG_SIZE" ]; then
    mv "$logfile" "${logfile}.old"
    touch "$logfile"
  fi
}
rotate_log /var/log/skill-scanner.log
rotate_log "$LOG_DIR/websearch-guard.log"

# --- Exec security posture ---
EXEC_SECURITY=$(python3 -c "
import json
j=json.load(open('$CONFIG'))
t=j.get('tools',{})
print('exec.security=' + str(t.get('exec',{}).get('security','unknown')))
print('elevated.enabled=' + str(t.get('elevated',{}).get('enabled','unknown')))
allow=t.get('elevated',{}).get('allowFrom',{}).get('webchat',['none'])
print('elevated.webchat_allow=' + str(allow))
")

# --- Write combined report ---
cat > "$COMBINED_REPORT" <<EOF
# Ops Combined Report ($ts)

## Service Health
- openclaw-gateway: $GW_STATE
- websearch-guard timer: $WEB_GUARD_STATE
- workspace-invariants: checked inline (ok)
- skill-scanner timer: $SCANNER_STATE

## Cooldown Health (rolling 24h)
- embedded_timeout: $embedded_timeout
- cooldown_unavailable: $cooldown_unavailable
- llm_timed_out: $llm_timed_out
- read_without_path: $read_without_path
- key_limit_exceeded: $key_limit_exceeded
- gateway_restart: $gateway_restart
- Overall: **$HEALTH_STATUS**

## Runtime Guards
- web_search cap: max 5 total, max 2 duplicate per session window
- read loop cap: max 2 identical path reads per run
- Enforcement: ExecStartPre on gateway start + periodic timer
- Guard log: $LOG_DIR/websearch-guard.log

## Exec Security Posture
$EXEC_SECURITY
- Note: exec.security=full and elevated.webchat_allow=["*"] gives broad server access from chat. Consider restricting if attack surface is a concern.

## Skill Scanner
- Timer: $SCANNER_STATE
- Schedule: daily 03:00 UTC
- Log: /var/log/skill-scanner.log
- Last run: $(unit_last_line skill-scanner.service)

## Log Rotation
- skill-scanner.log: rotated at ${MAX_LOG_SIZE} bytes
- websearch-guard.log: rotated at ${MAX_LOG_SIZE} bytes

EOF

echo "wrote $COMBINED_REPORT"
