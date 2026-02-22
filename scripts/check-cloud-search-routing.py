#!/usr/bin/env python3
"""
check-cloud-search-routing.py

Post-upgrade drift check for the "safe model":
- built-in tools.web.search is disabled in openclaw.json
- Perplexity MCP server exists in mcporter config
- Perplexity MCP is reachable and exposes expected tools

Runs from local machine over SSH to Linode by default.
"""

from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import sys
from dataclasses import dataclass


@dataclass
class CheckResult:
    name: str
    ok: bool
    detail: str


def run_ssh(host: str, key: str, remote_cmd: str) -> subprocess.CompletedProcess[str]:
    cmd = [
        "ssh",
        "-i",
        key,
        "-o",
        "IdentitiesOnly=yes",
        host,
        remote_cmd,
    ]
    return subprocess.run(cmd, text=True, capture_output=True, timeout=60, check=False)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check cloud search routing drift")
    parser.add_argument("--local", action="store_true", help="Run checks on current machine (no SSH)")
    parser.add_argument("--host", default="root@45.79.135.101", help="SSH host")
    parser.add_argument("--ssh-key", default="~/.ssh/id_ed25519_linode", help="SSH private key path")
    parser.add_argument(
        "--openclaw-config",
        default="/root/openclaw-stock-home/.openclaw/openclaw.json",
        help="Remote openclaw.json path",
    )
    parser.add_argument(
        "--mcporter-config",
        default="/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json",
        help="Remote mcporter.json path",
    )
    parser.add_argument("--workspace-default", default="/root/.openclaw/workspace", help="Default workspace path")
    parser.add_argument(
        "--workspace-stock",
        default="/root/openclaw-stock-home/.openclaw/workspace",
        help="Stock-home workspace path",
    )
    args = parser.parse_args()

    ssh_key = args.ssh_key
    if args.ssh_key.startswith("~/"):
        # Keep behavior simple and explicit for local user shells.
        ssh_key = args.ssh_key.replace("~", subprocess.check_output(["bash", "-lc", "printf %s \"$HOME\""], text=True).strip(), 1)

    def run(cmd: str) -> subprocess.CompletedProcess[str]:
        if args.local:
            return subprocess.run(["bash", "-lc", cmd], text=True, capture_output=True, timeout=60, check=False)
        return run_ssh(args.host, ssh_key, cmd)

    results: list[CheckResult] = []

    cfg_cmd = (
        "node -e "
        + shlex.quote(
            (
                f"const c=require('{args.openclaw_config}');"
                "const main=(c.agents?.list||[]).find(a=>a.id==='main');"
                "const out={"
                "gatewayMode:c.gateway?.mode,"
                "webSearchEnabled:c.tools?.web?.search?.enabled,"
                "webProvider:c.tools?.web?.search?.provider,"
                "mainDenyWebFetch:main?.tools?.deny && main.tools.deny.includes('web_fetch')"
                "};"
                "console.log(JSON.stringify(out));"
            )
        )
    )
    r_cfg = run(cfg_cmd)
    if r_cfg.returncode != 0:
        print(f"[FAIL] config_read: {r_cfg.stderr.strip() or r_cfg.stdout.strip()}")
        return 2
    cfg = json.loads(r_cfg.stdout.strip() or "{}")
    results.append(CheckResult("gateway_mode_local", cfg.get("gatewayMode") == "local", f"gateway.mode={cfg.get('gatewayMode')}"))
    results.append(
        CheckResult(
            "builtin_web_search_disabled",
            cfg.get("webSearchEnabled") is False,
            f"tools.web.search.enabled={cfg.get('webSearchEnabled')}",
        )
    )
    results.append(CheckResult("web_provider_perplexity", cfg.get("webProvider") == "perplexity", f"provider={cfg.get('webProvider')}"))
    results.append(
        CheckResult(
            "main_deny_web_fetch",
            cfg.get("mainDenyWebFetch") is True,
            "main.tools.deny includes web_fetch (required so search uses Perplexity MCP)",
        )
    )

    ws_cmd = (
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        f"a=Path('{args.workspace_default}')\n"
        f"b=Path('{args.workspace_stock}')\n"
        "out={\n"
        "  'defaultExists': a.exists(),\n"
        "  'stockExists': b.exists(),\n"
        "  'defaultIsSymlink': a.is_symlink(),\n"
        "  'defaultReal': str(a.resolve()) if a.exists() else None,\n"
        "  'stockReal': str(b.resolve()) if b.exists() else None,\n"
        "}\n"
        "print(__import__('json').dumps(out))\n"
        "PY"
    )
    r_ws = run(ws_cmd)
    if r_ws.returncode != 0:
        results.append(CheckResult("workspace_unified", False, r_ws.stderr.strip() or r_ws.stdout.strip()))
    else:
        ws = json.loads(r_ws.stdout.strip() or "{}")
        same_real = ws.get("defaultExists") and ws.get("stockExists") and ws.get("defaultReal") == ws.get("stockReal")
        results.append(
            CheckResult(
                "workspace_unified",
                bool(same_real),
                (
                    f"default={ws.get('defaultReal')} stock={ws.get('stockReal')} "
                    f"symlink={ws.get('defaultIsSymlink')}"
                ),
            )
        )

    mcp_cmd = (
        "node -e "
        + shlex.quote(
            (
                f"const c=require('{args.mcporter_config}');"
                "const s=Object.keys(c.mcpServers||{});"
                "console.log(JSON.stringify({servers:s, hasPerplexity: !!(c.mcpServers&&c.mcpServers.perplexity)}));"
            )
        )
    )
    r_mcp = run(mcp_cmd)
    if r_mcp.returncode != 0:
        print(f"[FAIL] mcporter_config_read: {r_mcp.stderr.strip() or r_mcp.stdout.strip()}")
        return 2
    mcp = json.loads(r_mcp.stdout.strip() or "{}")
    results.append(
        CheckResult(
            "mcporter_has_perplexity_server",
            bool(mcp.get("hasPerplexity")),
            f"servers={mcp.get('servers', [])}",
        )
    )

    tools_cmd = "cd /root/openclaw-stock-home/.openclaw/workspace && mcporter list perplexity --json"
    r_tools = run(tools_cmd)
    if r_tools.returncode != 0:
        results.append(CheckResult("perplexity_mcp_online", False, r_tools.stderr.strip() or r_tools.stdout.strip()))
    else:
        payload = json.loads(r_tools.stdout)
        names = {t.get("name") for t in payload.get("tools", [])}
        expected = {"perplexity_ask", "perplexity_reason", "perplexity_research", "perplexity_search"}
        results.append(CheckResult("perplexity_mcp_online", payload.get("status") == "ok", f"status={payload.get('status')}"))
        results.append(CheckResult("perplexity_tools_complete", expected.issubset(names), f"tools={sorted(names)}"))

    failed = 0
    for result in results:
        status = "PASS" if result.ok else "FAIL"
        print(f"[{status}] {result.name}: {result.detail}")
        if not result.ok:
            failed += 1

    if failed:
        print(f"\nResult: {failed} check(s) failed.")
        return 1

    print("\nResult: safe search routing checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
