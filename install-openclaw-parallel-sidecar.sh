#!/usr/bin/env bash
set -euo pipefail

OS_NAME="$(uname -s)"
case "$OS_NAME" in
  MINGW*|MSYS*|CYGWIN*)
    if command -v powershell.exe >/dev/null 2>&1; then
      SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
      powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/install-openclaw-parallel-sidecar.ps1"
      exit 0
    fi
    echo "Windows detected but powershell.exe not found."
    echo "Run install-openclaw-parallel-sidecar.ps1 manually."
    exit 1
    ;;
esac

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node 18+ and retry."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node 18+ (includes npm) and retry."
  exit 1
fi

TARGET_DIR="${HOME}/.openclaw/sidecar/parallel-chat"
mkdir -p "$TARGET_DIR"

cat > "${TARGET_DIR}/server.js" <<'EOF'
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json({ limit: "1mb" }));

const GATEWAY = process.env.OPENCLAW_GATEWAY_URL; // e.g. http://127.0.0.1:18789
const TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || ""; // optional
const MODEL_OVERRIDE = process.env.OPENCLAW_MODEL || ""; // optional
const BIND_HOST = process.env.BIND_HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3005);
const SESSION_PREFIX = process.env.SESSION_PREFIX || "agent:main:tab-";

if (!GATEWAY) throw new Error("Set OPENCLAW_GATEWAY_URL");

app.get("/", (_req, res) => res.redirect("/new"));

// Create a fresh independent sessionKey and redirect to a new chat tab
app.get("/new", (_req, res) => {
  const sk = `${SESSION_PREFIX}${crypto.randomUUID()}`;
  res.redirect(`/chat/${encodeURIComponent(sk)}`);
});

async function gatewayFetch(path, init = {}) {
  const headers = {
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    ...init.headers,
  };
  return fetch(`${GATEWAY}${path}`, { ...init, headers });
}

function normalizeModelsPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.models)) return payload.models;
  return [];
}

function pickDefaultModel(models) {
  if (MODEL_OVERRIDE) return MODEL_OVERRIDE;
  const tagged = models.find((m) => (m.tags || []).includes("default"));
  if (tagged?.id) return tagged.id;
  const explicit = models.find((m) => m.default === true);
  if (explicit?.id) return explicit.id;
  return models[0]?.id || "";
}

app.get("/api/models", async (_req, res) => {
  try {
    const upstream = await gatewayFetch("/v1/models");
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return res
        .status(upstream.status)
        .json({ error: text || "Failed to load models" });
    }
    const raw = await upstream.json();
    const models = normalizeModelsPayload(raw)
      .filter((m) => m && typeof m.id === "string")
      .map((m) => ({
        id: m.id,
        tags: Array.isArray(m.tags)
          ? m.tags
          : Array.isArray(m.metadata?.tags)
            ? m.metadata.tags
            : [],
      }));
    return res.json({ models, defaultModel: pickDefaultModel(models) });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/chat", async (req, res) => {
  const { sessionKey, model, messages } = req.body || {};
  if (!sessionKey || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Missing sessionKey or messages" });
  }
  const upstream = await gatewayFetch("/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-openclaw-session-key": sessionKey,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
  });

  res.status(upstream.status);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    res.write(`data: ${JSON.stringify({ error: text || "Upstream error" })}\n\n`);
    res.write("data: [DONE]\n\n");
    return res.end();
  }

  const reader = upstream.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
});

