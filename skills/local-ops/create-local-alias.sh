#!/usr/bin/env bash
# Create/update the OpenClaw model alias "local" based on the most recently
# updated/downloaded Ollama model (via Ollama tags API).
#
# Override with:
#   LOCAL_ALIAS=local
#   OLLAMA_URL=http://127.0.0.1:11434
#   OPENCLAW_MODEL=ollama/your-model
#
# If OPENCLAW_MODEL is provided, it is used directly.

set -e

LOCAL_ALIAS="${LOCAL_ALIAS:-local}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
OPENCLAW_MODEL="${OPENCLAW_MODEL:-}"

if [ -z "$OPENCLAW_MODEL" ]; then
  OPENCLAW_MODEL="$(
    node -e '
      const http = require("http");
      const url = require("url");
      const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
      const parsed = new URL(base);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: "/api/tags",
        method: "GET",
        timeout: 5000
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const models = body.models || [];
            if (models.length === 0) process.exit(1);
            // Pick most recently modified
            models.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
            const name = models[0].name;
            if (!name) process.exit(1);
            console.log("ollama/" + name);
          } catch (_) {
            process.exit(1);
          }
        });
      });
      req.on("error", () => process.exit(1));
      req.on("timeout", () => { req.destroy(); process.exit(1); });
      req.end();
    ' 2>/dev/null
  )"
fi

if [ -z "$OPENCLAW_MODEL" ]; then
  echo "ERROR: Could not determine an Ollama model."
  echo "Set OPENCLAW_MODEL=ollama/<model> and re-run."
  exit 1
fi

echo "Setting alias '${LOCAL_ALIAS}' → ${OPENCLAW_MODEL}"
openclaw models aliases add "$LOCAL_ALIAS" "$OPENCLAW_MODEL"

# Ensure Ollama is enabled so /model local is allowed (env.OLLAMA_API_KEY enables auto-discovery)
echo "Enabling Ollama provider (env.OLLAMA_API_KEY)"
openclaw config set env.OLLAMA_API_KEY "ollama-local" 2>/dev/null || true

# Add model to agents.defaults.models and ollama to models.providers so gateway allowlist permits it
echo "Adding ${OPENCLAW_MODEL} to allowlist and ensuring ollama provider"
OPENCLAW_CFG="${OPENCLAW_HOME:-$HOME/.openclaw}/openclaw.json"
export OPENCLAW_CFG OPENCLAW_MODEL LOCAL_ALIAS
node -e "
  const fs = require('fs');
  const cfgPath = process.env.OPENCLAW_CFG;
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  cfg.agents = cfg.agents || {};
  cfg.agents.defaults = cfg.agents.defaults || {};
  cfg.agents.defaults.models = cfg.agents.defaults.models || {};
  const modelKey = process.env.OPENCLAW_MODEL;
  const alias = process.env.LOCAL_ALIAS;
  for (const key of Object.keys(cfg.agents.defaults.models)) {
    const entry = cfg.agents.defaults.models[key];
    if (entry && entry.alias === alias && key !== modelKey) delete cfg.agents.defaults.models[key];
  }
  cfg.agents.defaults.models[modelKey] = { alias };
  cfg.models = cfg.models || {};
  cfg.models.providers = cfg.models.providers || {};
  if (!cfg.models.providers.ollama) {
    cfg.models.providers.ollama = { baseUrl: 'http://localhost:11434/v1', models: [] };
  }
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
"

echo "Done. Restart the gateway to apply."
