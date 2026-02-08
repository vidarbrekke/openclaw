#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="${SKILL_DIR}/.venv"
PY="${VENV_DIR}/bin/python"

if [[ ! -x "$PY" ]]; then
  python3 -m venv "$VENV_DIR"
fi

"$PY" -m pip install --upgrade pip >/dev/null
"$PY" -m pip install --upgrade requests beautifulsoup4 lxml >/dev/null

echo "$PY"
