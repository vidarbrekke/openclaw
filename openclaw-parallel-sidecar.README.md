# OpenClaw Parallel Sidecar

Run multiple isolated chat lanes in parallel without forking the Control UI.

## What this does
- Creates a new session lane per tab using `x-openclaw-session-key`.
- Streams responses via the gateway's OpenAI-compatible HTTP endpoint.
- Avoids CORS by proxying all gateway requests server-side.
- Auto-selects the gateway default model (or uses an override).

## Prerequisites
1. OpenClaw gateway running
2. Enable the HTTP chat endpoint:
   - `gateway.http.endpoints.chatCompletions.enabled = true`
3. Ensure `/v1/models` is reachable from the gateway
   - If not, set `OPENCLAW_MODEL` to a known model ID

## Install (manual)
```bash
mkdir -p ~/.openclaw/sidecar/parallel-chat
cp openclaw-parallel-sidecar.server.js ~/.openclaw/sidecar/parallel-chat/server.js
cp openclaw-parallel-sidecar.package.json ~/.openclaw/sidecar/parallel-chat/package.json
cd ~/.openclaw/sidecar/parallel-chat
npm install
```

## Run
```bash
export OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789"
# export OPENCLAW_GATEWAY_TOKEN="..."   # optional
# export OPENCLAW_MODEL="..."           # optional override

npm start
```

Then open:
- `http://127.0.0.1:3005/new`

## Environment variables
- `OPENCLAW_GATEWAY_URL` (required)
- `OPENCLAW_GATEWAY_TOKEN` (optional)
- `OPENCLAW_MODEL` (optional model override)
- `BIND_HOST` (default `127.0.0.1`)
- `PORT` (default `3005`)
- `SESSION_PREFIX` (default `agent:main:tab-`)

## Security notes
- Bind to `127.0.0.1` unless you have a reverse proxy + auth.
- Keep your gateway token server-side (this sidecar does that).
