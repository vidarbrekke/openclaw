# Cloud Bot Command Card (policy-only mode + emergency rollback)

Use from SSH on the Linode. Do not run these from chat/agent exec.

## 0) Test that the stock-home workspace is working

**A. Server-side (SSH)** — confirm files and ops are in the right place:

```bash
# Gateway running and using stock-home config
systemctl --user is-active openclaw-gateway.service
test -f /root/openclaw-stock-home/.openclaw/openclaw.json && echo "config OK"

# Workspace present (AGENTS.md, docs, memory)
head -3 /root/openclaw-stock-home/.openclaw/workspace/AGENTS.md
ls /root/openclaw-stock-home/.openclaw/workspace/docs/ | head -5
test -f /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md && echo "ops report OK"

# Ops maintenance timer and last report
systemctl --user is-active openclaw-ops-maintenance.timer
tail -20 /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md
```

**B. Gateway using stock-home** — the gateway must load config (and workspace) from `/root/openclaw-stock-home/.openclaw`. If it was started with default `~/.openclaw`, it will not see the deployed workspace. Check how the service is started:

```bash
systemctl --user show openclaw-gateway.service -p ExecStart -p Environment
# Or: cat /root/.config/systemd/user/openclaw-gateway.service
```

If the service uses default `openclaw gateway` with no env, OpenClaw uses `$HOME/.openclaw` (for root: `/root/.openclaw`). To use stock-home instead, the unit should set e.g. `Environment="OPENCLAW_CONFIG_PATH=/root/openclaw-stock-home/.openclaw/openclaw.json"` (or `HOME=/root/openclaw-stock-home` if OpenClaw derives workspace from home). Adjust the unit and `daemon-reload` + restart if needed.

**Symlink (token sync):** On this Linode, `/root/.openclaw/openclaw.json` is a **symlink** to `/root/openclaw-stock-home/.openclaw/openclaw.json`. That way `openclaw gateway restart` and `openclaw gateway install --force` work without setting `OPENCLAW_CONFIG_PATH`, and you avoid "Config token differs from service token" (the CLI and the service both see the same config). Do not replace the symlink with a real file unless you intend to use a separate default config.

**C. End-to-end (chat)** — open the OpenClaw dashboard/webchat that talks to this Linode. Ask the agent:

- “What’s the first line of AGENTS.md?” or “Do you have access to AGENTS.md?”
- “What does your MEMORY.md say about Linode?”

If the agent can answer from AGENTS.md or MEMORY.md, the workspace is being used. If it says it cannot read those files or doesn’t know, the gateway is likely not using the stock-home workspace.

## 1) Fast health check

```bash
systemctl --user status openclaw-gateway.service --no-pager -n 40
journalctl --user -u openclaw-gateway.service --since "15 minutes ago" --no-pager
cat /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md
```

Expected guard posture:
- `guard_policy_mode: enabled`
- `runtime_patch_fallback: disabled`
- `elevated.webchat_allow: []`

## 2) Check for restart-induced stuck turns

```bash
journalctl --user -u openclaw-gateway.service --since "30 minutes ago" --no-pager | sed -n '/signal SIGTERM received/p;/webchat disconnected code=1012/p'
```

If present, active turns were interrupted by restart.

## 3) Safe operator restart (only if required)

```bash
systemctl --user restart openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager -n 30
```

## 4) "All models failed" / "all in cooldown or unavailable" (rate_limit)

When every request fails with **No available auth profile for openrouter (all in cooldown or unavailable)**:

1. **Restart gateway** (clears in-memory cooldown state):
   ```bash
   systemctl --user restart openclaw-gateway.service
   systemctl --user is-active openclaw-gateway.service
   ```
2. **Wait 2–5 minutes** (or 5–10 if the first failure was an LLM timeout) so OpenRouter rate limits can reset, then retry.
3. If it keeps failing:
   - Check [OpenRouter → Settings → Keys](https://openrouter.ai/settings/keys): key valid and not over limit.
   - Key on server: `/root/openclaw-stock-home/.openclaw/agents/main/agent/auth-profiles.json` (`openrouter:default`). You can add a second key or rotate (then restart gateway).

Logs: `openclaw logs --follow` or  
`journalctl --user -u openclaw-gateway.service --since "20 minutes ago" --no-pager`

## 5) Verify no read/cooldown storm

```bash
journalctl --user -u openclaw-gateway.service --since "20 minutes ago" --no-pager | sed -n '/read failed: ENOENT/p;/all in cooldown or unavailable/p;/LLM request timed out/p'
```

## 6) Emergency rollback (temporary fallback re-enable)

```bash
cp /root/openclaw-stock-home/.openclaw/var/rollback/10-websearch-guard.conf.bak /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
systemctl --user start openclaw-ops-maintenance.service
cat /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md
```

Rollback success indicator:
- `runtime_patch_fallback: enabled`

## 7) Return to policy-only mode (post-incident)

```bash
rm -f /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
systemctl --user start openclaw-ops-maintenance.service
cat /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md
```

