#!/usr/bin/env bash
set -euo pipefail

# Start a long-running download in the background and return quickly.
# This avoids gateway/executor timeouts for large downloads.

usage() {
  cat <<'EOF'
Usage:
  openclaw-download-job.sh --url URL --output FILE_PATH [options]

Required:
  --url URL                  Download URL
  --output FILE_PATH         Output file path (e.g. /tmp/openclaw/downloads/file.zip)

Auth options (choose one):
  --cookie-header STRING     Full Cookie header value: "a=1; b=2"
  --cookie-file FILE_PATH    Netscape cookie jar file for curl (-b)

Optional:
  --user-agent STRING        User-Agent header (default: Mozilla/5.0)
  --job-name NAME            Prefix for job id (default: dl)
  --max-time SECONDS         curl --max-time value (default: 1800)
  --connect-timeout SECONDS  curl --connect-timeout value (default: 30)

Output:
  JOB_ID=<id>
  JOB_DIR=<path>
  LOG=<path>
  OUT=<path>
  PID=<pid>
EOF
}

URL=""
OUT=""
COOKIE_HEADER=""
COOKIE_FILE=""
USER_AGENT="Mozilla/5.0"
JOB_NAME="dl"
MAX_TIME="1800"
CONNECT_TIMEOUT="30"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="${2:-}"; shift 2 ;;
    --output) OUT="${2:-}"; shift 2 ;;
    --cookie-header) COOKIE_HEADER="${2:-}"; shift 2 ;;
    --cookie-file) COOKIE_FILE="${2:-}"; shift 2 ;;
    --user-agent) USER_AGENT="${2:-}"; shift 2 ;;
    --job-name) JOB_NAME="${2:-}"; shift 2 ;;
    --max-time) MAX_TIME="${2:-}"; shift 2 ;;
    --connect-timeout) CONNECT_TIMEOUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "$URL" || -z "$OUT" ]]; then
  echo "Missing required args --url and/or --output" >&2
  usage
  exit 2
fi

if [[ -n "$COOKIE_HEADER" && -n "$COOKIE_FILE" ]]; then
  echo "Use only one of --cookie-header or --cookie-file" >&2
  exit 2
fi

JOBS_DIR="/tmp/openclaw/jobs"
mkdir -p "$JOBS_DIR" "$(dirname "$OUT")"

TS="$(date +%s)"
RAND="${RANDOM}${RANDOM}"
JOB_ID="${JOB_NAME}-${TS}-${RAND}"
JOB_DIR="${JOBS_DIR}/${JOB_ID}"
LOG="${JOB_DIR}/job.log"
META="${JOB_DIR}/meta.env"
EXIT_FILE="${JOB_DIR}/exit.code"
PID_FILE="${JOB_DIR}/pid"

mkdir -p "$JOB_DIR"

{
  echo "JOB_ID=$JOB_ID"
  echo "URL='$URL'"
  echo "OUT='$OUT'"
  echo "LOG='$LOG'"
  echo "STARTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
} > "$META"

(
  set +e
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting download: $URL"
  CURL_ARGS=(
    -fL
    --retry 3
    --retry-all-errors
    --connect-timeout "$CONNECT_TIMEOUT"
    --max-time "$MAX_TIME"
    -H "User-Agent: $USER_AGENT"
    -o "$OUT"
    "$URL"
  )
  if [[ -n "$COOKIE_HEADER" ]]; then
    CURL_ARGS=(-H "Cookie: $COOKIE_HEADER" "${CURL_ARGS[@]}")
  elif [[ -n "$COOKIE_FILE" ]]; then
    CURL_ARGS=(-b "$COOKIE_FILE" "${CURL_ARGS[@]}")
  fi
  curl "${CURL_ARGS[@]}"
  CODE=$?
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] EXIT_CODE=$CODE"
  echo "$CODE" > "$EXIT_FILE"
  if [[ "$CODE" -eq 0 ]]; then
    SIZE=$(wc -c < "$OUT" 2>/dev/null || echo 0)
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] BYTES=$SIZE OUT=$OUT"
  fi
  exit "$CODE"
) >"$LOG" 2>&1 &

PID="$!"
echo "$PID" > "$PID_FILE"

echo "JOB_ID=$JOB_ID"
echo "JOB_DIR=$JOB_DIR"
echo "LOG=$LOG"
echo "OUT=$OUT"
echo "PID=$PID"
