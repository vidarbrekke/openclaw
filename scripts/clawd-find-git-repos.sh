#!/usr/bin/env bash
set -euo pipefail

BASE="${1:-/root/openclaw-stock-home/.openclaw/workspace/repositories}"
PATTERN="${2:-}"

if [ ! -d "$BASE" ]; then
  echo "ERROR: base path is not a directory: $BASE" >&2
  exit 2
fi

if [ -n "$PATTERN" ]; then
  find -L "$BASE" -type d -name ".git" | sed 's|/.git$||' | grep -i "$PATTERN" || true
else
  find -L "$BASE" -type d -name ".git" | sed 's|/.git$||' || true
fi