app.get("/chat/:sk", (req, res) => {
  const sk = req.params.sk;

  res.type("html").send(`<!doctype html>
<meta charset="utf-8" />
<title>OpenClaw Parallel Chat</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 12px}
  #top{display:flex;justify-content:space-between;align-items:center;gap:12px}
  #log{border:1px solid #ddd;padding:12px;min-height:360px;white-space:pre-wrap;overflow:auto}
  #row{display:flex;gap:8px;margin-top:12px}
  #msg{flex:1;font-size:14px;padding:8px}
  button, select{font-size:14px;padding:8px 10px}
  code{background:#f6f6f6;padding:2px 4px;border-radius:4px}
</style>

<div id="top">
  <div>
    <div><strong>OpenClaw Parallel Chat</strong></div>
    <div>sessionKey: <code id="sk"></code></div>
  </div>
  <div>
    <select id="model"></select>
    <button id="stop" disabled>Stop</button>
    <button id="newtab">New tab</button>
  </div>
</div>

<div id="log"></div>

<div id="row">
  <input id="msg" placeholder="Type…" />
  <button id="send">Send</button>
</div>

<script>
const SESSION_KEY=${JSON.stringify(sk)};
const MODEL_OVERRIDE=${JSON.stringify(MODEL_OVERRIDE)};

document.getElementById('sk').textContent = SESSION_KEY;

const log = document.getElementById('log');
const msg = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const stopBtn = document.getElementById('stop');
const newTabBtn = document.getElementById('newtab');
const modelSel = document.getElementById('model');

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const defaultModel = data.defaultModel || MODEL_OVERRIDE || models[0]?.id || '';
    for (const m of models) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.id + (m.tags?.includes('default') ? ' (default)' : '');
      modelSel.appendChild(opt);
    }
    if (defaultModel) modelSel.value = defaultModel;
  } catch (e) {
    const opt = document.createElement('option');
    opt.value = MODEL_OVERRIDE || 'openrouter/auto';
    opt.textContent = opt.value + ' (fallback)';
    modelSel.appendChild(opt);
    modelSel.value = opt.value;
  }
}
loadModels();

let messages = [];
let inflight = null;

function appendLine(text){
  log.textContent += text;
  log.scrollTop = log.scrollHeight;
}

function appendUser(text){
  appendLine(\`\nUSER: \${text}\n\`);
}

function beginAssistant(){
  appendLine('ASSISTANT: ');
}

function appendAssistantDelta(delta){
  appendLine(delta);
}

function endAssistant(){
  appendLine('\n');
}

function consumeSse(buffer) {
  const parts = buffer.split(/\n\n/);
  const remainder = parts.pop() ?? '';
  const events = [];
  for (const raw of parts) {
    const lines = raw.split(/\n/);
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) events.push(dataLines.join('\n'));
  }
  return { events, remainder };
}

async function send(){
  const text = msg.value.trim();
  if (!text || inflight) return;

  msg.value = '';
  appendUser(text);
  messages.push({ role: 'user', content: text });

  beginAssistant();

  const controller = new AbortController();
  inflight = controller;
  stopBtn.disabled = false;
  sendBtn.disabled = true;

  let assistantText = '';
  let buf = '';
  const decoder = new TextDecoder();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionKey: SESSION_KEY,
        model: modelSel.value,
        messages
      })
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      appendAssistantDelta(\`\n[HTTP \${res.status}] \${t}\n\`);
      endAssistant();
      return;
    }

    const reader = res.body.getReader();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      const parsed = consumeSse(buf);
      buf = parsed.remainder;

      for (const payload of parsed.events) {
        if (payload === '[DONE]') {
          endAssistant();
          messages.push({ role: 'assistant', content: assistantText });
          return;
        }
        try {
          const obj = JSON.parse(payload);
          const delta = obj?.choices?.[0]?.delta?.content;
          if (delta) {
            assistantText += delta;
            appendAssistantDelta(delta);
          }
        } catch {
          // ignore non-JSON keepalives
        }
      }
    }

    endAssistant();
    messages.push({ role: 'assistant', content: assistantText });

  } catch (e) {
    if (String(e?.name) === 'AbortError') {
      appendAssistantDelta('\n[stopped]\n');
      endAssistant();
      if (assistantText) messages.push({ role: 'assistant', content: assistantText });
    } else {
      appendAssistantDelta(\`\n[error] \${e?.message || e}\n\`);
      endAssistant();
    }
  } finally {
    inflight = null;
    stopBtn.disabled = true;
    sendBtn.disabled = false;
  }
}

stopBtn.onclick = () => {
  if (inflight) inflight.abort();
};

sendBtn.onclick = send;
msg.addEventListener('keydown', (e) => (e.key === 'Enter' ? send() : null));

newTabBtn.onclick = () => {
  window.open('/new', '_blank', 'noopener');
};

appendLine('SYSTEM: Ready. This tab is an isolated session lane.\n');
</script>`);
});

app.listen(PORT, BIND_HOST, () => {
  console.log(`Sidecar listening on http://${BIND_HOST}:${PORT}/new`);
});
EOF

