#!/usr/bin/env bash
# Install the local-ops skill and configure alias-based housekeeping.
# Run: bash skills/local-ops/install.sh
set -e

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${HOME}/.openclaw"
SKILLS_DIR="${OPENCLAW_DIR}/skills/local-ops"
WORKSPACE_DIR="${OPENCLAW_DIR}/workspace-local-ops"
LOCAL_ALIAS="${LOCAL_ALIAS:-local}"

echo "Installing local-ops..."
echo ""

# 1. Copy skill files
echo "1. Skill → ${SKILLS_DIR}/"
mkdir -p "$SKILLS_DIR"
for f in SKILL.md install.sh create-local-alias.sh; do
  [ -f "$SKILL_DIR/$f" ] && cp "$SKILL_DIR/$f" "$SKILLS_DIR/" 2>/dev/null
done
chmod +x "$SKILLS_DIR/install.sh" 2>/dev/null
chmod +x "$SKILLS_DIR/create-local-alias.sh" 2>/dev/null

# 2. Create workspace
echo "2. Workspace → ${WORKSPACE_DIR}/"
mkdir -p "$WORKSPACE_DIR"

# 3. Create agent (idempotent)
if openclaw agents list 2>/dev/null | grep -q "local-ops"; then
  echo "3. Agent already exists — skipping"
else
  echo "3. Creating agent via CLI..."
  openclaw agents add local-ops \
    --model "$LOCAL_ALIAS" \
    --workspace "$WORKSPACE_DIR" \
    --non-interactive 2>/dev/null
fi

# 4. Set sub-agent default model to alias
echo "4. Setting subagents.model → ${LOCAL_ALIAS}"
openclaw config set agents.defaults.subagents.model "$LOCAL_ALIAS" 2>/dev/null

echo "5. Ensuring alias '${LOCAL_ALIAS}' is configured"
if command -v node >/dev/null 2>&1 && command -v openclaw >/dev/null 2>&1; then
  set +e
  "${SKILLS_DIR}/create-local-alias.sh" >/dev/null 2>&1
  STATUS=$?
  set -e
  if [ "$STATUS" -ne 0 ]; then
    echo "   Skipped (Ollama not reachable or no local models found)"
  else
    echo "   Alias configured"
  fi
else
  echo "   Skipped (node/openclaw not available in PATH)"
fi

echo ""
echo "Done. local-ops agent is ready."
echo ""
echo "  Agent:     local-ops (model alias: ${LOCAL_ALIAS})"
echo "  Workspace: ${WORKSPACE_DIR}"
echo "  Delegate:  sessions_spawn({ task: '...', agentId: 'local-ops' })"
echo ""
echo "  Ensure alias '${LOCAL_ALIAS}' is defined in OpenClaw models."
echo "  Helper:    ${SKILLS_DIR}/create-local-alias.sh"
echo "  Restart gateway to apply: openclaw gateway restart"
