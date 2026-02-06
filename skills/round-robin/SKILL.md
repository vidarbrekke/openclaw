---
name: round-robin
description: >
  Manage OpenClaw round-robin model selection. Activates the round-robin proxy,
  lists current models, updates the model list, and explains /round-robin and
  /model commands. Use when the user asks about round-robin models, wants to
  change which models rotate, types /round-robin, or /round-robin edit.
---

# Round-Robin Model Selection

The round-robin proxy rotates between multiple models on each prompt. Admins can view and edit the model list via a config file.

## Config File

- **Path:** `~/.openclaw/round-robin-models.json`
- **Format:** `{"models": ["model-id-1", "model-id-2", "model-id-3", ...]}`
- **Effect:** The session proxy reads this file on each request. Changes take effect immediately (no restart).

## When to Use This Skill

- User types `/round-robin` or asks to enable/activate round-robin
- User asks: "What models are in round-robin?", "List round-robin models"
- User wants to change the model list: "Edit round-robin", "Update round-robin models", "/round-robin edit"
- User asks how round-robin works

## Actions

### 0. Ensure Proxy Is Running (do this FIRST for any /round-robin action)

Before listing models or confirming activation, check if the session proxy is running. Use the **exec** (bash) tool:

```bash
lsof -ti :3010 >/dev/null 2>&1 && echo "RUNNING" || echo "STOPPED"
```

- If **RUNNING**: proceed to the next action.
- If **STOPPED**: run the install script (it is self-healing: copies files, starts proxy):

```bash
bash "$HOME/.openclaw/skills/round-robin/install.sh"
```

Then check again:

```bash
lsof -ti :3010 >/dev/null 2>&1 && echo "STARTED" || echo "FAILED"
```

- If **STARTED**: tell the user: "Round-robin proxy is now active. Open **http://127.0.0.1:3010/new** to start a session with model rotation."
- If **FAILED**: tell the user: "Could not start the session proxy. Ensure the clawd repo (with openclaw-session-proxy.js) is at $HOME/Dev/CursorApps/clawd or $HOME/clawd, then run: bash $HOME/.openclaw/skills/round-robin/install.sh"

### 1. List Current Models

Use the **read** tool to read the config file. Path: `$HOME/.openclaw/round-robin-models.json` (or `~/.openclaw/round-robin-models.json`). If the file does not exist, report that round-robin uses the default list (env or built-in defaults).

Parse the JSON and display the `models` array. Example: "Round-robin currently uses: qwen3-coder-plus, kimi-k2.5, gemini-2.5-flash, claude-haiku-4.5, gpt-5.2-codex"

### 2. Update Model List

When the user provides a new list (e.g. "Change round-robin to modelA, modelB, modelC" or after they respond to "Please provide a comma-separated list of model IDs"):

1. Parse the comma-separated list into an array of model IDs (trim whitespace).
2. Use the **write** tool to write the config file. Path: `$HOME/.openclaw/round-robin-models.json`. Content format:
   ```json
   {"models": ["model-id-1", "model-id-2", "model-id-3"]}
   ```
3. The `~/.openclaw/` directory must exist (create via exec if needed).

### 3. /round-robin edit Flow

If the user types "/round-robin edit" or asks to "edit round-robin":

1. Ensure proxy is running (Action 0).
2. Show the current models (read the file).
3. Ask: "Provide a comma-separated list of model IDs to use. Example: openrouter/qwen/qwen3-coder-plus, openrouter/moonshotai/kimi-k2.5"
4. When the user replies with a list, parse it and write the config file.
5. Confirm: "Round-robin models updated. New list: ..."

### 4. /round-robin (activate / re-enable)

If the user types just "/round-robin" (no subcommand):

1. Ensure proxy is running (Action 0).
2. List the current models (Action 1).
3. Tell the user: "Round-robin is active. Each prompt rotates through the models above. Open **http://127.0.0.1:3010/new** to start a session."

## Commands (Proxy-Level)

- **`/round-robin`** — Activates the proxy if not running, and re-enables rotation for the session (after `/model` disabled it). The proxy strips this from the message before sending to the model.
- **`/model <id>`** — Disables round-robin and uses the specified model. The proxy detects this in the message.

## Notes

- Round-robin is **on by default** when using the session proxy. No env var needed.
- To disable: set `ROUND_ROBIN_MODELS=off` when starting the proxy.
- Model IDs must be valid OpenClaw model identifiers (e.g. `openrouter/qwen/qwen3-coder-plus`).
- The config file `~/.openclaw/round-robin-models.json` overrides `ROUND_ROBIN_MODELS` env var when it exists.
- Using `/model <id>` bypasses round-robin until `/round-robin` re-enables it.
- The proxy listens on port 3010 by default. Set `PROXY_PORT` env var to change.
