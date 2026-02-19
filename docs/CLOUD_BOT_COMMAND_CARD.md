# Cloud Bot Command Card (policy-only mode + emergency rollback)

Use from SSH on the Linode. Do not run these from chat/agent exec.

## 1) Fast health check

```bash
systemctl --user status openclaw-gateway.service --no-pager -n 40
journalctl --user -u openclaw-gateway.service --since "15 minutes ago" --no-pager
cat /root/.openclaw/workspace/memory/ops-combined-report.md
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

## 4) Verify no read/cooldown storm

```bash
journalctl --user -u openclaw-gateway.service --since "20 minutes ago" --no-pager | sed -n '/read failed: ENOENT/p;/all in cooldown or unavailable/p;/LLM request timed out/p'
```

## 5) Emergency rollback (temporary fallback re-enable)

```bash
cp /root/.openclaw/var/rollback/10-websearch-guard.conf.bak /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
systemctl --user start openclaw-ops-maintenance.service
cat /root/.openclaw/workspace/memory/ops-combined-report.md
```

Rollback success indicator:
- `runtime_patch_fallback: enabled`

## 6) Return to policy-only mode (post-incident)

```bash
rm -f /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
systemctl --user daemon-reload
systemctl --user restart openclaw-gateway.service
systemctl --user start openclaw-ops-maintenance.service
cat /root/.openclaw/workspace/memory/ops-combined-report.md
```

