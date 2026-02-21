#!/usr/bin/env bash
# Scan only new or changed skills (by mtime vs last scan). Run from cron every minute.
# State: one file per skill in STATE_DIR; we rescan if skill dir is newer or state missing.
set -euo pipefail

SKILLS_DIR="${OPENCLAW_SKILLS_DIR:-/root/openclaw-stock-home/.openclaw/skills}"
STATE_DIR="${SKILL_SCANNER_STATE_DIR:-/root/openclaw-stock-home/.openclaw/var/skill-scanner-state}"
LOG_FILE="${SKILL_SCANNER_LOG:-/var/log/skill-scanner.log}"
SCANNER_CMD="${SKILL_SCANNER_CMD:-/opt/skill-scanner/venv/bin/skill-scanner}"
SCAN_OPTS="--use-behavioral --format summary"

mkdir -p "$STATE_DIR"
[ -d "$SKILLS_DIR" ] || exit 0

for dir in "$SKILLS_DIR"/*/ ; do
  [ -d "$dir" ] || continue
  skill=$(basename "$dir")
  state_file="$STATE_DIR/$skill"
  if [ ! -f "$state_file" ] || [ "$dir" -nt "$state_file" ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Scanning skill: $skill" >> "$LOG_FILE"
    if "$SCANNER_CMD" scan "$dir" $SCAN_OPTS >> "$LOG_FILE" 2>&1; then
      touch "$state_file"
    else
      echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Scan failed or had findings: $skill" >> "$LOG_FILE"
      touch "$state_file"
    fi
  fi
done
