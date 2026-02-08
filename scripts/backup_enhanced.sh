#!/bin/bash
set -e

PROJECT_DIR="/Users/vidarbrekke/clawd"
SOURCE_DIR="$PROJECT_DIR/memory"
OPENCLAW_DIR="/Users/vidarbrekke/.openclaw"
CURSORAPPS_CLAWD="/Users/vidarbrekke/Dev/CursorApps/clawd"
LOCAL_BACKUP_DIR="/Users/vidarbrekke/clawd/MoltBackups/Memory"
LOG_FILE="$LOCAL_BACKUP_DIR/backup.log"
RETENTION_DAYS=7
RCLONE_REMOTE="googleDrive:"
GDRIVE_DEST_DIR="MoltBackups/Memory/"

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
trap 'rm -rf "$TEMP_DIR"' EXIT
STAGING_DIR="$TEMP_DIR/clawd_backup_$BACKUP_DATE"

log_message "Preparing backup staging area..."
mkdir -p "$STAGING_DIR"

if [ -d "$SOURCE_DIR" ]; then
  cp -R "$SOURCE_DIR" "$STAGING_DIR/"
  log_message "Staged memory directory."
fi

MD_COUNT=$(find "$PROJECT_DIR" -maxdepth 1 -type f -name "*.md" 2>/dev/null | wc -l)
if [ "$MD_COUNT" -gt 0 ]; then
  mkdir -p "$STAGING_DIR/root_md_files"
  find "$PROJECT_DIR" -maxdepth 1 -type f -name "*.md" -exec cp {} "$STAGING_DIR/root_md_files/" \; 2>/dev/null
  log_message "Staged $MD_COUNT .md files from project root."
fi

if [ -d "$PROJECT_DIR/scripts" ]; then
  mkdir -p "$STAGING_DIR/clawd_scripts"
  cp -R "$PROJECT_DIR/scripts"/* "$STAGING_DIR/clawd_scripts/" 2>/dev/null || true
  log_message "Staged clawd/scripts."
fi

OPENCLAW_STAGE="$STAGING_DIR/openclaw_config"
mkdir -p "$OPENCLAW_STAGE"
if [ -d "$OPENCLAW_DIR" ]; then
  [ -f "$OPENCLAW_DIR/openclaw.json" ] && cp "$OPENCLAW_DIR/openclaw.json" "$OPENCLAW_STAGE/"
  [ -d "$OPENCLAW_DIR/skills" ] && cp -R "$OPENCLAW_DIR/skills" "$OPENCLAW_STAGE/"
  [ -d "$OPENCLAW_DIR/modules" ] && cp -R "$OPENCLAW_DIR/modules" "$OPENCLAW_STAGE/"
  [ -f "$OPENCLAW_DIR/round-robin-models.json" ] && cp "$OPENCLAW_DIR/round-robin-models.json" "$OPENCLAW_STAGE/"
  [ -d "$OPENCLAW_DIR/workspace" ] && cp -R "$OPENCLAW_DIR/workspace" "$OPENCLAW_STAGE/"
  [ -d "$OPENCLAW_DIR/workspace-local-ops" ] && cp -R "$OPENCLAW_DIR/workspace-local-ops" "$OPENCLAW_STAGE/"
  [ -f "$OPENCLAW_DIR/cron/jobs.json" ] && mkdir -p "$OPENCLAW_STAGE/cron" && cp "$OPENCLAW_DIR/cron/jobs.json" "$OPENCLAW_STAGE/cron/"
  log_message "Staged ~/.openclaw custom config."
fi

if [ -d "$CURSORAPPS_CLAWD" ]; then
  CLAWD_STAGE="$STAGING_DIR/cursorapps_clawd"
  mkdir -p "$CLAWD_STAGE"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --exclude='node_modules' --exclude='test-results' --exclude='.last-run.json' "$CURSORAPPS_CLAWD/" "$CLAWD_STAGE/"
  else
    cp -R "$CURSORAPPS_CLAWD"/* "$CLAWD_STAGE/" 2>/dev/null || true
    rm -rf "$CLAWD_STAGE/node_modules" "$CLAWD_STAGE/test-results" 2>/dev/null
  fi
  log_message "Staged Dev/CursorApps/clawd."
fi

log_message "Creating backup archive '$FULL_ARCHIVE_PATH'..."
tar -czf "$FULL_ARCHIVE_PATH" -C "$TEMP_DIR" "clawd_backup_$BACKUP_DATE"
log_message "Backup archive created successfully."

log_message "Starting rclone transfer to Google Drive..."
if [ -t 1 ]; then
  rclone copy "$FULL_ARCHIVE_PATH" "$RCLONE_REMOTE$GDRIVE_DEST_DIR" --progress
else
  rclone copy "$FULL_ARCHIVE_PATH" "$RCLONE_REMOTE$GDRIVE_DEST_DIR" --stats-one-line --stats 10s
fi
log_message "Backup successfully transferred to Google Drive."

log_message "Applying retention policy ($RETENTION_DAYS days)..."
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'clawd_memory_backup_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | while read -r old_backup; do
  log_message "Deleted old local backup: '$old_backup'."
done
log_message "Cleaning up remote backups older than $RETENTION_DAYS days..."
if [ -n "$RCLONE_REMOTE" ] && [ -n "$GDRIVE_DEST_DIR" ] && [ "$GDRIVE_DEST_DIR" != "/" ]; then
  rclone delete --min-age ${RETENTION_DAYS}d "$RCLONE_REMOTE$GDRIVE_DEST_DIR" 2>/dev/null || true
else
  log_message "Skipping remote cleanup: remote or dest not set or dest is root."
fi

log_message "Backup process completed successfully."
exit 0
