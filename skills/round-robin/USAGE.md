# Round-Robin: Use a Circle of Models

**Every query rotates through different LLMs.** Each prompt goes to the next model in a fixed list; after the last, it wraps to the first. Model choices are stored in one editable file.

## Setup

1. **Start the session proxy** — Round-robin is on by default:
   ```bash
   ./start-session-proxy.sh
   ```
   To disable: `ROUND_ROBIN_MODELS=off ./start-session-proxy.sh`

2. **Install the skill** (optional, for agent-managed edits):
   ```bash
   ./install-round-robin.sh
   ```

3. **Edit models** — Edit `~/.openclaw/round-robin-models.json`:
   ```json
   {"models": ["model-a", "model-b", "model-c", "model-d", "model-e"]}
   ```
   Changes apply immediately. No restart.

## Commands

- **List models** — Ask: "What models are in round-robin?" or type `/round-robin`
- **Change models** — Ask: "Edit round-robin" or "Change round-robin to modelX, modelY, modelZ"
- **Re-enable rotation** — Type `/round-robin` in a message (after using `/model` to pin one model)

## Core Rule

**All queries are sent through the circle of models.** The proxy selects the next model per prompt. Use `/model` to pin a single model; type `/round-robin` to return to rotation.
