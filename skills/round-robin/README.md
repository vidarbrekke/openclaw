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

This installs four things and starts the proxy:
1. **Agent skill** → `~/.openclaw/skills/round-robin/` (including install.sh for self-heal)
2. **Core module** → `~/.openclaw/modules/model-round-robin.js` (loaded by the proxy at runtime)
3. **Config file** → `~/.openclaw/round-robin-models.json` (editable model list)
4. **Proxy** — kills any existing process on port 3010 and starts a fresh one in the background

## How it works

- The session proxy dynamically loads `model-round-robin.js` on startup
- Each chat completion request gets routed to the next model in the list
- If the module isn't installed, the proxy runs normally (no round-robin)
- **Self-healing:** Type `/round-robin` in OpenClaw — if the proxy is down, the agent runs the install script to restart it

## Usage

- **After install:** Open `http://127.0.0.1:3010/new`
- **If proxy stopped:** Type `/round-robin` in any OpenClaw conversation — agent restarts it
- **Activate / list / restart:** Type `/round-robin`
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
