#!/usr/bin/env python3
"""
Consolidated ops maintenance for OpenClaw.
Replaces 4 separate timers: ops-guard-status, cooldown-report,
workspace-invariants, websearch-guard (periodic).

Runs every 15 minutes. Produces a single combined report at:
  /root/.openclaw/workspace/memory/ops-combined-report.md

State persisted in:
  /root/.openclaw/var/ops-state/cooldown-counters.json
  /root/.openclaw/var/ops-state/journal-cursor
"""
import json
import os
import subprocess
import time
from collections import Counter
from datetime import datetime, timezone, timedelta
from pathlib import Path

MEMORY_DIR = Path("/root/.openclaw/workspace/memory")
STATE_DIR = Path("/root/.openclaw/var/ops-state")
LOG_DIR = Path("/root/.openclaw/logs")
TELEGRAM_ROUTER_LOG = LOG_DIR / "telegram-sender-router.log"
CONFIG_PATH = Path("/root/.openclaw/openclaw.json")
GATEWAY_DROPIN = Path("/root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf")
COMBINED_REPORT = MEMORY_DIR / "ops-combined-report.md"
COOLDOWN_STATE = STATE_DIR / "cooldown-counters.json"
CURSOR_FILE = STATE_DIR / "journal-cursor"
MAX_LOG_BYTES = 5 * 1024 * 1024  # 5 MB
MEMORY_BACKFILL_DAYS = 120

for d in (MEMORY_DIR, STATE_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)

ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


# ── helpers ──────────────────────────────────────────────────

