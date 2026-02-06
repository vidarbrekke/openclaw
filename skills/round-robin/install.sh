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

# 1. Install the agent skill (SKILL.md + docs + install.sh + JS for self-heal)
echo "1. Agent skill → ${SKILLS_DIR}/"
mkdir -p "$SKILLS_DIR"
set +e
for f in SKILL.md README.md install.sh model-round-robin.js model-round-robin-proxy.js; do
  [ -f "$SKILL_DIR/$f" ] && cp "$SKILL_DIR/$f" "$SKILLS_DIR/" 2>/dev/null
done
set -e
chmod +x "$SKILLS_DIR/install.sh"

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

# 5. Find the clawd repo (contains start-session-proxy.sh + openclaw-session-proxy.js)
PROXY_PORT="${PROXY_PORT:-3010}"
REPO_DIR=""
# Try: parent of skill dir, then common locations
for candidate in \
  "$(cd "$SKILL_DIR/../.." 2>/dev/null && pwd)" \
  "$HOME/Dev/CursorApps/clawd" \
  "$HOME/clawd"; do
  if [ -f "$candidate/openclaw-session-proxy.js" ]; then
    REPO_DIR="$candidate"
    break
  fi
done

# 6. Start the session proxy (kill existing, start fresh)
if [ -n "$REPO_DIR" ]; then
  echo ""
  echo "5. Starting session proxy..."
  # Kill any existing process on the proxy port
  EXISTING_PID=$(lsof -ti :${PROXY_PORT} 2>/dev/null | grep -v "^$" | head -1)
  if [ -n "$EXISTING_PID" ]; then
    kill "$EXISTING_PID" 2>/dev/null
    sleep 1
    echo "   Stopped previous proxy (PID $EXISTING_PID)"
  fi
  # Start proxy in background
  cd "$REPO_DIR"
  nohup bash start-session-proxy.sh > /tmp/openclaw-proxy.log 2>&1 &
  PROXY_PID=$!
  sleep 1
  if lsof -ti :${PROXY_PORT} >/dev/null 2>&1; then
    echo "   Proxy running on port ${PROXY_PORT} (PID $PROXY_PID)"
    echo "   Logs: /tmp/openclaw-proxy.log"
  else
    echo "   WARNING: Proxy failed to start. Check /tmp/openclaw-proxy.log"
  fi
else
  echo ""
  echo "5. Could not find openclaw-session-proxy.js — skipping proxy start."
  echo "   Start manually: ./start-session-proxy.sh"
fi

echo ""
echo "Done. Round-robin is now installed and active."
echo ""
echo "  Open: http://127.0.0.1:${PROXY_PORT}/new"
echo "  Models rotate on every prompt."
echo "  Use /model <id> to pin a model, /round-robin to resume rotation."
echo ""
echo "  Edit models: ${CONFIG_FILE}"
echo "  Disable:     ROUND_ROBIN_MODELS=off ./start-session-proxy.sh"
echo "  Uninstall:   rm -rf ${SKILLS_DIR} ${MODULES_DIR}/model-round-robin.js ${MODULES_DIR}/model-round-robin-proxy.js ${CONFIG_FILE}"
