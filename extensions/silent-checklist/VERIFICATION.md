# Silent Preflight Plugin — Verification & Systemic Issues

## Will the plugin succeed at its goals?

**Short answer: Yes, for the embedded (API) agent path.** A few systemic issues exist; they are documented below with mitigations.

---

## Code paths that use the hook ✅

| Path | Uses `before_agent_start`? | Plugin applies? |
|------|----------------------------|-----------------|
| **Embedded runner** (pi-ai: OpenAI, Anthropic, Ollama, OpenRouter, etc.) | Yes | ✅ Yes |
| **CLI backend** (e.g. `claude` or `gemini` CLI command) | No | ❌ No |

Your setup (Ollama `mistral-small`, OpenRouter fallbacks) uses the **embedded path**, so the plugin will run.

---

## Fixes applied

### 1. Config source: `api.pluginConfig` not `event.config`

The `PluginHookBeforeAgentStartEvent` type only has `prompt` and `messages`. There is no `event.config`. Plugin config comes from `api.pluginConfig`, populated from `plugins.entries["silent-checklist"].config`.

**Fix:** The plugin now reads `cfg` from `api.pluginConfig` at register time (same pattern as memory-lancedb, lobster, llm-task).

### 2. Config location in openclaw.json

```json
{
  "plugins": {
    "entries": {
      "silent-checklist": {
        "enabled": true,
        "config": {
          "enabled": true,
          "extraStructuredOutputGuard": false
        }
      }
    }
  }
}
```

If the plugin is loaded via `plugins.load.paths` (e.g. `--link` install), it may still need an entry under `plugins.entries` for `config` to be passed. The exact behavior depends on how OpenClaw merges loaded plugins with entries. If `api.pluginConfig` is empty, `cfg` is `{}`, so `enabled` and `extraStructuredOutputGuard` default to `undefined`/falsy, and injection still occurs (with `extraStructuredOutputGuard` off).

---

## Systemic issues

### Issue 1: CLI backend bypasses the hook

**What:** When the agent uses a CLI backend (e.g. `commands.native: "claude"` with the `claude` CLI), the system prompt is built in `runCliAgent` and never passes through `before_agent_start`.

**Impact:** No injection for CLI-backed runs.

**Mitigation:** Your config uses API providers (Ollama, OpenRouter), so the embedded path is used. If you add a CLI backend later, the preflight text will not be injected for those runs unless OpenClaw is changed.

---

### Issue 2: `extraStructuredOutputGuard` may never trigger

**What:** The guard is added only when `event.outputMode`, `event.requesterOrigin?.outputMode`, or `event.channelOutputMode` is `"json"` or `"jsonl"`. The `PluginHookBeforeAgentStartEvent` type does not define these fields.

**Impact:** `extraStructuredOutputGuard` will likely never add the JSON/JSONL instruction.

**Mitigation:** Keep `extraStructuredOutputGuard: false` unless OpenClaw adds these fields to the event. If you need a JSON guard, add it unconditionally (e.g. a second line always appended) or via a separate mechanism.

---

### Issue 3: Placement is prepended, not appended

**What:** The embedded runner only uses `prependContext`, so the instruction appears before the system prompt, not at the end.

**Impact:** The model still sees the instruction. End-of-prompt placement is not possible without changing OpenClaw.

---

### Issue 4: Subagent prompt is unchanged

**What:** `buildSubagentSystemPrompt` builds the subagent block in code. The plugin does not modify that block; it prepends the same instruction to every run, including subagents.

**Impact:** None. Subagent runs receive the prepended instruction.

---

## Verification checklist

- [x] Plugin uses `prependContext` (the only field the embedded runner uses)
- [x] Plugin reads config from `api.pluginConfig` instead of `event.config`
- [x] De-dupe checks `event.prompt`, `event.systemPrompt`, `event.prependContext`
- [x] No early return when `event.prompt` is missing (we still inject)
- [ ] **Manual test:** Restart gateway, send a message, confirm preflight text appears in logs or via `/context detail`
- [ ] **Optional:** Add `plugins.entries["silent-checklist"].config` if `api.pluginConfig` is empty

---

## How to confirm it works

1. Restart the gateway after installing the plugin.
2. Send a chat message that triggers an agent run (e.g. “Run the tests in this project”).
3. Check gateway logs for: `hooks: prepended context to prompt (N chars)`.
4. Or use `/context detail` (if available) to inspect the system prompt.

If you see the prepend log line, the plugin is active.
