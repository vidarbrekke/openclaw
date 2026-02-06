---
name: round-robin
description: >
  Manage OpenClaw round-robin model selection. Use when user asks about round-robin,
  types /round-robin or /round-robin edit, or wants to change which models rotate.
---

# Round-Robin Model Selection

Round-robin rotates the model on every turn (GUI chat, cron, background tasks). Each session has its own rotation index.

## Activation (automatic)

**Round-robin is ON by default when using the proxy.** Open `http://127.0.0.1:3010/new` — no command needed.

| Action | When | Command |
|--------|------|---------|
| Use round-robin | Always, when proxy is used | None — automatic |
| Restart proxy | Proxy stopped (e.g. after reboot) | `/round-robin` |
| Re-enable rotation | After pinning with `/model` | `/round-robin` |
| Pin a model | Disable rotation for session | `/model openrouter/x/y` |

## Config

- **Path:** `~/.openclaw/round-robin-models.json`
- **Format:** `{"models": ["id1", "id2", ...]}`
- Changes apply immediately (no restart)

## Agent actions

### 1. Check proxy status

```bash
lsof -ti :3010 >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
```

If STOPPED, run: `bash ~/.openclaw/skills/round-robin/install.sh`

### 2. List models

Read `~/.openclaw/round-robin-models.json`. If missing, report default list.

### 3. Update models

On "edit round-robin" or new list: write JSON to config path. Ensure `~/.openclaw/` exists.

### 4. Status

`http://127.0.0.1:3010/round-robin/status` — JSON with enabled, models, per-session index.

## Commands (in chat)

- `/round-robin` — Restart proxy if down; re-enable rotation; list models
- `/round-robin edit` — Prompt for new comma-separated list, then write config
- `/model <id>` — Pin model, disable rotation until `/round-robin`

## Disable

`ROUND_ROBIN_MODELS=off ./start-session-proxy.sh`