cat > "${TARGET_DIR}/package.json" <<'EOF'
{
  "name": "openclaw-parallel-sidecar",
  "private": true,
  "type": "module",
  "version": "0.1.0",
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.19.2"
  }
}
EOF

cd "$TARGET_DIR"
npm install

# Ports: read from config when possible, else defaults
CONFIG_FILE="${HOME}/.openclaw/openclaw.json"
GW_PORT=18789
SIDECAR_PORT=3005
if [[ -f "$CONFIG_FILE" ]]; then
  GW_PORT=$(node -e "
    let j = {}; try { j = JSON.parse(require('fs').readFileSync(process.env.HOME + '/.openclaw/openclaw.json', 'utf8')); } catch (e) {}
    const g = j.gateway || {}; const h = g.http || {};
    const p = h.port || g.port;
    console.log(typeof p === 'number' ? p : (typeof p === 'string' ? parseInt(p, 10) : 18789) || 18789);
  " 2>/dev/null) || GW_PORT=18789
fi

# Enable gateway HTTP endpoint (prompt if interactive, auto-enable if piped e.g. curl|bash)
enable_http=1
if [[ -t 0 ]]; then
  echo ""
  read -r -p "Enable OpenClaw gateway HTTP chat endpoint? (required for sidecar) [Y/n] " REPLY
  case "$REPLY" in
    [nN]) enable_http=0 ;;
    [nN][oO]) enable_http=0 ;;
  esac
fi
if [[ "$enable_http" -eq 1 && -f "$CONFIG_FILE" ]]; then
    node -e "
      const fs = require('fs');
      const p = process.env.HOME + '/.openclaw/openclaw.json';
      let j = {};
      try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) {}
      j.gateway = j.gateway || {};
      j.gateway.http = j.gateway.http || {};
      j.gateway.http.endpoints = j.gateway.http.endpoints || {};
      j.gateway.http.endpoints.chatCompletions = j.gateway.http.endpoints.chatCompletions || {};
      j.gateway.http.endpoints.chatCompletions.enabled = true;
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    "
    echo "Config updated (HTTP chat endpoint enabled)."
    echo ""
    echo "Restarting gateway in background..."
    openclaw gateway stop 2>/dev/null || true
    pkill -f openclaw-gateway 2>/dev/null || true
    sleep 2
    nohup openclaw gateway >/dev/null 2>&1 &
    echo "Starting sidecar in background..."
    SIDECAR_LOG="${TARGET_DIR}/start.log"
    ( cd "$TARGET_DIR" && OPENCLAW_GATEWAY_URL="http://127.0.0.1:${GW_PORT}" PORT="$SIDECAR_PORT" nohup npm start >> "$SIDECAR_LOG" 2>&1 & )
    echo "  (logs: $SIDECAR_LOG if it fails)"
    echo ""
elif [[ "$enable_http" -eq 1 ]]; then
  echo "Config not found at $CONFIG_FILE. Enable gateway.http.endpoints.chatCompletions.enabled manually, then stop the gateway (Ctrl+C) and run: openclaw gateway"
fi

echo ""
echo "=========================================="
echo "Install complete!"
echo "=========================================="
echo ""
if [[ "$enable_http" -eq 1 ]]; then
  echo "✓ Gateway HTTP chat endpoint enabled in openclaw.json"
  echo "✓ Gateway restarted in background (port ${GW_PORT})"
  echo "✓ Sidecar started in background at http://127.0.0.1:${SIDECAR_PORT}/new"
  echo ""
  echo "To run gateway or sidecar in the foreground (e.g. to see logs), stop the background processes and run in separate terminals:"
  echo "  openclaw gateway"
  echo "  cd ~/.openclaw/sidecar/parallel-chat && OPENCLAW_GATEWAY_URL=\"http://127.0.0.1:${GW_PORT}\" PORT=${SIDECAR_PORT} npm start"
else
  echo "To start the sidecar:"
  echo "  cd ~/.openclaw/sidecar/parallel-chat"
  echo "  export OPENCLAW_GATEWAY_URL=\"http://127.0.0.1:${GW_PORT}\""
  echo "  PORT=${SIDECAR_PORT} npm start"
fi
echo ""
echo "Open: http://127.0.0.1:${SIDECAR_PORT}/new"
echo ""
echo "Each tab is an isolated chat session with your OpenClaw gateway."
echo ""
