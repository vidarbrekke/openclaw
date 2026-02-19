#!/bin/bash
# Cloud (Linode) version of clawd memory backup. Backs up OpenClaw config + workspace.
# Paths: /root/.openclaw. Output: /root/.openclaw-backups. No rclone by default.
set -euo pipefail

OPENCLAW_DIR="/root/.openclaw"
LOCAL_BACKUP_DIR="/root/.openclaw-backups"
LOG_FILE="$LOCAL_BACKUP_DIR/backup.log"
RETENTION_DAYS=7

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing dependency: $1"; exit 1; }
}
need_cmd tar
need_cmd mktemp
need_cmd date

log_message() {
  local message="$1"
  echo "$(date +"%Y-%m-%d %H:%M:%S") - $message" | tee -a "$LOG_FILE"
}

if [ ! -d "$LOCAL_BACKUP_DIR" ]; then
  mkdir -p "$LOCAL_BACKUP_DIR"
  log_message "Created local backup directory '$LOCAL_BACKUP_DIR'."
fi

BACKUP_DATE=$(date +"%Y-%m-%d_%H-%M-%S")
ARCHIVE_NAME="clawd_memory_backup_${BACKUP_DATE}.tar.gz"
FULL_ARCHIVE_PATH="$LOCAL_BACKUP_DIR/$ARCHIVE_NAME"
TEMP_DIR=$(mktemp -d)
LOCK_DIR="$LOCAL_BACKUP_DIR/.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  log_message "Another backup is already running (lock exists). Exiting."
  exit 0
fi
trap 'rm -rf "${TEMP_DIR:-}"; rmdir "${LOCK_DIR:-}" 2>/dev/null || true' EXIT
STAGING_DIR="$TEMP_DIR/clawd_backup_$BACKUP_DATE"

log_message "Preparing backup staging area..."
mkdir -p "$STAGING_DIR/openclaw_config"

# Restore notes
cat <<EOF > "$STAGING_DIR/RESTORE_NOTES.txt"
ClawBackup (cloud) restore notes. Restore openclaw_config/* to $OPENCLAW_DIR/
EOF

# Stage selected OpenClaw dir contents (exclude sessions, logs, credentials)
for item in openclaw.json round-robin-models.json adaptive-memory-digest-state.json; do
  [ -f "$OPENCLAW_DIR/$item" ] && cp "$OPENCLAW_DIR/$item" "$STAGING_DIR/openclaw_config/"
done
[ -d "$OPENCLAW_DIR/skills" ] && cp -R "$OPENCLAW_DIR/skills" "$STAGING_DIR/openclaw_config/"
[ -d "$OPENCLAW_DIR/workspace" ] && cp -R "$OPENCLAW_DIR/workspace" "$STAGING_DIR/openclaw_config/"
[ -d "$OPENCLAW_DIR/hooks" ] && cp -R "$OPENCLAW_DIR/hooks" "$STAGING_DIR/openclaw_config/"
[ -d "$OPENCLAW_DIR/memory" ] && cp -R "$OPENCLAW_DIR/memory" "$STAGING_DIR/openclaw_config/"
[ -f "$OPENCLAW_DIR/cron/jobs.json" ] && mkdir -p "$STAGING_DIR/openclaw_config/cron" && cp "$OPENCLAW_DIR/cron/jobs.json" "$STAGING_DIR/openclaw_config/cron/"
[ -d "$OPENCLAW_DIR/modules" ] && cp -R "$OPENCLAW_DIR/modules" "$STAGING_DIR/openclaw_config/" 2>/dev/null || true
log_message "Staged OpenClaw config and workspace."

# Manifest
MANIFEST="$STAGING_DIR/manifest.json"
cat > "$MANIFEST" <<EOF
{
  "createdAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "hostname": "$(hostname 2>/dev/null || echo "unknown")",
  "os": "$(uname -a 2>/dev/null || echo "unknown")",
  "openclawDir": "$OPENCLAW_DIR",
  "localBackupDir": "$LOCAL_BACKUP_DIR",
  "archiveName": "$ARCHIVE_NAME",
  "retentionDays": $RETENTION_DAYS,
  "uploadMode": "local-only"
}
EOF

log_message "Creating backup archive '$FULL_ARCHIVE_PATH'..."
tar -czf "$FULL_ARCHIVE_PATH" -C "$TEMP_DIR" "clawd_backup_$BACKUP_DATE"
log_message "Backup archive created successfully."

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$FULL_ARCHIVE_PATH" > "$FULL_ARCHIVE_PATH.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$FULL_ARCHIVE_PATH" > "$FULL_ARCHIVE_PATH.sha256"
fi

log_message "Applying retention policy ($RETENTION_DAYS days)..."
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'clawd_memory_backup_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | while read -r old_backup; do
  log_message "Deleted old local backup: '$old_backup'."
done
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'clawd_memory_backup_*.tar.gz.sha256' -mtime +"$RETENTION_DAYS" -print -delete | while read -r _; do true; done

log_message "Backup process completed successfully."
exit 0
