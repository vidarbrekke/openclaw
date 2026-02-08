# OpenClaw Backup Setup (Portable)

This package provides an interactive setup script that generates a backup script
and optional scheduler config (launchd or cron). It is designed to be portable
and easy to share as a GitHub repo.

## Usage

```
node openclaw-backup-setup.js
```

The prompt collects:
- clawd project path
- `~/.openclaw` path
- `~/Dev/CursorApps/clawd` path (skills source)
- rclone remote name and destination
- retention days
- scheduler type (launchd, cron, or none)

## What gets backed up

- `~/clawd/memory`
- `~/clawd/*.md`
- `~/clawd/scripts`
- `~/.openclaw/openclaw.json`
- `~/.openclaw/skills`
- `~/.openclaw/modules`
- `~/.openclaw/round-robin-models.json`
- `~/.openclaw/workspace`
- `~/.openclaw/workspace-local-ops`
- `~/.openclaw/cron/jobs.json`
- `~/Dev/CursorApps/clawd` (excludes `node_modules`, `test-results`)

## Scheduler

### macOS (launchd)
The setup script emits a plist and prints the install command:

```
sudo cp "<plist>" /Library/LaunchDaemons/com.openclaw.backup.plist
sudo launchctl load /Library/LaunchDaemons/com.openclaw.backup.plist
```

### Linux (cron)
Add the generated cron line to `crontab -e`.

### Windows
Use Task Scheduler to run the generated `backup_enhanced.sh` via Git Bash or WSL.

## Requirements

- `rclone` configured with a Google Drive remote
- `node` for running the setup
- `bash` for running the backup script
