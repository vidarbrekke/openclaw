#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  openclaw-download-job-status.sh --job-id ID [--tail N]
  openclaw-download-job-status.sh --job-dir /tmp/openclaw/jobs/<id> [--tail N]

Output (key=value lines):
  STATUS=running|succeeded|failed|unknown
  JOB_ID=<id>
  PID=<pid or empty>
  EXIT_CODE=<code or empty>
  OUT=<output path or empty>
  SIZE_BYTES=<n or empty>
  LOG=<log path>
  LOG_TAIL<<EOF ... EOF
EOF
}

JOB_ID=""
JOB_DIR=""
TAIL_N="20"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job-id) JOB_ID="${2:-}"; shift 2 ;;
    --job-dir) JOB_DIR="${2:-}"; shift 2 ;;
    --tail) TAIL_N="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$JOB_ID" && -z "$JOB_DIR" ]]; then
  echo "Missing --job-id or --job-dir" >&2
  usage
  exit 2
fi

if [[ -n "$JOB_ID" && -z "$JOB_DIR" ]]; then
  JOB_DIR="/tmp/openclaw/jobs/$JOB_ID"
fi
if [[ -z "$JOB_ID" ]]; then
  JOB_ID="$(basename "$JOB_DIR")"
fi

META="$JOB_DIR/meta.env"
LOG="$JOB_DIR/job.log"
PID_FILE="$JOB_DIR/pid"
EXIT_FILE="$JOB_DIR/exit.code"

OUT=""
if [[ -f "$META" ]]; then
  # shellcheck disable=SC1090
  source "$META"
fi

PID=""
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" || true)"
fi

EXIT_CODE=""
if [[ -f "$EXIT_FILE" ]]; then
  EXIT_CODE="$(cat "$EXIT_FILE" || true)"
fi

STATUS="unknown"
if [[ -n "$EXIT_CODE" ]]; then
  if [[ "$EXIT_CODE" == "0" ]]; then
    STATUS="succeeded"
  else
    STATUS="failed"
  fi
elif [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
  STATUS="running"
fi

SIZE_BYTES=""
if [[ -n "${OUT:-}" && -f "$OUT" ]]; then
  SIZE_BYTES="$(wc -c < "$OUT" 2>/dev/null || echo "")"
fi

echo "STATUS=$STATUS"
echo "JOB_ID=$JOB_ID"
echo "PID=$PID"
echo "EXIT_CODE=$EXIT_CODE"
echo "OUT=${OUT:-}"
echo "SIZE_BYTES=$SIZE_BYTES"
echo "LOG=$LOG"
echo "LOG_TAIL<<EOF"
if [[ -f "$LOG" ]]; then
  tail -n "$TAIL_N" "$LOG" || true
else
  echo "(log file not found)"
fi
echo "EOF"
