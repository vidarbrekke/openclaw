#!/usr/bin/env bash
# Upgrade cisco-ai-skill-scanner to latest. Run weekly from cron.
set -euo pipefail

PIP="${SKILL_SCANNER_PIP:-/opt/skill-scanner/venv/bin/pip}"
LOG_FILE="${SKILL_SCANNER_LOG:-/var/log/skill-scanner.log}"

if [ ! -x "$PIP" ]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] skill-scanner upgrade: venv not found at /opt/skill-scanner/venv" >> "$LOG_FILE"
  exit 1
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Upgrading cisco-ai-skill-scanner..." >> "$LOG_FILE"
"$PIP" install -U cisco-ai-skill-scanner >> "$LOG_FILE" 2>&1
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Upgrade complete." >> "$LOG_FILE"
