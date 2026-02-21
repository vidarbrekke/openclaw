#!/usr/bin/env bash
# Restore Perplexity web search on Linode: merge tools.web.search into openclaw.json
# and create .env with PERPLEXITY_API_KEY. Restarts the gateway.
# Run from repo root. Pass key via env: PERPLEXITY_API_KEY=pplx-xxx ./scripts/restore-perplexity-linode.sh
# If PERPLEXITY_API_KEY is not set, .env is created with a placeholder; replace it and restart gateway.
set -euo pipefail

REMOTE_OPENCLAW="/root/openclaw-stock-home/.openclaw"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_linode}"
SSH_HOST="${SSH_HOST:-root@45.79.135.101}"
SSH_CMD="ssh -i $SSH_KEY -o IdentitiesOnly=yes $SSH_HOST"

echo "=== Restore Perplexity on Linode ($SSH_HOST) ==="

# 1) Backup openclaw.json
$SSH_CMD "cp $REMOTE_OPENCLAW/openclaw.json $REMOTE_OPENCLAW/openclaw.json.bak.perplexity-\$(date +%Y%m%d-%H%M%S) 2>/dev/null || true"

# 2) Merge tools.web.search (Perplexity) into openclaw.json
$SSH_CMD "node -e \"
const fs = require('fs');
const path = '$REMOTE_OPENCLAW/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
cfg.tools = cfg.tools || {};
cfg.tools.web = cfg.tools.web || {};
cfg.tools.web.search = {
  provider: 'perplexity',
  perplexity: {
    baseUrl: 'https://api.perplexity.ai',
    model: 'perplexity/sonar-pro'  // default: sonar-pro
  }
};
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log('Updated tools.web.search to use Perplexity.');
\""

# 3) Create .env with PERPLEXITY_API_KEY
if [[ -n "${PERPLEXITY_API_KEY:-}" ]]; then
  # Escape single quotes in key for safe remote use
  SAFE_KEY=$(printf '%s' "$PERPLEXITY_API_KEY" | sed "s/'/'\\\\''/g")
  $SSH_CMD "printf 'PERPLEXITY_API_KEY=%s\n' '$SAFE_KEY' > $REMOTE_OPENCLAW/.env && chmod 600 $REMOTE_OPENCLAW/.env && echo 'Wrote .env with PERPLEXITY_API_KEY.'"
else
  $SSH_CMD "echo 'PERPLEXITY_API_KEY=REPLACE_WITH_YOUR_PERPLEXITY_KEY' > $REMOTE_OPENCLAW/.env && chmod 600 $REMOTE_OPENCLAW/.env"
  echo "--- No PERPLEXITY_API_KEY in env: .env created with placeholder. Edit $REMOTE_OPENCLAW/.env on the server and restart the gateway."
fi

# 4) Restart gateway
$SSH_CMD "systemctl --user restart openclaw-gateway.service 2>/dev/null || true"
echo "=== Gateway restart requested. Verify: ssh $SSH_HOST 'journalctl --user -u openclaw-gateway.service -n 20' ==="
