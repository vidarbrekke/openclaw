# Round-Robin Model Rotation

Self-contained package that rotates LLM models per prompt. Every query goes to the next model in a configurable list, giving you diversity of approach.

## What's in this package

| File | Purpose |
|---|---|
| `model-round-robin.js` | Core rotation logic (loaded by the session proxy) |
| `model-round-robin-proxy.js` | Standalone proxy (use without session proxy) |
| `SKILL.md` | Agent instructions for listing/editing models |
| `install.sh` | Installer (copies module + skill + config) |
| `README.md` | This file |
| `USAGE.md` | Quick reference for end users |

## Install

```bash
bash skills/round-robin/install.sh
```

This installs three things:
1. **Agent skill** → `~/.openclaw/skills/round-robin/` (so the agent can manage models)
2. **Core module** → `~/.openclaw/modules/model-round-robin.js` (loaded by the proxy at runtime)
3. **Config file** → `~/.openclaw/round-robin-models.json` (editable model list)

## How it works

- The session proxy dynamically loads `model-round-robin.js` on startup
- Each chat completion request gets routed to the next model in the list
- If the module isn't installed, the proxy runs normally (no round-robin)

## Usage

- **Start:** `./start-session-proxy.sh` → open `http://127.0.0.1:3010/new`
- **Pin a model:** Type `/model openrouter/x/y` in your message
- **Resume rotation:** Type `/round-robin`
- **Edit models:** Edit `~/.openclaw/round-robin-models.json` or ask the agent "Edit round-robin"
- **Disable:** `ROUND_ROBIN_MODELS=off ./start-session-proxy.sh`

## Config file

- **Path:** `~/.openclaw/round-robin-models.json`
- **Format:** `{"models": ["model-id-1", "model-id-2", ...]}`
- Changes take effect immediately (no proxy restart)

## Uninstall

```bash
rm -rf ~/.openclaw/skills/round-robin ~/.openclaw/modules/model-round-robin*.js ~/.openclaw/round-robin-models.json
```
