#!/usr/bin/env bash
# Restore cloud bot identity (Naima/Vidar) on Linode after deploy overwrites workspace files.
# Called by deploy-workspace-to-linode.sh; can also run standalone: ./scripts/linode-restore-identity.sh
set -euo pipefail

REMOTE_WORKSPACE="${REMOTE_WORKSPACE:-/root/openclaw-stock-home/.openclaw/workspace}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_linode}"
SSH_HOST="${SSH_HOST:-root@45.79.135.101}"
RSYNC_SSH="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o ConnectTimeout=5"

# Restore IDENTITY.md if Naima missing
restore_identity() {
  $RSYNC_SSH "$SSH_HOST" "grep -q Naima $REMOTE_WORKSPACE/IDENTITY.md 2>/dev/null || cat > $REMOTE_WORKSPACE/IDENTITY.md << 'IDEOF'
# IDENTITY.md - Who Am I?

- **Name:** Naima
- **Creature:** AI assistant
- **Vibe:** Warm, resourceful, direct
- **Emoji:** 🦞
- **Avatar:** (none set)

---

_Name given by Vidar on 2026-02-21._
IDEOF"
}

# Append SOUL.md identity section if Naima missing
restore_soul() {
  $RSYNC_SSH "$SSH_HOST" "grep -q Naima $REMOTE_WORKSPACE/SOUL.md 2>/dev/null || printf '\n## Identity\n\n**Your name is Naima.** Given by Vidar on 2026-02-21. **The human you assist is Vidar.**\n' >> $REMOTE_WORKSPACE/SOUL.md"
}

# Set Vidar in USER.md if missing
restore_user() {
  $RSYNC_SSH "$SSH_HOST" "grep -q Vidar $REMOTE_WORKSPACE/USER.md 2>/dev/null || sed -i 's/^- \*\*Name:\*\*$/& Vidar/' $REMOTE_WORKSPACE/USER.md"
}

# Prepend MEMORY.md identity block if Naima missing in first 20 lines
restore_memory() {
  local block=$'\n## Identity (always keep)\n\n- **My name:** Naima\n- **Human:** Vidar\n- **Web search:** exec + mcporter perplexity_ask with messages array.\n\n'
  $RSYNC_SSH "$SSH_HOST" "head -20 $REMOTE_WORKSPACE/MEMORY.md | grep -q Naima || python3 -c \"
with open('$REMOTE_WORKSPACE/MEMORY.md') as f: lines = f.readlines()
lines.insert(1, '''$block''')
with open('$REMOTE_WORKSPACE/MEMORY.md', 'w') as f: f.writelines(lines)
\""
}

restore_identity
restore_soul
restore_user
restore_memory
