#!/usr/bin/env python3
"""
check-cloud-giftcard-drift.py

Validates critical cloud drift points for the Telegram super-user gift-card flow.

Default targets are Linode/OpenClaw paths:
  /root/openclaw-stock-home/.openclaw/openclaw.json
  /root/.openclaw/workspace-telegram-vidar-proxy/AGENTS.md
  /root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js

Usage examples:
  python3 scripts/check-cloud-giftcard-drift.py
  python3 scripts/check-cloud-giftcard-drift.py --base-dir /tmp/mock-openclaw
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Callable


class CheckResult:
    def __init__(self, name: str, ok: bool, detail: str) -> None:
        self.name = name
        self.ok = ok
        self.detail = detail


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def find_agent(cfg: dict, agent_id: str) -> dict | None:
    for agent in cfg.get("agents", {}).get("list", []):
        if agent.get("id") == agent_id:
            return agent
    return None


def has_binding(cfg: dict, channel: str, peer_kind: str, peer_id: str, agent_id: str) -> bool:
    for item in cfg.get("bindings", []):
        match = item.get("match", {})
        peer = match.get("peer", {})
        if (
            match.get("channel") == channel
            and peer.get("kind") == peer_kind
            and str(peer.get("id")) == str(peer_id)
            and item.get("agentId") == agent_id
        ):
            return True
    return False


def run_cli(cli_path: Path, args: list[str]) -> tuple[bool, str]:
    cmd = ["node", str(cli_path), *args]
    try:
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT, timeout=20)
        return True, out.strip()
    except Exception as exc:  # noqa: BLE001
        return False, str(exc)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check cloud gift-card drift")
    parser.add_argument("--base-dir", default="/root/openclaw-stock-home/.openclaw", help="OpenClaw base dir (stock-home)")
    parser.add_argument(
        "--mcp-cli",
        default="/root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js",
        help="Path to mcp-motherknitter cli.js",
    )
    parser.add_argument("--vidar-id", default="5309173712", help="Vidar Telegram sender id")
    args = parser.parse_args()

    base = Path(args.base_dir)
    config_path = base / "openclaw.json"
    proxy_agents_path = base / "workspace-telegram-vidar-proxy" / "AGENTS.md"
    mcp_cli = Path(args.mcp_cli)

    results: list[CheckResult] = []

    if not config_path.exists():
        print(f"[FAIL] config: missing {config_path}")
        return 2
    if not proxy_agents_path.exists():
        print(f"[FAIL] proxy-agents: missing {proxy_agents_path}")
        return 2

    cfg = load_json(config_path)
    proxy_agents = proxy_agents_path.read_text(encoding="utf-8")

    def add(name: str, ok: bool, detail: str) -> None:
        results.append(CheckResult(name, ok, detail))

    # Routing check: Vidar DM must go to proxy
    add(
        "binding_vidar_to_proxy",
        has_binding(cfg, "telegram", "direct", args.vidar_id, "telegram-vidar-proxy"),
        f"telegram direct {args.vidar_id} -> telegram-vidar-proxy",
    )

    # Proxy tool surface check
    proxy_agent = find_agent(cfg, "telegram-vidar-proxy") or {}
    proxy_tools = proxy_agent.get("tools", {})
    allow = set(proxy_tools.get("allow", []))
    deny = set(proxy_tools.get("deny", []))
    add("proxy_allow_exec", "exec" in allow, f"allow={sorted(allow)}")
    add("proxy_allow_read", "read" in allow, f"allow={sorted(allow)}")
    add("proxy_deny_sessions_spawn", "sessions_spawn" in deny, f"deny={sorted(deny)}")

    # Main deny should include chat-noisy list helpers to reduce token burn
    main_agent = find_agent(cfg, "main") or {}
    main_deny = set(main_agent.get("tools", {}).get("deny", []))
    add("main_deny_agents_list", "agents_list" in main_deny, f"deny={sorted(main_deny)}")
    add("main_deny_sessions_list", "sessions_list" in main_deny, f"deny={sorted(main_deny)}")

    # Proxy AGENTS policy markers
    markers: list[tuple[str, str]] = [
        ("policy_no_sessions_spawn", "Never use `sessions_spawn`."),
        ("policy_one_message", "Send exactly one final user-facing message per turn."),
        ("policy_json_lookup", "giftcard_lookup --code <CODE> --site production --format json"),
        ("policy_json_update", "giftcard_update --code <CODE> --amount <AMOUNT> --mode <set|add|subtract> --site production --format json"),
        ("policy_json_timeline", "giftcard_timeline --code <CODE> --site production --format json"),
        ("policy_fallback_guard", "## Gift-card intent fallback guard (mandatory)"),
        ("policy_intent_map", "Natural intent map:"),
    ]
    for name, needle in markers:
        add(name, needle in proxy_agents, f"marker='{needle}'")

    # MCP CLI sanity checks for json support
    if mcp_cli.exists():
        ok1, out1 = run_cli(
            mcp_cli,
            ["giftcard_usage_summary", "--days", "1", "--format", "json", "--site", "production"],
        )
        add("mcp_usage_summary_json", ok1 and out1.startswith("{"), out1[:180])

        ok2, out2 = run_cli(
            mcp_cli,
            ["giftcard_search_by_sender", "--query", "Peter White", "--days", "365", "--limit", "3", "--format", "json", "--site", "production"],
        )
        add("mcp_sender_search_json", ok2 and out2.startswith("{"), out2[:180])
    else:
        add("mcp_cli_present", False, f"missing {mcp_cli}")

    failed = 0
    for r in results:
        status = "PASS" if r.ok else "FAIL"
        print(f"[{status}] {r.name}: {r.detail}")
        if not r.ok:
            failed += 1

    if failed:
        print(f"\nResult: {failed} check(s) failed.")
        return 1

    print("\nResult: all drift checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
