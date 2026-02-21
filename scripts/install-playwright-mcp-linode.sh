#!/usr/bin/env bash
# Install Playwright MCP and Chromium on the Linode (or any Ubuntu/Debian headless server).
# Run as root on the server. After this, add mcp.servers.playwright to openclaw.json and restart the gateway.
set -e

PLAYWRIGHT_MCP_DIR="${PLAYWRIGHT_MCP_DIR:-/root/openclaw-stock-home/.openclaw/playwright-mcp}"
echo "Installing Playwright MCP to $PLAYWRIGHT_MCP_DIR ..."

mkdir -p "$PLAYWRIGHT_MCP_DIR"
cd "$PLAYWRIGHT_MCP_DIR"

# Use npm (openclaw typically runs with system node)
if ! command -v npm &>/dev/null; then
  echo "npm not found. Install Node.js/npm first."
  exit 1
fi

npm init -y
npm install @playwright/mcp@latest

# Install Chromium and system deps for headless run
npx playwright install chromium
npx playwright install-deps chromium || true

# Entry point: package uses exports "." -> index.js (no dist/)
PKG_DIR="$PLAYWRIGHT_MCP_DIR/node_modules/@playwright/mcp"
ENTRY="$PKG_DIR/index.js"
if [[ ! -f "$ENTRY" ]]; then
  ENTRY="$PKG_DIR/cli.js"
fi
if [[ ! -f "$ENTRY" ]]; then
  echo "Entry point not found under $PKG_DIR"
  exit 1
fi
echo "$ENTRY" > "$PLAYWRIGHT_MCP_DIR/entry.txt"
echo "Playwright MCP entry: $ENTRY"

echo "Done. Add to openclaw.json mcp.servers.playwright:"
echo "  \"command\": \"node\", \"args\": [\"$ENTRY\"]"
echo "Then restart the gateway: systemctl --user restart openclaw-gateway.service"
