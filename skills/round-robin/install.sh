#!/usr/bin/env bash
# Self-contained installer for the round-robin model rotation skill.
# Run from anywhere:  bash /path/to/skills/round-robin/install.sh
set -e

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_DIR="${HOME}/.openclaw"
SKILLS_DIR="${OPENCLAW_DIR}/skills/round-robin"
MODULES_DIR="${OPENCLAW_DIR}/modules"
CONFIG_FILE="${OPENCLAW_DIR}/round-robin-models.json"

DEFAULT_MODELS='["openrouter/qwen/qwen3-coder-plus","openrouter/moonshotai/kimi-k2.5","openrouter/google/gemini-2.5-flash","openrouter/anthropic/claude-haiku-4.5","openrouter/openai/gpt-5.2-codex"]'

echo "Installing round-robin model rotation..."
echo ""

# 1. Install the agent skill (SKILL.md + docs)
echo "1. Agent skill → ${SKILLS_DIR}/"
mkdir -p "$SKILLS_DIR"
cp "$SKILL_DIR/SKILL.md" "$SKILLS_DIR/"
cp "$SKILL_DIR/README.md" "$SKILLS_DIR/"
cp "$SKILL_DIR/USAGE.md" "$SKILLS_DIR/"

# 2. Install the core module (proxy loads this at runtime)
echo "2. Core module → ${MODULES_DIR}/model-round-robin.js"
mkdir -p "$MODULES_DIR"
cp "$SKILL_DIR/model-round-robin.js" "$MODULES_DIR/"

# 3. Install the standalone proxy (optional, for use without session proxy)
echo "3. Standalone proxy → ${MODULES_DIR}/model-round-robin-proxy.js"
cp "$SKILL_DIR/model-round-robin-proxy.js" "$MODULES_DIR/"

# 4. Create default config if missing
if [ ! -f "$CONFIG_FILE" ]; then
  echo "4. Config created → ${CONFIG_FILE}"
  echo "{\"models\": $DEFAULT_MODELS}" > "$CONFIG_FILE"
else
  echo "4. Config exists → ${CONFIG_FILE} (unchanged)"
fi

echo ""
echo "Done. Round-robin is now installed."
echo ""
echo "How it works:"
echo "  - The session proxy auto-loads the module on startup."
echo "  - Every prompt rotates through the model list."
echo "  - Use /model <id> to pin a model, /round-robin to resume rotation."
echo ""
echo "To start:"
echo "  ./start-session-proxy.sh"
echo "  Open http://127.0.0.1:3010/new"
echo ""
echo "To edit models:"
echo "  Edit ${CONFIG_FILE}"
echo "  Or ask the agent: 'Edit round-robin'"
echo ""
echo "To disable:"
echo "  ROUND_ROBIN_MODELS=off ./start-session-proxy.sh"
echo ""
echo "To uninstall:"
echo "  rm -rf ${SKILLS_DIR} ${MODULES_DIR}/model-round-robin.js ${MODULES_DIR}/model-round-robin-proxy.js ${CONFIG_FILE}"