def unit_state(name: str) -> str:
    try:
        return subprocess.check_output(
            ["systemctl", "--user", "is-active", name],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
    except subprocess.CalledProcessError:
        return "inactive"


def unit_last_line(name: str) -> str:
    try:
        out = subprocess.check_output(
            ["journalctl", "--user", "-u", name, "-n", "1",
             "--no-pager", "-o", "short-iso"],
            text=True, stderr=subprocess.DEVNULL
        ).strip().splitlines()
        return out[-1] if out else "no logs"
    except Exception:
        return "no logs"


def rotate_log(path: str) -> None:
    p = Path(path)
    if p.exists() and p.stat().st_size > MAX_LOG_BYTES:
        p.rename(str(p) + ".old")
        p.touch()


# ── 1. Unit health ──────────────────────────────────────────

units = {
    "openclaw-gateway.service": unit_state("openclaw-gateway.service"),
    "openclaw-ops-maintenance.timer": unit_state("openclaw-ops-maintenance.timer"),
    "skill-scanner.timer": unit_state("skill-scanner.timer"),
}


# ── 2. Workspace invariants ─────────────────────────────────

DEFAULT_BASE = Path("/root/.openclaw/workspace")
ISOLATED_BASE = Path("/root/.openclaw/workspace-telegram-isolated")
PROXY_BASE = Path("/root/.openclaw/workspace-telegram-vidar-proxy")
DEFAULT_BASE.mkdir(parents=True, exist_ok=True)
ISOLATED_BASE.mkdir(parents=True, exist_ok=True)
PROXY_BASE.mkdir(parents=True, exist_ok=True)

invariant_files = {
    DEFAULT_BASE / "MEMORY.md": (
        "# MEMORY.md\n"
        "Long-term memory for the default workspace.\n"
    ),
    DEFAULT_BASE / "USER.md": (
        "# USER.md\n"
        "Default user context for this workspace.\n"
    ),
    ISOLATED_BASE / "MEMORY.md": (
        "# MEMORY.md - Telegram Isolated Workspace\n"
        "Keep telegram-isolated specific context here.\n"
    ),
    ISOLATED_BASE / "USER.md": (
        "# USER.md - Telegram Isolated Workspace\n"
        "Isolated user context file.\n"
    ),
    PROXY_BASE / "MEMORY.md": (
        "# MEMORY.md - Telegram Vidar Proxy Workspace\n"
        "Keep proxy-specific context here.\n"
    ),
    PROXY_BASE / "USER.md": (
        "# USER.md - Telegram Vidar Proxy Workspace\n"
        "Proxy workspace user context file.\n"
    ),
}

invariants_ok = True
repaired_files = []
for fpath, default_content in invariant_files.items():
    if not fpath.exists():
        fpath.write_text(default_content, encoding="utf-8")
        invariants_ok = False  # had to recreate
        repaired_files.append(str(fpath))

# Backfill daily memory files for a rolling window to prevent ENOENT date-scan loops.
memory_backfilled = []
for i in range(MEMORY_BACKFILL_DAYS):
    day = (datetime.now(timezone.utc).date() - timedelta(days=i)).strftime("%Y-%m-%d")
    daily = MEMORY_DIR / f"{day}.md"
    if not daily.exists():
        daily.write_text(
            f"# {day}\n\nAuto-created by ops-maintenance to prevent missing-file read loops.\n",
            encoding="utf-8",
        )
        memory_backfilled.append(str(daily))


# ── 3. Incremental cooldown counters ────────────────────────

journal_cmd = [
    "journalctl", "--user", "-u", "openclaw-gateway.service",
    "--no-pager", "-o", "short-iso",
]
if CURSOR_FILE.exists():
    cursor_val = CURSOR_FILE.read_text().strip()
    if cursor_val:
        journal_cmd += [f"--after-cursor={cursor_val}"]
else:
    journal_cmd += ["--since", "24 hours ago"]

try:
    new_logs = subprocess.check_output(
        journal_cmd, text=True, stderr=subprocess.DEVNULL
    )
except subprocess.CalledProcessError:
    new_logs = ""

try:
    cursor_out = subprocess.check_output(
        ["journalctl", "--user", "-u", "openclaw-gateway.service",
         "-n", "1", "--show-cursor", "--no-pager", "-o", "short-iso"],
        text=True, stderr=subprocess.DEVNULL
    )
    for line in cursor_out.splitlines():
        if line.startswith("-- cursor:"):
            CURSOR_FILE.write_text(line.replace("-- cursor:", "").strip())
            break
except Exception:
    pass

PATTERNS = {
    "embedded_timeout": "embedded run timeout",
    "cooldown_unavailable": "all in cooldown or unavailable",
    "llm_timed_out": "LLM request timed out",
    "read_without_path": "read tool called without path",
    "key_limit_exceeded": "Key limit exceeded",
    "gateway_restart": "received SIGUSR1; restarting",
    "exec_command_blocked": "exec_command_blocked",
}

new_counts = {}
for key, pattern in PATTERNS.items():
    new_counts[key] = sum(1 for line in new_logs.splitlines() if pattern in line)

now_ts = time.time()
cutoff = now_ts - 86400

if COOLDOWN_STATE.exists():
    try:
        state = json.loads(COOLDOWN_STATE.read_text())
    except (json.JSONDecodeError, OSError):
        state = {"events": []}
else:
    state = {"events": []}

for key, count in new_counts.items():
    if count > 0:
        state["events"].append({"ts": now_ts, "type": key, "count": count})

state["events"] = [e for e in state["events"] if e["ts"] > cutoff]

rolling = {}
for e in state["events"]:
    rolling[e["type"]] = rolling.get(e["type"], 0) + e["count"]
state["rolling"] = rolling
state["last_update"] = now_ts

COOLDOWN_STATE.write_text(json.dumps(state, indent=2), encoding="utf-8")

lane_errors = []
for line in new_logs.splitlines():
    if "[diagnostic] lane task error:" in line and 'error="' in line:
        start = line.find('error="') + len('error="')
        end = line.find('"', start)
        if end > start:
            lane_errors.append(line[start:end])
top_errors = Counter(lane_errors).most_common(5)

health_status = "Stable" if rolling.get("cooldown_unavailable", 0) == 0 and rolling.get("embedded_timeout", 0) == 0 else "Degraded"


# ── 4. Guard fallback status ─────────────────────────────────

guard_result = "policy-only mode (runtime patch fallback retired)"


# ── 5. Telegram routing metrics ───────────────────────────────

telegram_metrics = {
    "routes_total_24h": 0,
    "vidar_to_proxy_24h": 0,
    "others_to_isolated_24h": 0,
    "invalid_sender_fallback_24h": 0,
    "duplicate_message_id_24h": 0,
    "missing_message_id_for_proxy_24h": 0,
}
telegram_cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

if TELEGRAM_ROUTER_LOG.exists():
    try:
        for line in TELEGRAM_ROUTER_LOG.read_text(encoding="utf-8", errors="ignore").splitlines():
            if not line.startswith("[") or "]" not in line:
                continue
            ts_end = line.find("]")
            try:
                line_ts = datetime.fromisoformat(line[1:ts_end].replace("Z", "+00:00"))
            except ValueError:
                continue
            if line_ts.tzinfo is None:
                line_ts = line_ts.replace(tzinfo=timezone.utc)
            if line_ts < telegram_cutoff:
                continue

            telegram_metrics["routes_total_24h"] += 1
            if "agentId=telegram-vidar-proxy" in line and "sender=5309173712" in line:
                telegram_metrics["vidar_to_proxy_24h"] += 1
            if "agentId=telegram-isolated" in line and "sender=5309173712" not in line:
                telegram_metrics["others_to_isolated_24h"] += 1
            if "reason=invalid_sender" in line:
                telegram_metrics["invalid_sender_fallback_24h"] += 1
            if "reason=duplicate_message_id" in line:
                telegram_metrics["duplicate_message_id_24h"] += 1
            if "reason=missing_message_id_for_proxy" in line:
                telegram_metrics["missing_message_id_for_proxy_24h"] += 1
    except Exception:
        pass

# ── 5b. Telegram routing assertions ───────────────────────────

TELEGRAM_THRESHOLDS = {
    "invalid_sender_fallback_24h": 10,
    "duplicate_message_id_24h": 25,
    "missing_message_id_for_proxy_24h": 0,
}
telegram_assertions = []
if telegram_metrics["invalid_sender_fallback_24h"] > TELEGRAM_THRESHOLDS["invalid_sender_fallback_24h"]:
    telegram_assertions.append(
        f"invalid_sender_fallback_24h>{TELEGRAM_THRESHOLDS['invalid_sender_fallback_24h']}"
    )
if telegram_metrics["duplicate_message_id_24h"] > TELEGRAM_THRESHOLDS["duplicate_message_id_24h"]:
    telegram_assertions.append(
        f"duplicate_message_id_24h>{TELEGRAM_THRESHOLDS['duplicate_message_id_24h']}"
    )
if telegram_metrics["missing_message_id_for_proxy_24h"] > TELEGRAM_THRESHOLDS["missing_message_id_for_proxy_24h"]:
    telegram_assertions.append("missing_message_id_for_proxy_24h>0")

telegram_routing_status = "Healthy" if not telegram_assertions else "Attention"


# ── 6. Exec security posture ────────────────────────────────

exec_posture_lines = []
try:
    cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    tools = cfg.get("tools", {})
    exec_cfg = tools.get("exec", {})
    elevated_cfg = tools.get("elevated", {})
    exec_posture_lines.append(f"- exec.security: {exec_cfg.get('security', 'not set')}")
    exec_posture_lines.append(f"- elevated.enabled: {elevated_cfg.get('enabled', 'not set')}")
    webchat_allow = elevated_cfg.get("allowFrom", {}).get("webchat", "not set")
    exec_posture_lines.append(f"- elevated.webchat_allow: {webchat_allow}")
    if str(webchat_allow) == "['*']" or webchat_allow == ["*"]:
        exec_posture_lines.append(
            "- WARNING: elevated.webchat_allow=['*'] gives broad server access from chat. "
            "Consider restricting if attack surface is a concern."
        )
except Exception as e:
    exec_posture_lines.append(f"- Could not read config: {e}")


# ── 7. Log rotation ─────────────────────────────────────────

rotate_log("/var/log/skill-scanner.log")
rotate_log(str(LOG_DIR / "websearch-guard.log"))
rotate_log(str(TELEGRAM_ROUTER_LOG))


# ── 8. Write combined report ────────────────────────────────

report_lines = [
    f"# Ops Combined Report ({ts})",
    "",
    "## Service Health",
]
for name, st in units.items():
    report_lines.append(f"- {name}: {st}")
report_lines.append(f"- workspace-invariants: checked inline ({'ok' if invariants_ok else 'repaired'})")
report_lines.append("- workspace-invariants scope: default workspace + telegram-isolated + telegram-vidar-proxy")
if repaired_files:
    report_lines.append(f"- workspace-invariants repaired files: {', '.join(repaired_files)}")
report_lines.append(f"- memory daily-file backfill window: {MEMORY_BACKFILL_DAYS} days")
if memory_backfilled:
    report_lines.append(f"- memory daily files created this run: {len(memory_backfilled)}")

report_lines += [
    "",
    "## Cooldown Health (rolling 24h)",
]
for key in PATTERNS:
    report_lines.append(f"- {key}: {rolling.get(key, 0)}")
report_lines.append(f"- Overall: **{health_status}**")

if top_errors:
    report_lines += ["", "## Top Lane Errors (since last run)"]
    for msg, n in top_errors:
        report_lines.append(f"- {n}x {msg}")

report_lines += [
    "",
    "## Runtime Guards",
    "- web_search cap: max 5 total, max 2 duplicate per session window",
    "- read loop cap: max 2 identical ENOENT reads per run",
    "- memory date sweep cap: max 20 reads of /memory/YYYY-MM-DD.md per run",
    "- service-control exec cap: block restart/stop gateway commands from chat/agent exec",
    "- guard_policy_mode: enabled (runtime-guard-policy skill + strict exec config)",
    f"- runtime_patch_fallback: {'enabled' if GATEWAY_DROPIN.exists() else 'disabled'}",
    "- Enforcement: policy-layer guardrails via runtime-guard-policy + strict exec config",
    f"- Guard enforcement last run: {guard_result}",
    f"- Guard log: {LOG_DIR / 'websearch-guard.log'}",
    "",
    "## Exec Security Posture",
] + exec_posture_lines + [
    "",
    "## Skill Scanner",
    f"- Timer: {units.get('skill-scanner.timer', 'unknown')}",
    "- Schedule: daily 03:00 UTC",
    "- Log: /var/log/skill-scanner.log (rotated at 5 MB)",
    f"- Last run: {unit_last_line('skill-scanner.service')}",
    "",
    "## Telegram Routing Health (24h)",
    f"- routes_total_24h: {telegram_metrics['routes_total_24h']}",
    f"- vidar_to_proxy_24h: {telegram_metrics['vidar_to_proxy_24h']}",
    f"- others_to_isolated_24h: {telegram_metrics['others_to_isolated_24h']}",
    f"- invalid_sender_fallback_24h: {telegram_metrics['invalid_sender_fallback_24h']}",
    f"- duplicate_message_id_24h: {telegram_metrics['duplicate_message_id_24h']}",
    f"- missing_message_id_for_proxy_24h: {telegram_metrics['missing_message_id_for_proxy_24h']}",
    "",
    "## Telegram Routing Assertions",
    f"- Status: **{telegram_routing_status}**",
    f"- Threshold invalid_sender_fallback_24h <= {TELEGRAM_THRESHOLDS['invalid_sender_fallback_24h']}",
    f"- Threshold duplicate_message_id_24h <= {TELEGRAM_THRESHOLDS['duplicate_message_id_24h']}",
    f"- Threshold missing_message_id_for_proxy_24h <= {TELEGRAM_THRESHOLDS['missing_message_id_for_proxy_24h']}",
    f"- Breaches: {', '.join(telegram_assertions) if telegram_assertions else 'none'}",
    "",
    "## Architecture",
    "- This report is generated by `/root/.openclaw/scripts/ops-maintenance.py`",
    "- Runs every 15 min via `openclaw-ops-maintenance.timer`",
    "- Replaces 4 separate timers: ops-guard-status, cooldown-report,",
    "  workspace-invariants, websearch-guard (periodic)",
    "- Guardrails are in policy-only mode (runtime patch fallback retired).",
    "- Rollback artifact retained at `/root/.openclaw/var/rollback/10-websearch-guard.conf.bak`.",
    "",
]

COMBINED_REPORT.write_text("\n".join(report_lines), encoding="utf-8")
print(f"wrote {COMBINED_REPORT}")
