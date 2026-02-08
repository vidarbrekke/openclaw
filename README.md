# OpenClaw extras

Community add-ons and docs for [OpenClaw](https://github.com/mariozechner/openclaw) users.

---

## What's in this package

- **Session Proxy** — Run the real Control UI with isolated chat sessions per browser tab. Settings are global; only chat history is isolated. Future-proof: works with any OpenClaw UI updates.
- **Troubleshooting guide** — Fixes for Control UI, login, models, and Kimi-K2.5 issues (`docs/CLAWDBOT_TROUBLESHOOTING.md`).

---

## Session Proxy

The **Session Proxy** lets you open multiple browser tabs, each with its own isolated chat session, while using the **real OpenClaw Control UI**. Settings and configuration are global; only the chat/command outcomes are isolated per tab.

### Quick start

1. **Start the gateway** (if not already running):
   ```bash
   openclaw gateway
   ```

2. **Start the proxy** (in another terminal):
   ```bash
   cd /path/to/this/repo
   ./start-session-proxy.sh
   ```
   Or manually:
   ```bash
   GATEWAY_URL=http://127.0.0.1:18789 node openclaw-session-proxy.js
   ```

3. **Open in browser:**
   - **http://127.0.0.1:3010/new** — starts a new isolated session
   - Each `/new` tab gets a unique session key
   - Settings changes in any tab apply globally
   - Chat history and slash command outputs are isolated per tab

### How it works

- The proxy passes all requests through to the real Control UI (served by the gateway).
- For chat-related requests, it adds `x-openclaw-session-key` based on a URL parameter/cookie.
- **Gateway token is auto-injected:** the proxy reads `gateway.auth.token` from `~/.openclaw/openclaw.json` and appends it to the `/new` redirect URL. The Control UI picks it up from `?token=xxx` — no manual paste needed.
- **Path-based sessions:** each `/new` tab gets a unique path `/s/:sessionKey` and a path-scoped cookie, so multiple tabs don't overwrite each other's session (chat history no longer disappears).
- No UI replication — you always get the latest Control UI from OpenClaw.
- When OpenClaw updates, the proxy continues to work (it's just a passthrough).

### Environment variables

- `GATEWAY_URL` — OpenClaw gateway URL (default: `http://127.0.0.1:18789`)
- `PROXY_PORT` — Port for the proxy (default: `3010`)
- `SESSION_PREFIX` — Prefix for session keys (default: `agent:main:proxy:`)
- `OPENCLAW_GATEWAY_TOKEN` — Override token (otherwise read from `~/.openclaw/openclaw.json` → `gateway.auth.token`)
- `ROUND_ROBIN_MODELS` — Round-robin is **on by default**. Set to `off` to disable. Set to comma-separated model IDs to override. Config file `~/.openclaw/round-robin-models.json` overrides env. Install once with `bash skills/round-robin/install.sh`; after that, type `/round-robin` in any OpenClaw conversation to activate or restart. See `skills/round-robin/README.md`.

---

## Requirements

- **OpenClaw** installed and configured.
- **Node.js 18+** (for the proxy).

---

## Troubleshooting

- **Control UI, login, models, Kimi-K2.5** — See **docs/CLAWDBOT_TROUBLESHOOTING.md** in this package or on the repo.

---

## Repo

- **Repo:** https://github.com/vidarbrekke/openclaw

---

## License

Use and share as you like. OpenClaw itself has its own license; this repo is community extras.
