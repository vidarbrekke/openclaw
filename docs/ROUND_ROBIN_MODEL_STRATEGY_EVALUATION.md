# Round-Robin Model Selection — Strategy Evaluation

Custom functionality: each coding-related request rotates through 5 models in round-robin order.

---

## Strategy 1: Skill + Tool (Agent-Triggered)

### Description
Create an OpenClaw skill that instructs the agent to call a round-robin tool before coding tasks. The tool (MCP server or OpenClaw native tool) returns the next model ID and increments an internal counter. The agent then uses `/model <returned>` before responding.

### Evaluation
- **Complexity**: High — requires skill authoring, tool implementation, and persistent state (file or in-memory). Agent must reliably call the tool on every coding request.
- **DRY**: Low — logic split between skill instructions and tool code; duplication if multiple entry points need round-robin.
- **YAGNI**: Low — relies on agent compliance; adds tool infrastructure for a single use case.
- **Scalability**: Medium — tool could support other routing logic later, but agent-triggered flow is inherently fragile.

---

## Strategy 2: Session Proxy Extension

### Description
Extend `openclaw-session-proxy.js` to buffer POST requests to `/v1/chat/completions`, parse the JSON body, replace the `model` field with the next round-robin model, and forward the modified body to the gateway.

### Evaluation
- **Complexity**: Low — single file change, ~60 lines. Uses existing proxy as interception point.
- **DRY**: High — all round-robin logic lives in one place within the proxy.
- **YAGNI**: High — only adds the minimal logic needed; no extra processes or abstractions.
- **Scalability**: Medium — proxy file grows if more transforms are added; coupling increases.

---

## Strategy 3: Standalone Model Router

### Description
Create a dedicated `model-round-robin-proxy.js` that sits in front of the gateway (or in front of the session proxy). It buffers chat completion requests, applies round-robin model override, and forwards. Completely separate from the session proxy.

### Evaluation
- **Complexity**: Low — small, focused script (~80 lines). Single responsibility.
- **DRY**: High — one module, one job. Reusable as a building block.
- **YAGNI**: High — does exactly one thing; no speculative features.
- **Scalability**: High — easy to add more routing rules or compose with other proxies without touching existing code.

---

## Strategy 4: Shared Module + Optional Integration

### Description
Implement round-robin logic in a reusable `model-round-robin.js` module (state + `transformBody` function). The session proxy optionally requires and uses it when `ROUND_ROBIN_MODELS` is set. A standalone proxy script also uses the same module for users who connect directly to the gateway.

### Evaluation
- **Complexity**: Low — module is ~40 lines; integration points add ~30 lines each.
- **DRY**: High — core logic in one module; session proxy and standalone both consume it.
- **YAGNI**: High — module has no features beyond round-robin; integration is opt-in.
- **Scalability**: High — new consumers (e.g. gateway plugin) can reuse the module without duplication.

---

## Comparison

| Criterion      | Strategy 1 (Skill+Tool) | Strategy 2 (Proxy Ext) | Strategy 3 (Standalone) | Strategy 4 (Shared Module) |
|----------------|-------------------------|------------------------|--------------------------|----------------------------|
| **Complexity** | High                    | Low                    | Low                      | Low                        |
| **DRY**        | Low                     | High                   | High                     | High                       |
| **YAGNI**      | Low                     | High                   | High                     | High                       |
| **Scalability**| Medium                  | Medium                 | High                     | High                       |
| **Processes**  | 0 extra                 | 0 extra                | 1 extra                  | 0 or 1 (optional)          |
| **Reliability**| Agent-dependent         | Deterministic          | Deterministic            | Deterministic              |

### Trade-offs Summary
- **Strategy 1**: Rejected — agent must remember to call the tool; unreliable for automatic round-robin.
- **Strategy 2**: Good — simple, no extra process; but couples round-robin to the proxy.
- **Strategy 3**: Good — clean separation; requires running an additional process.
- **Strategy 4**: Best — DRY (shared module), flexible (proxy or standalone), no duplication.

### Winner: Strategy 4 (Shared Module + Optional Integration)
Provides a single source of truth for round-robin logic, supports both session-proxy users and direct gateway users, and keeps the proxy lean with opt-in behavior.

---

## Implementation

**Package:** Self-contained `skills/round-robin/` with:
- `model-round-robin.js` — shared module (`createRoundRobinState`, `transformChatBody`, `processRoundRobinCommands`)
- `model-round-robin-proxy.js` — standalone proxy for direct gateway users
- `install.sh` — copies skill, module, config; kills and restarts the session proxy
- `SKILL.md` — agent instructions; when proxy is down, agent runs install script (self-heal)

**Session proxy:** `openclaw-session-proxy.js` dynamically imports the module from `skills/round-robin/`, `~/.openclaw/modules/`, or repo root. Round-robin is **on by default** unless `ROUND_ROBIN_MODELS=off`.

**Install:**
```bash
bash skills/round-robin/install.sh
```
Installs to `~/.openclaw/skills/round-robin/` and `~/.openclaw/modules/`, creates config, starts the proxy. Open `http://127.0.0.1:3010/new`.

**One command after install:** Type `/round-robin` in any OpenClaw conversation. The agent checks if the proxy is running; if not, it runs the install script to restart it. Lists models and gives the link.

**Defaults:** Round-robin is on by default. Set `ROUND_ROBIN_MODELS=off` to disable. Config file `~/.openclaw/round-robin-models.json` overrides env. Default models: qwen3-coder-plus, kimi-k2.5, gemini-2.5-flash, claude-haiku-4.5, gpt-5.2-codex.

**Skill (admin edits):** Say "Edit round-robin" or "Change round-robin to modelX, modelY, modelZ" — the agent updates `~/.openclaw/round-robin-models.json`. Changes take effect immediately (no restart).
