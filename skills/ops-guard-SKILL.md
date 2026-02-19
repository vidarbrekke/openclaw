---
name: ops-guard
description: >
  Visibility and health checks for all operational guardrails. Single source of truth
  for platform health, runtime guards, cooldown status, and security posture.
  Use for daily briefings, incident triage, and self-diagnostics.
---

# Ops Guard

Use this skill when reporting platform health, diagnosing stuck/cooldown behavior,
or answering questions about what operational safeguards exist.

## Architecture

All operational maintenance is consolidated into a single orchestrator:

- **Script:** `/root/.openclaw/scripts/ops-maintenance.py`
- **Timer:** `openclaw-ops-maintenance.timer` (every 15 min)
- **Report:** `/root/.openclaw/workspace/memory/ops-combined-report.md`
- **State:** `/root/.openclaw/var/ops-state/` (cooldown counters, journal cursor)

This replaced 4 separate timers (ops-guard-status, cooldown-report,
workspace-invariants, websearch-guard periodic) with one unified service.

## How to check health

1. Read `/root/.openclaw/workspace/memory/ops-combined-report.md`.
2. Include a short "Ops Health" section in any daily briefing or status response.

## Report sections

The combined report includes:

- **Service Health:** gateway, maintenance timer, skill-scanner timer status
- **Cooldown Health (rolling 24h):** incremental counters for timeouts, cooldowns,
  LLM timeouts, read failures, key limits, and gateway restarts
- **Runtime Guards:** web_search cap (5 total / 2 dup), read loop cap (2 per path),
  memory date sweep cap (20 per run), service-control exec blocking,
  enforcement status and log location
- **Exec Security Posture:** current exec/elevated permissions configuration
- **Skill Scanner:** timer status, schedule, last run
- **Telegram Routing Assertions:** threshold checks for invalid sender spikes,
  duplicate message ids, and missing message-id proxy fallbacks
- **Log Rotation:** automatic rotation at 5 MB for scanner and guard logs

## Runtime guards (policy-layer, current mode)

These guards are enforced through policy-layer guidance and strict tool/config
boundaries:

1. **web_search cap:** max 5 calls per 10-min session window, max 2 identical
   queries per window. Returns error JSON instead of executing the search.
2. **read loop cap:** max 2 reads of the same path per run/session. Throws
   `read_path_repeat_limit_exceeded` on the third attempt.
3. **memory date sweep cap:** max 20 reads of `/memory/YYYY-MM-DD.md` per run.
4. **service-control block:** blocks in-chat exec of gateway restart/stop commands.

Guard posture is validated every 15 minutes by the ops-maintenance orchestrator
and surfaced in the combined report.

## Runtime patch fallback status

- **Current operating mode:** policy-only.
- **Runtime patch fallback:** retired/disabled in normal operation.
- **Emergency rollback artifact:** `/root/.openclaw/var/rollback/10-websearch-guard.conf.bak`
  can be restored temporarily during incident response.

## Exec security posture

The report includes the current `exec` and `elevated` tool configuration.
If `elevated.webchat_allow=["*"]` is set, the report flags this as a potential
attack surface concern. Changing security settings requires explicit human approval.

## Incident mode

If any service is failed or cooldown health is "Degraded":
- Mention the failing component first
- Provide the exact unit name and relevant log line
- Suggest one recovery command

## Workspace invariants

The orchestrator checks and repairs essential files every 15 min for:
- default workspace
- telegram-isolated workspace
- telegram-vidar-proxy workspace

Missing files are recreated automatically; the report shows "repaired" when this happens.

## Transparency commitment

Every operational safeguard is:
- Documented in this skill
- Reported in the combined report (readable by OpenClaw)
- Logged to persistent files
- Visible via `systemctl --user list-timers`
