#!/usr/bin/env bash
# Sync clawd repo to Linode workspace so OpenClaw finds AGENTS.md, docs, config, etc.
# Run from repo root: ./scripts/deploy-workspace-to-linode.sh
# Does not overwrite server-only files (e.g. config/mcporter.json with server paths).
set -euo pipefail

REMOTE_OPENCLAW="/root/openclaw-stock-home/.openclaw"
REMOTE_WORKSPACE="$REMOTE_OPENCLAW/workspace"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_linode}"
SSH_HOST="${SSH_HOST:-root@45.79.135.101}"
RSYNC_SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

echo "=== Syncing clawd workspace to Linode ($SSH_HOST) ==="
$RSYNC_SSH "$SSH_HOST" "mkdir -p $REMOTE_WORKSPACE"

rsync -avz --no-perms --no-owner --no-group \
  -e "$RSYNC_SSH" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.env' \
  --exclude='.env.*' \
  --exclude='*.log' \
  --exclude='sandnes-swatch-automation/backups' \
  --exclude='sandnes-swatch-automation/data' \
  --exclude='.DS_Store' \
  --exclude='test-results' \
  --exclude='config/mcporter.json' \
  . "$SSH_HOST:$REMOTE_WORKSPACE/"

echo "=== Creating repositories dir if missing ==="
$RSYNC_SSH "$SSH_HOST" "mkdir -p $REMOTE_WORKSPACE/repositories $REMOTE_WORKSPACE/memory"

echo "=== If server has no mcporter.json, copy from linode example ==="
$RSYNC_SSH "$SSH_HOST" "test -f $REMOTE_WORKSPACE/config/mcporter.json || ( test -f $REMOTE_WORKSPACE/config/mcporter.linode.example.json && cp $REMOTE_WORKSPACE/config/mcporter.linode.example.json $REMOTE_WORKSPACE/config/mcporter.json ) || true"

echo "=== Restore cloud identity (Naima/Vidar) after rsync overwrite ==="
"$SCRIPT_DIR/linode-restore-identity.sh" 2>/dev/null || true

echo "=== Install perplexity-search wrapper on Linode ==="
$RSYNC_SSH "$SSH_HOST" "install -m 0755 $REMOTE_WORKSPACE/scripts/perplexity-search.sh /usr/local/bin/perplexity-search" || true

echo "=== Install GitHub repo verification helper on Linode ==="
$RSYNC_SSH "$SSH_HOST" "install -m 0755 $REMOTE_WORKSPACE/scripts/clawd-verify-github-repo.sh /usr/local/bin/clawd-verify-github-repo" || true

echo "=== Install git repo discovery helper on Linode ==="
$RSYNC_SSH "$SSH_HOST" "install -m 0755 $REMOTE_WORKSPACE/scripts/clawd-find-git-repos.sh /usr/local/bin/clawd-find-git-repos" || true

echo "=== Done. Workspace at $REMOTE_WORKSPACE ==="
