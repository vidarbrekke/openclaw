#!/usr/bin/env bash
# Run all enabled OpenClaw cron jobs now (manual trigger).
# Use this when the gateway is running on this machine. Token is read from ~/.openclaw/openclaw.json.
# Usage: ./scripts/run-pending-cron-jobs.sh [--timeout MS]

set -e
JOBS_JSON="${OPENCLAW_HOME:-$HOME/.openclaw}/cron/jobs.json"
TIMEOUT_MS=120000
[[ "${1:-}" == "--timeout" && -n "${2:-}" ]] && TIMEOUT_MS="$2"

if [[ ! -f "$JOBS_JSON" ]]; then
  echo "No cron jobs file at $JOBS_JSON"
  exit 1
fi

# Collect enabled job ids (requires jq)
ids=()
while IFS= read -r id; do
  [[ -n "$id" ]] && ids+=( "$id" )
done < <(jq -r '.jobs[] | select(.enabled == true) | .id' "$JOBS_JSON")

if [[ ${#ids[@]} -eq 0 ]]; then
  echo "No enabled cron jobs."
  exit 0
fi

for id in "${ids[@]}"; do
  name=$(jq -r --arg id "$id" '.jobs[] | select(.id == $id) | .name' "$JOBS_JSON")
  echo "--- Running: $name ($id) ---"
  if openclaw cron run "$id" --timeout "$TIMEOUT_MS" --expect-final; then
    echo "OK: $name"
  else
    echo "FAILED: $name (exit $?)"
  fi
  echo ""
done
echo "Done."
