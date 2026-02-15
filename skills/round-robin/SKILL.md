---
name: round-robin
description: >
  Manage OpenClaw round-robin model selection. Use when user asks about round-robin,
  types /round-robin or /round-robin edit, or wants to change which models rotate.
---

# Round-Robin Model Selection

Round-robin rotates the model every two turns (GUI chat, cron, background tasks). **Only sessions where the user has typed `/round-robin` use rotation**; new sessions use the default model until enabled. Each model runs for two consecutive turns before advancing to the next.

## Activation (opt-in)

**Round-robin is opt-in.** Open `http://127.0.0.1:3010/new`, then type `/round-robin` in chat to enable rotation for that session.

| Action | When | Command |
|--------|------|---------|
| Use round-robin | After typing `/round-robin` in chat | `/round-robin` |
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

### 5. Clean up stale sessions (cron-safe)

Proxy and Control UI create sessions per tab; they accumulate. The script is fully non-interactive and safe for cron.

**Protected (never deleted):** `agent:main:main` — used by heartbeat, Telegram, and cron jobs with sessionTarget:main. Telegram credentials live in `openclaw.json`, not in sessions.

**Agents:** Cleans all `agents/*/sessions/sessions.json` (main, default_api, etc.). Other agents have no heartbeat/Telegram — all their sessions are safe to clean when stale.

```bash
# Proxy-only (default): delete agent:main:proxy:* older than 3h
~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh

# All non-critical: proxy, webchat (agent:main:openai:*), proxy:*, etc.
ALL=1 STALE_MS=21600000 ~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh

# Smart mode: Ollama evaluates each session (zero external tokens)
SMART=1 ~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh

# Preview without acting
DRY_RUN=1 ~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh
```

Env: `STALE_MS` (default 10800000 = 3h), `ALL` (0=proxy-only, 1=all non-protected), `PROTECTED_KEYS` (default agent:main:main), `SESSION_PREFIX` (used when ALL=0), `SMART` (0=time, 1=ollama), `DRY_RUN` (1=preview), `OLLAMA_MODEL` (default: auto-pick).

Cron examples:
- Proxy-only (every 3h): `0 */3 * * * OPENCLAW_DIR=$HOME/.openclaw $HOME/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh`
- All non-critical (every 6h): `0 */6 * * * OPENCLAW_DIR=$HOME/.openclaw ALL=1 STALE_MS=21600000 $HOME/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh`

## Commands (in chat)

- `/round-robin` — Restart proxy if down; re-enable rotation; list models
- `/round-robin edit` — Prompt for new comma-separated list, then write config
- `/model <id>` — Pin model, disable rotation until `/round-robin`

## Disable

`ROUND_ROBIN_MODELS=off ./start-session-proxy.sh`
