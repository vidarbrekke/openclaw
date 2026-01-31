#!/usr/bin/env bash
# Start the OpenClaw Session Proxy
# Usage: ./start-session-proxy.sh

GATEWAY_URL="${GATEWAY_URL:-http://127.0.0.1:18789}"
PROXY_PORT="${PROXY_PORT:-3010}"

echo "Starting OpenClaw Session Proxy..."
echo "  Gateway: $GATEWAY_URL"
echo "  Proxy port: $PROXY_PORT"
echo ""

cd "$(dirname "$0")"
GATEWAY_URL="$GATEWAY_URL" PROXY_PORT="$PROXY_PORT" node openclaw-session-proxy.js
