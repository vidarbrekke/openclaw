#!/usr/bin/env python3
"""
Analyze router decision logs emitted by openclaw-session-proxy.js.

Default log directory:
  ~/.openclaw/logs/router-decisions/
Files:
  router-decisions-YYYY-MM-DD.jsonl
"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    default_dir = Path(os.environ.get("HOME", "/root")) / ".openclaw" / "logs" / "router-decisions"
    p = argparse.ArgumentParser(description="Analyze router decision JSONL logs.")
    p.add_argument("--log-dir", type=Path, default=default_dir, help="Directory with router-decisions-YYYY-MM-DD.jsonl files.")
    p.add_argument("--days", type=int, default=7, help="Lookback window in days (default: 7).")
    p.add_argument("--session", type=str, default="", help="Filter to a single session key.")
    p.add_argument("--model", type=str, default="", help="Filter to entries where finalModel contains this substring.")
    p.add_argument("--json", action="store_true", help="Emit JSON instead of Markdown.")
    return p.parse_args()


def days_in_window(days: int) -> list[str]:
    now = datetime.now(timezone.utc).date()
    return [(now - timedelta(days=i)).isoformat() for i in range(max(1, days))]


def load_entries(log_dir: Path, days: int) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for day in days_in_window(days):
        p = log_dir / f"router-decisions-{day}.jsonl"
        if not p.exists():
            continue
        for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
            raw = line.strip()
            if not raw:
                continue
            try:
                rec = json.loads(raw)
                if isinstance(rec, dict):
                    entries.append(rec)
            except json.JSONDecodeError:
                continue
    return entries


def apply_filters(entries: list[dict[str, Any]], session: str, model: str) -> list[dict[str, Any]]:
    out = entries
    if session:
        out = [e for e in out if str(e.get("sessionKey", "")) == session]
    if model:
        needle = model.lower()
        out = [e for e in out if needle in str(e.get("finalModel", "")).lower()]
    return out


def safe_num(v: Any) -> float | None:
    try:
        n = float(v)
        return n
    except (TypeError, ValueError):
        return None


def summarize(entries: list[dict[str, Any]], days: int, session: str, model: str) -> dict[str, Any]:
    chat_entries = [e for e in entries if e.get("event") == "chat_completion"]
    total = len(entries)
    chat_total = len(chat_entries)

    model_counts = Counter(str(e.get("finalModel") or e.get("selectedModel") or "unknown") for e in chat_entries)
    source_counts = Counter(str(e.get("modelSource", "unknown")) for e in chat_entries)
    task_counts = Counter(str(e.get("taskType", "unknown")) for e in chat_entries)
    session_counts = Counter(str(e.get("sessionKey", "unknown")) for e in chat_entries)

    escalation_total = sum(1 for e in chat_entries if bool(e.get("toolGateEscalated")))
    tool_gate_total = sum(1 for e in chat_entries if bool(e.get("toolGateActive")))
    tool_gate_success_total = sum(1 for e in chat_entries if bool(e.get("toolGateHadValidToolCalls")))

    retries = [safe_num(e.get("toolGateRetryCount")) for e in chat_entries]
    retries = [x for x in retries if x is not None]
    avg_retries = (sum(retries) / len(retries)) if retries else 0.0

    latencies = [safe_num(e.get("responseTimeMs")) for e in chat_entries]
    latencies = [x for x in latencies if x is not None]
    avg_latency_ms = (sum(latencies) / len(latencies)) if latencies else 0.0

    latency_by_model: dict[str, list[float]] = defaultdict(list)
    for e in chat_entries:
        m = str(e.get("finalModel") or e.get("selectedModel") or "unknown")
        rt = safe_num(e.get("responseTimeMs"))
        if rt is not None:
            latency_by_model[m].append(rt)
    avg_latency_by_model = {
        m: round(sum(vals) / len(vals), 2) for m, vals in latency_by_model.items() if vals
    }

    model_by_task: dict[str, Counter] = defaultdict(Counter)
    for e in chat_entries:
        task = str(e.get("taskType", "unknown"))
        mdl = str(e.get("finalModel") or e.get("selectedModel") or "unknown")
        model_by_task[task][mdl] += 1

    return {
        "window_days": days,
        "filters": {"session": session or None, "model": model or None},
        "total_events": total,
        "chat_events": chat_total,
        "session_count": len(session_counts),
        "model_counts": dict(model_counts.most_common()),
        "model_source_counts": dict(source_counts.most_common()),
        "task_type_counts": dict(task_counts.most_common()),
        "top_sessions": dict(session_counts.most_common(10)),
        "tool_gate": {
            "active_count": tool_gate_total,
            "success_count": tool_gate_success_total,
            "escalation_count": escalation_total,
            "escalation_rate_pct": round((escalation_total / chat_total) * 100, 2) if chat_total else 0.0,
            "active_success_rate_pct": round((tool_gate_success_total / tool_gate_total) * 100, 2) if tool_gate_total else 0.0,
            "avg_retry_count": round(avg_retries, 2),
        },
        "latency": {
            "avg_ms": round(avg_latency_ms, 2),
            "avg_ms_by_model": avg_latency_by_model,
        },
        "model_by_task": {
            task: dict(counter.most_common()) for task, counter in sorted(model_by_task.items())
        },
    }


def render_markdown(summary: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("# Router Decision Analysis")
    lines.append("")
    lines.append(f"- Window: last {summary['window_days']} day(s)")
    lines.append(f"- Filters: session={summary['filters']['session'] or 'none'}, model={summary['filters']['model'] or 'none'}")
    lines.append(f"- Total events: {summary['total_events']}")
    lines.append(f"- Chat completion events: {summary['chat_events']}")
    lines.append(f"- Sessions observed: {summary['session_count']}")
    lines.append("")

    lines.append("## Model Usage")
    if summary["model_counts"]:
        for model, count in summary["model_counts"].items():
            lines.append(f"- {model}: {count}")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Selection Source")
    if summary["model_source_counts"]:
        for source, count in summary["model_source_counts"].items():
            lines.append(f"- {source}: {count}")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Tool-Gate")
    tg = summary["tool_gate"]
    lines.append(f"- Active: {tg['active_count']}")
    lines.append(f"- Success (valid tool calls): {tg['success_count']} ({tg['active_success_rate_pct']}%)")
    lines.append(f"- Escalations: {tg['escalation_count']} ({tg['escalation_rate_pct']}% of chat events)")
    lines.append(f"- Avg retries: {tg['avg_retry_count']}")
    lines.append("")

    lines.append("## Task Types")
    if summary["task_type_counts"]:
        for task, count in summary["task_type_counts"].items():
            lines.append(f"- {task}: {count}")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Latency")
    lines.append(f"- Avg response time: {summary['latency']['avg_ms']} ms")
    if summary["latency"]["avg_ms_by_model"]:
        lines.append("- Avg by model:")
        for model, ms in summary["latency"]["avg_ms_by_model"].items():
            lines.append(f"  - {model}: {ms} ms")
    lines.append("")

    lines.append("## Top Sessions")
    if summary["top_sessions"]:
        for sk, count in summary["top_sessions"].items():
            lines.append(f"- {sk}: {count}")
    else:
        lines.append("- none")
    lines.append("")

    lines.append("## Model by Task")
    if summary["model_by_task"]:
        for task, model_counts in summary["model_by_task"].items():
            top = ", ".join([f"{m}={c}" for m, c in list(model_counts.items())[:5]])
            lines.append(f"- {task}: {top or 'none'}")
    else:
        lines.append("- none")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    entries = load_entries(args.log_dir, args.days)
    filtered = apply_filters(entries, args.session, args.model)
    summary = summarize(filtered, args.days, args.session, args.model)
    if args.json:
        print(json.dumps(summary, indent=2))
    else:
        print(render_markdown(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
