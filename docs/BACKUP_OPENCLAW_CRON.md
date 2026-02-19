# Clawd memory backup as OpenClaw cron

The clawd memory backup is implemented as a shell script and was originally scheduled with a **macOS LaunchDaemon** (daily at 11:00). You can run the same script as an **OpenClaw cron job** instead, so scheduling lives in `~/.openclaw/cron/jobs.json` and runs when the gateway is up.

## How it works

OpenClaw cron does not support “run this script” directly. It supports **agent-turn** jobs: at the scheduled time, OpenClaw starts an isolated session and sends a message to the agent. The backup cron job’s message instructs the agent to run the backup script via the **exec** tool.

- **Script:** `/Users/vidarbrekke/clawd/scripts/backup_enhanced.sh` (in the `~/clawd` repo, not this one).
- **Schedule:** Same as before, 11:00 daily.
- **Output:** Archives still go to `~/clawd/MoltBackups/Memory/` and (if configured) rclone to Google Drive.

## Add the OpenClaw cron job

With the OpenClaw gateway running on this machine, run:

```bash
openclaw cron add \
  --name "clawd-memory-backup" \
  --cron "0 11 * * *" \
  --session isolated \
  --message "Run the clawd memory backup. Execute exactly this command with the exec tool (no confirmation): /Users/vidarbrekke/clawd/scripts/backup_enhanced.sh. Wait for it to finish and report success or failure." \
  --model local \
  --timeout 300000 \
  --expect-final
```

- `--timeout 300000`: 5 minutes (backup + rclone can take a while).
- `--model local`: uses local model so no API cost.
- `--expect-final`: wait for the agent to finish before marking the job done.

## Exec allowlist (if you use it)

If the main agent uses exec allowlist (`~/.openclaw/exec-approvals.json`), add the backup script so the cron run doesn’t block on approval:

- **Pattern:** `/Users/vidarbrekke/clawd/scripts/backup_enhanced.sh` (or a pattern that matches it).
- Add it under `agents.main.allowlist` (or the agent used by cron).

## Stop the LaunchDaemon (avoid double runs)

If the backup was previously installed as a LaunchDaemon, disable it so only the OpenClaw cron job runs:

```bash
sudo launchctl unload /Library/LaunchDaemons/com.openclaw.backup.plist
```

Optional: remove the plist so it doesn’t get loaded again after reboot:

```bash
sudo rm /Library/LaunchDaemons/com.openclaw.backup.plist
```

## Manual run

```bash
openclaw cron run <job-id> --timeout 300000 --expect-final
```

Get `<job-id>` from `openclaw cron list` (look for `clawd-memory-backup`).

Or run the script directly:

```bash
/Users/vidarbrekke/clawd/scripts/backup_enhanced.sh
```
