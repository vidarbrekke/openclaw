# Skill-scanner on Linode

[Cisco skill-scanner](https://github.com/cisco-ai-defense/skill-scanner) runs on the Linode to add a security layer for 3rd-party OpenClaw skills.

## Design

- **Trigger:** System cron every **hour** (at :00) runs `scan-new-skills.sh`. Only skills that are **new** (no state file) or **changed** (dir mtime newer than last scan) are scanned. No full-tree scan every run.
- **Scanner:** Static + behavioral analyzers only (no LLM/API). Installed in an isolated venv under `/opt/skill-scanner`.
- **State:** `/root/openclaw-stock-home/.openclaw/var/skill-scanner-state/` — one file per skill name; mtime of that file = last scan time.
- **Log:** `/var/log/skill-scanner.log` — append-only; each scan logs the skill name and the scanner’s summary output.
- **Updates:** Cron **Sunday 03:00** runs `upgrade-scanner.sh` to `pip install -U cisco-ai-skill-scanner`.

## Install (on the Linode)

From your Mac (with this repo and SSH key):

```bash
cd /Users/vidarbrekke/Dev/CursorApps/clawd
scp -i ~/.ssh/id_ed25519_linode -r scripts/skill-scanner-linode root@45.79.135.101:/tmp/
ssh -i ~/.ssh/id_ed25519_linode root@45.79.135.101 "sudo bash /tmp/skill-scanner-linode/install.sh"
```

Requires: root, Python 3.10+ (installer will try `apt-get install python3 python3-venv python3-pip` if needed), and `/etc/crontab` writable.

## After install

- **Log:** `ssh root@45.79.135.101 "tail -f /var/log/skill-scanner.log"`
- **Manual scan one skill:** `ssh root@45.79.135.101 "/opt/skill-scanner/venv/bin/skill-scanner scan /root/openclaw-stock-home/.openclaw/skills/SkillName --use-behavioral"`
- **Force rescan all:** `ssh root@45.79.135.101 "rm -f /root/openclaw-stock-home/.openclaw/var/skill-scanner-state/*"` — next timer run will treat all as new.

**If skill-scanner was installed before switching to stock-home:** Either re-run the install (so the scan script uses the new defaults) or add to the systemd service: `Environment="OPENCLAW_SKILLS_DIR=/root/openclaw-stock-home/.openclaw/skills"` and `Environment="SKILL_SCANNER_STATE_DIR=/root/openclaw-stock-home/.openclaw/var/skill-scanner-state"`, then `systemctl --user daemon-reload`.

## Optional: alert on findings

The scanner exits non-zero when there are HIGH/CRITICAL findings (if you add `--fail-on-findings`). The current script does **not** fail the cron job; it logs and touches state so we don’t rescan in a loop. To get alerts, add a step in `scan-new-skills.sh` that parses output or uses `--format json` and sends to your notification path when severity &gt; MEDIUM.
