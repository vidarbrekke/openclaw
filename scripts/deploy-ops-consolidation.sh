#!/usr/bin/env bash
set -euo pipefail

SSH="ssh -i ~/.ssh/id_ed25519_linode -o IdentitiesOnly=yes root@45.79.135.101"
SCP="scp -i ~/.ssh/id_ed25519_linode -o IdentitiesOnly=yes"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Step 1: Deploy scripts ==="
$SCP "$SCRIPT_DIR/ops-maintenance.py" root@45.79.135.101:/root/.openclaw/scripts/ops-maintenance.py
$SCP "$SCRIPT_DIR/enforce-websearch-guard.py" root@45.79.135.101:/root/.openclaw/scripts/enforce-websearch-guard.py
$SSH 'chmod +x /root/.openclaw/scripts/ops-maintenance.py /root/.openclaw/scripts/enforce-websearch-guard.py'

echo "=== Step 2: Deploy skills ==="
$SSH 'mkdir -p /root/.openclaw/skills/skill-scanner /root/.openclaw/skills/runtime-guard-policy'
$SCP "$REPO_DIR/skills/ops-guard-SKILL.md" root@45.79.135.101:/root/.openclaw/skills/ops-guard/SKILL.md
$SCP "$REPO_DIR/skills/skill-scanner-SKILL.md" root@45.79.135.101:/root/.openclaw/skills/skill-scanner/SKILL.md
$SCP "$REPO_DIR/skills/runtime-guard-policy-SKILL.md" root@45.79.135.101:/root/.openclaw/skills/runtime-guard-policy/SKILL.md

echo "=== Step 3: Create consolidated systemd units ==="
$SSH 'cat > /root/.config/systemd/user/openclaw-ops-maintenance.service <<EOF
[Unit]
Description=OpenClaw consolidated ops maintenance (guards, invariants, cooldown, reporting)
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /root/.openclaw/scripts/ops-maintenance.py
EOF'

$SSH 'cat > /root/.config/systemd/user/openclaw-ops-maintenance.timer <<EOF
[Unit]
Description=Run OpenClaw ops maintenance every 15 min

[Timer]
OnBootSec=2m
OnUnitActiveSec=15m
Persistent=true

[Install]
WantedBy=timers.target
EOF'

echo "=== Step 4: Create state directories ==="
$SSH 'mkdir -p /root/.openclaw/var/ops-state /root/.openclaw/logs'

echo "=== Step 5: Stop and disable old timers ==="
$SSH 'systemctl --user stop openclaw-ops-guard-status.timer 2>/dev/null || true'
$SSH 'systemctl --user disable openclaw-ops-guard-status.timer 2>/dev/null || true'
$SSH 'systemctl --user stop openclaw-cooldown-report.timer 2>/dev/null || true'
$SSH 'systemctl --user disable openclaw-cooldown-report.timer 2>/dev/null || true'
$SSH 'systemctl --user stop openclaw-workspace-invariants.timer 2>/dev/null || true'
$SSH 'systemctl --user disable openclaw-workspace-invariants.timer 2>/dev/null || true'
$SSH 'systemctl --user stop openclaw-websearch-guard.timer 2>/dev/null || true'
$SSH 'systemctl --user disable openclaw-websearch-guard.timer 2>/dev/null || true'

echo "=== Step 6: Enable and start new consolidated timer ==="
$SSH 'systemctl --user daemon-reload'
$SSH 'systemctl --user enable openclaw-ops-maintenance.timer'
$SSH 'systemctl --user start openclaw-ops-maintenance.timer'

echo "=== Step 7: Run initial maintenance cycle ==="
$SSH 'systemctl --user start openclaw-ops-maintenance.service'

echo "=== Step 8: Verify ==="
$SSH 'systemctl --user list-timers --all | grep -E "openclaw|skill"'
echo ""
echo "=== Combined report ==="
$SSH 'cat /root/.openclaw/workspace/memory/ops-combined-report.md 2>/dev/null || echo "Report not yet generated"'

echo ""
echo "=== Done ==="
