#!/usr/bin/env bash
# Install round-robin skill and optional config. Run from the clawd repo root.
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCLAW_SKILLS="${HOME}/.openclaw/skills"
OPENCLAW_DIR="${HOME}/.openclaw"
CONFIG_FILE="${OPENCLAW_DIR}/round-robin-models.json"

DEFAULT_MODELS='["openrouter/qwen/qwen3-coder-plus","openrouter/moonshotai/kimi-k2.5","openrouter/google/gemini-2.5-flash","openrouter/anthropic/claude-haiku-4.5","openrouter/openai/gpt-5.2-codex"]'

echo "Installing round-robin skill..."
mkdir -p "$OPENCLAW_SKILLS"
cp -r "${SCRIPT_DIR}/skills/round-robin" "$OPENCLAW_SKILLS/"
echo "  -> ${OPENCLAW_SKILLS}/round-robin/"

if [ ! -f "$CONFIG_FILE" ]; then
  mkdir -p "$OPENCLAW_DIR"
  echo "{\"models\": $DEFAULT_MODELS}" > "$CONFIG_FILE"
  echo "Created config: $CONFIG_FILE"
else
  echo "Config exists: $CONFIG_FILE (unchanged)"
fi

echo ""
echo "Next steps:"
echo "  1. Start session proxy (round-robin is on by default): $SCRIPT_DIR/start-session-proxy.sh"
echo "  2. Restart OpenClaw gateway if running: openclaw gateway stop && openclaw gateway"
echo "  3. Open http://127.0.0.1:3010/new"
echo ""
echo "Test: Ask 'What models are in round-robin?' or 'Edit round-robin'"
