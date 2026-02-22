#!/usr/bin/env bash
set -euo pipefail

# One-command post-upgrade safety check for Linode cloud routing.
# Defaults target the current Linode host/key; override with env vars if needed.

HOST="${HOST:-root@45.79.135.101}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_linode}"
LOCAL="${LOCAL:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "${LOCAL}" == "1" ]]; then
  python3 "${SCRIPT_DIR}/check-cloud-search-routing.py" --local
elif [[ ! -f "${SSH_KEY}" && -d "/root/openclaw-stock-home/.openclaw" ]]; then
  # Running directly on Linode host with no local SSH key available.
  python3 "${SCRIPT_DIR}/check-cloud-search-routing.py" --local
else
  python3 "${SCRIPT_DIR}/check-cloud-search-routing.py" \
    --host "${HOST}" \
    --ssh-key "${SSH_KEY}"
fi
