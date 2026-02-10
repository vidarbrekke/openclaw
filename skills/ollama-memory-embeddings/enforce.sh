#!/usr/bin/env bash
# Enforce OpenClaw memorySearch to use Ollama embeddings settings.
# Idempotent: safe to run repeatedly.
set -euo pipefail

MODEL=""
BASE_URL="http://127.0.0.1:11434/v1/"
CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${HOME}/.openclaw/openclaw.json}"
CHECK_ONLY=0
QUIET=0
RESTART_ON_CHANGE=0

usage() {
  cat <<'EOF'
Usage:
  enforce.sh [options]

Options:
  --model <id>              embedding model id (required unless already in config)
  --base-url <url>          Ollama OpenAI-compatible base URL (default: http://127.0.0.1:11434/v1/)
  --openclaw-config <path>  OpenClaw config path (default: ~/.openclaw/openclaw.json)
  --check-only              exit non-zero if drift is detected, do not modify config
  --restart-on-change       restart gateway if config was changed
  --quiet                   suppress non-error output
  --help                    show help

Exit codes:
  0  success (no drift or drift healed)
  10 drift detected in --check-only mode
  1  error
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --model) MODEL="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --openclaw-config) CONFIG_PATH="$2"; shift 2 ;;
    --check-only) CHECK_ONLY=1; shift ;;
    --restart-on-change) RESTART_ON_CHANGE=1; shift ;;
    --quiet) QUIET=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() {
  [ "$QUIET" -eq 1 ] || echo "$@"
}

normalize_model() {
  local m="$1"
  if [[ "$m" != *:* ]]; then
    echo "${m}:latest"
  else
    echo "$m"
  fi
}

normalize_base_url() {
  local u="${1%/}"
  if [[ "$u" != */v1 ]]; then
    u="${u}/v1"
  fi
  echo "${u}/"
}

restart_gateway() {
  if ! command -v openclaw >/dev/null 2>&1; then
    log "NOTE: openclaw CLI not found; skip restart."
    return 0
  fi
  if openclaw gateway restart 2>/dev/null; then
    log "Gateway restarted."
    return 0
  fi
  log "WARNING: openclaw gateway restart failed; restart manually."
  return 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: '$1' not found in PATH."
    exit 1
  }
}

require_cmd node

mkdir -p "$(dirname "$CONFIG_PATH")"
[ -f "$CONFIG_PATH" ] || echo "{}" > "$CONFIG_PATH"

BASE_URL_NORM="$(normalize_base_url "$BASE_URL")"

# If model omitted, try current config model; otherwise enforce requires explicit model.
if [ -z "$MODEL" ]; then
  MODEL="$(node -e '
const fs=require("fs");
const p=process.argv[1];
try {
  const cfg=JSON.parse(fs.readFileSync(p,"utf8"));
  const m=cfg?.agents?.defaults?.memorySearch?.model||"";
  process.stdout.write(m);
} catch (_) {}
' "$CONFIG_PATH")"
fi

if [ -z "$MODEL" ]; then
  echo "ERROR: no model provided and no existing memorySearch.model in config."
  exit 1
fi
MODEL_NORM="$(normalize_model "$MODEL")"

export CONFIG_PATH MODEL_NORM BASE_URL_NORM
if [ "$CHECK_ONLY" -eq 1 ]; then
  set +e
  node <<'EOF'
const fs = require("fs");
const p = process.env.CONFIG_PATH;
const model = process.env.MODEL_NORM;
const base = process.env.BASE_URL_NORM;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(p, "utf8")); } catch { process.exit(10); }
const ms = cfg?.agents?.defaults?.memorySearch || {};
const drift =
  ms.provider !== "openai" ||
  (ms.model || "") !== model ||
  (ms?.remote?.baseUrl || "") !== base ||
  (ms?.remote?.apiKey || "") !== "ollama";
process.exit(drift ? 10 : 0);
EOF
  status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    log "No drift detected."
    exit 0
  elif [ "$status" -eq 10 ]; then
    log "Drift detected."
    exit 10
  else
    echo "ERROR: drift check failed."
    exit 1
  fi
fi

BACKUP_PATH="${CONFIG_PATH}.bak.$(date -u +%Y-%m-%dT%H-%M-%SZ)"
cp "$CONFIG_PATH" "$BACKUP_PATH"

set +e
APPLY_OUT="$(node <<'EOF'
const fs = require("fs");
const path = process.env.CONFIG_PATH;
const model = process.env.MODEL_NORM;
const base = process.env.BASE_URL_NORM;
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path, "utf8")); } catch (_) { cfg = {}; }
const before = JSON.stringify(cfg?.agents?.defaults?.memorySearch || {});

cfg.agents = cfg.agents || {};
cfg.agents.defaults = cfg.agents.defaults || {};
cfg.agents.defaults.memorySearch = cfg.agents.defaults.memorySearch || {};
cfg.agents.defaults.memorySearch.provider = "openai";
cfg.agents.defaults.memorySearch.model = model;
cfg.agents.defaults.memorySearch.remote = cfg.agents.defaults.memorySearch.remote || {};
cfg.agents.defaults.memorySearch.remote.baseUrl = base;
cfg.agents.defaults.memorySearch.remote.apiKey = "ollama";

const afterObj = cfg.agents.defaults.memorySearch;
const after = JSON.stringify(afterObj);
const changed = before !== after;
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log(changed ? "changed" : "unchanged");
console.log(afterObj.provider || "");
console.log(afterObj.model || "");
console.log((afterObj.remote && afterObj.remote.baseUrl) || "");
EOF
)"
status=$?
set -e

if [ "$status" -ne 0 ]; then
  echo "ERROR: failed to enforce memorySearch settings."
  exit 1
fi

CHANGED="$(printf "%s\n" "$APPLY_OUT" | sed -n '1p')"
PROVIDER_NOW="$(printf "%s\n" "$APPLY_OUT" | sed -n '2p')"
MODEL_NOW="$(printf "%s\n" "$APPLY_OUT" | sed -n '3p')"
BASE_NOW="$(printf "%s\n" "$APPLY_OUT" | sed -n '4p')"

log "Config: ${CONFIG_PATH}"
log "Backup: ${BACKUP_PATH}"
log "provider=${PROVIDER_NOW}"
log "model=${MODEL_NOW}"
log "baseUrl=${BASE_NOW}"

if [ "$CHANGED" = "changed" ]; then
  log "Drift healed: memorySearch settings updated."
  if [ "$RESTART_ON_CHANGE" -eq 1 ]; then
    restart_gateway || true
  fi
else
  log "No changes required."
fi
