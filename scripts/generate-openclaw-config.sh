#!/usr/bin/env bash
set -euo pipefail

# Generates scripts/openclaw-config.json from environment variables.
# This avoids committing credentials while preserving the expected config shape.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_FILE="${SCRIPT_DIR}/openclaw-config.json"

OPENCLAW_GATEWAY_MODE="${OPENCLAW_GATEWAY_MODE:-local}"
OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-18789}"
OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-}"

if [[ -z "${OPENCLAW_GATEWAY_TOKEN}" ]]; then
  echo "Error: OPENCLAW_GATEWAY_TOKEN is required." >&2
  echo "Set it in your shell or .env.local, then run again." >&2
  exit 1
fi

cat > "${OUT_FILE}" <<EOF
{
  "gateway": {
    "mode": "${OPENCLAW_GATEWAY_MODE}",
    "port": ${OPENCLAW_GATEWAY_PORT},
    "auth": {
      "token": "${OPENCLAW_GATEWAY_TOKEN}"
    }
  }
}
EOF

chmod 600 "${OUT_FILE}"
echo "Generated ${OUT_FILE} with restricted permissions."
