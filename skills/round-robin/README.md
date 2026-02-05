# Round-Robin Model Selection Skill

Manage which models rotate in the OpenClaw round-robin proxy. List models, update the list via conversation, and understand `/round-robin` and `/model` commands.

## Install

From the clawd repo root:
```bash
./install-round-robin.sh
```
This copies the skill to `~/.openclaw/skills/round-robin/` and creates `~/.openclaw/round-robin-models.json` if missing.

Or manually:
1. Copy the skill: `cp -r skills/round-robin ~/.openclaw/skills/`

2. Ensure the session proxy is started with round-robin enabled:
   ```bash
   ROUND_ROBIN_MODELS="" ./start-session-proxy.sh
   ```
   Or create a config file (the skill can do this for you):
   ```bash
   echo '{"models": ["openrouter/qwen/qwen3-coder-plus", "openrouter/moonshotai/kimi-k2.5", "openrouter/google/gemini-2.5-flash", "openrouter/anthropic/claude-haiku-4.5", "openrouter/openai/gpt-5.2-codex"]}' > ~/.openclaw/round-robin-models.json
   ```

## Usage

- **List models:** "What models are in round-robin?" or "/round-robin"
- **Edit models:** "Edit round-robin" or "Change round-robin to modelA, modelB, modelC"
- **Re-enable round-robin:** Type `/round-robin` in a message (after using `/model` to pin a model)

## Config File

- Path: `~/.openclaw/round-robin-models.json`
- Format: `{"models": ["model-id-1", "model-id-2", ...]}`
- Changes take effect immediately (no proxy restart)
