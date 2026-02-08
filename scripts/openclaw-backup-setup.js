#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const home = os.homedir();
const defaults = {
  projectDir: path.join(home, "clawd"),
  openclawDir: path.join(home, ".openclaw"),
  cursorappsClawd: path.join(home, "Dev", "CursorApps", "clawd"),
  localBackupDir: path.join(home, "clawd", "MoltBackups", "Memory"),
  gdriveRemote: "googleDrive:",
  gdriveDest: "MoltBackups/Memory/",
  retentionDays: "7",
  schedule: os.platform() === "darwin" ? "launchd" : "cron"
};

function safeWrite(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function buildBackupScript(cfg) {
  return `#!/bin/bash
set -e

PROJECT_DIR="${cfg.projectDir}"
SOURCE_DIR="$PROJECT_DIR/memory"
OPENCLAW_DIR="${cfg.openclawDir}"
CURSORAPPS_CLAWD="${cfg.cursorappsClawd}"
LOCAL_BACKUP_DIR="${cfg.localBackupDir}"
LOG_FILE="$LOCAL_BACKUP_DIR/backup.log"
RETENTION_DAYS=${cfg.retentionDays}
RCLONE_REMOTE="${cfg.gdriveRemote}"
GDRIVE_DEST_DIR="${cfg.gdriveDest}"

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
  find "$PROJECT_DIR" -maxdepth 1 -type f -name "*.md" -exec cp {} "$STAGING_DIR/root_md_files/" \\; 2>/dev/null
  log_message "Staged $MD_COUNT .md files from project root."
fi

if [ -d "$PROJECT_DIR/scripts" ]; then
  mkdir -p "$STAGING_DIR/clawd_scripts"
  cp -R "$PROJECT_DIR/scripts"/* "$STAGING_DIR/clawd_scripts/" 2>/dev/null
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
    cp -R "$CURSORAPPS_CLAWD"/* "$CLAWD_STAGE/" 2>/dev/null
    rm -rf "$CLAWD_STAGE/node_modules" "$CLAWD_STAGE/test-results" 2>/dev/null
  fi
  log_message "Staged Dev/CursorApps/clawd."
fi

log_message "Creating backup archive '$FULL_ARCHIVE_PATH'..."
tar -czf "$FULL_ARCHIVE_PATH" -C "$TEMP_DIR" "clawd_backup_$BACKUP_DATE"
rm -rf "$TEMP_DIR"
log_message "Backup archive created successfully."

log_message "Starting rclone transfer to Google Drive..."
rclone copy "$FULL_ARCHIVE_PATH" "$RCLONE_REMOTE$GDRIVE_DEST_DIR" --progress
log_message "Backup successfully transferred to Google Drive."

log_message "Applying retention policy ($RETENTION_DAYS days)..."
find "$LOCAL_BACKUP_DIR" -maxdepth 1 -type f -name 'clawd_memory_backup_*.tar.gz' -mtime +"$RETENTION_DAYS" -print -delete | while read -r old_backup; do
  log_message "Deleted old backup: '$old_backup'."
done

log_message "Backup process completed successfully."
exit 0
`;
}

function buildLaunchdPlist(scriptPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.openclaw.backup</string>
    <key>ProgramArguments</key>
    <array>
      <string>${scriptPath}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>11</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>${path.join(path.dirname(scriptPath), "..", "MoltBackups", "Memory", "launchd.log")}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(path.dirname(scriptPath), "..", "MoltBackups", "Memory", "launchd.err")}</string>
  </dict>
</plist>
`;
}

async function main() {
  console.log("OpenClaw Backup Setup (interactive)\n");
  const projectDir = (await ask(`Project dir [${defaults.projectDir}]: `)) || defaults.projectDir;
  const openclawDir = (await ask(`~/.openclaw dir [${defaults.openclawDir}]: `)) || defaults.openclawDir;
  const cursorappsClawd = (await ask(`Dev/CursorApps/clawd dir [${defaults.cursorappsClawd}]: `)) || defaults.cursorappsClawd;
  const localBackupDir = (await ask(`Local backup dir [${defaults.localBackupDir}]: `)) || defaults.localBackupDir;
  const gdriveRemote = (await ask(`rclone remote [${defaults.gdriveRemote}]: `)) || defaults.gdriveRemote;
  const gdriveDest = (await ask(`GDrive dest path [${defaults.gdriveDest}]: `)) || defaults.gdriveDest;
  const retentionDays = (await ask(`Retention days [${defaults.retentionDays}]: `)) || defaults.retentionDays;
  const schedule = (await ask(`Schedule (launchd|cron|none) [${defaults.schedule}]: `)) || defaults.schedule;

  const cfg = { projectDir, openclawDir, cursorappsClawd, localBackupDir, gdriveRemote, gdriveDest, retentionDays };
  const scriptsDir = path.join(projectDir, "scripts");
  const scriptPath = path.join(scriptsDir, "backup_enhanced.sh");
  safeWrite(scriptPath, buildBackupScript(cfg));
  fs.chmodSync(scriptPath, 0o755);
  console.log(`\nBackup script written to: ${scriptPath}`);

  if (schedule === "launchd" && os.platform() === "darwin") {
    const plistPath = path.join(scriptsDir, "com.openclaw.backup.plist");
    safeWrite(plistPath, buildLaunchdPlist(scriptPath));
    console.log(`Launchd plist written to: ${plistPath}`);
    console.log(`Install with: sudo cp "${plistPath}" /Library/LaunchDaemons/com.openclaw.backup.plist && sudo launchctl load /Library/LaunchDaemons/com.openclaw.backup.plist`);
  } else if (schedule === "cron") {
    console.log(`Add to crontab:\n0 11 * * * ${scriptPath}`);
  } else {
    console.log("Scheduler not configured. Run the script manually or set up cron/launchd.");
  }

  console.log("\nNext steps:");
  console.log(`- Ensure rclone is configured: rclone config`);
  console.log(`- Test run: ${scriptPath}`);
}

main().finally(() => rl.close());
