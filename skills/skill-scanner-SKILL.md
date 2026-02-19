---
name: skill-scanner
description: >
  Security scanner for OpenClaw skills. Runs daily at 03:00 UTC via systemd timer.
  Scans skill files for potential security issues. Status visible in ops-combined-report.
---

# Skill Scanner

Automated security scanning of OpenClaw skills using
[cisco-ai-defense/skill-scanner](https://github.com/cisco-ai-defense/skill-scanner).

## Setup

- **Installed at:** `/opt/skill-scanner/`
- **Entry point:** `/opt/skill-scanner/bin/scan-new-skills.sh`
- **Log:** `/var/log/skill-scanner.log` (rotated at 5 MB by ops-maintenance)

## Schedule

- **Timer:** `skill-scanner.timer`
- **Runs:** daily at 03:00 UTC
- **Persistent:** yes (catches up if server was down)

## Checking status

```bash
systemctl --user status skill-scanner.timer
systemctl --user status skill-scanner.service
journalctl --user -u skill-scanner.service -n 20
```

Or read the ops-combined-report which includes skill-scanner status.

## What it scans

The scanner checks OpenClaw skill files for:
- Prompt injection patterns
- Credential/secret exposure risks
- Unsafe tool usage patterns
- Overly broad permission grants

## Manual run

```bash
systemctl --user start skill-scanner.service
```

## Visibility

Status is automatically included in the ops-combined-report generated every 15 min,
and therefore visible in daily briefings that use the ops-guard skill.
