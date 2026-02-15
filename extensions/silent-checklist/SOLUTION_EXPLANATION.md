# Silent Preflight Plugin — Complete Solution

## Goal

Inject a "silent preflight" instruction into the system prompt for **all** agent runs (main agent and subagents), so that models:

1. Map each failing test/assertion to the exact change that fixes it; if they can't, say what's missing.
2. Do not output the mapping—only the final tool calls or response.

---

## Approach: OpenClaw Plugin Using `before_agent_start` Hook

### Why a plugin?

- Survives OpenClaw upgrades (no patching dist files).
- Installed via `openclaw plugins install <path> --link`.
- Configurable and removable without modifying OpenClaw.

### Hook used: `before_agent_start`

OpenClaw plugins can register handlers for `before_agent_start`. The hook receives:
- `event.prompt` — the full system prompt assembled for the run
- `event.messages` — the message history

The hook can return:
- `systemPrompt?: string` — intended to replace the system prompt
- `prependContext?: string` — text to prepend to the system prompt

---

## Critical Finding: Only `prependContext` Is Consumed

During implementation we discovered that **the embedded runner ignores `systemPrompt`** from the hook result. In all three bundles:

- `dist/reply-B_4pVbIX.js`
- `dist/loader-n6BPnYom.js`
- `dist/extensionAPI.js`

the code only uses `prependContext`:

```javascript
if (hookResult?.prependContext) {
    effectivePrompt = `${hookResult.prependContext}\n\n${params.prompt}`;
}
```

So we use `prependContext` to inject the instruction. The text appears **before** the system prompt, not at the end. The model still sees it and can follow it.

---

## Implementation

### Plugin structure

```
silent-checklist/
├── index.mjs              # Plugin entry point
├── openclaw.plugin.json   # Plugin metadata
├── package.json           # npm package + openclaw.extensions
└── SOLUTION_EXPLANATION.md  # This file
```

### What the plugin does

1. Registers a `before_agent_start` handler.
2. On each agent run (main or subagent), returns `{ prependContext: PREFLIGHT_TEXT }`.
3. Checks `event.prompt`, `event.systemPrompt`, and `event.prependContext` for de-duplication—if the preflight text is already present, skips injection.
4. Honors config: `enabled: false` disables injection; `extraStructuredOutputGuard: true` adds a JSON/JSONL guard when output mode is detected.

### Injected text (default)

> Silent preflight: before finalizing, map each failing test/assertion to the exact change that fixes it; if you can't, say what's missing. Do not output the mapping—only the final tool calls/response.

### Optional structured output guard (when `extraStructuredOutputGuard: true`)

> If this run requires structured stdout (json/jsonl), output ONLY valid JSON/JSONL and nothing else (no prose).

---

## Config schema

Config lives under `plugins.entries["silent-checklist"].config` in openclaw.json:

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

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable or disable prompt injection |
| `extraStructuredOutputGuard` | boolean | `false` | If true and event indicates json/jsonl stdout, also inject the structured output guard |

**Note:** If the plugin is loaded only via `plugins.load.paths` (e.g. `--link` install) without an `plugins.entries` entry, `api.pluginConfig` may be empty. In that case `enabled` and `extraStructuredOutputGuard` default to truthy/falsy and injection still runs (with the extra guard off).

---

## Installation

```bash
openclaw plugins install /path/to/silent-checklist --link
```

`--link` adds the path to `plugins.load.paths` in `~/.openclaw/openclaw.json` without copying files. Restart the gateway after install:

```bash
openclaw gateway restart
```

---

## Limitations

1. **Placement**: The instruction is prepended to the system prompt, not appended. If end-of-prompt placement matters, this approach cannot achieve that without changes to OpenClaw.
2. **`systemPrompt` unused**: The `before_agent_start` hook type includes `systemPrompt`, but the embedded runner does not use it. That is effectively dead code in the current OpenClaw version.
3. **Subagent prompt**: The subagent system prompt is built by `buildSubagentSystemPrompt` in `subagent-announce.ts`. To change that block directly, you would need to patch the dist or modify the upstream OpenClaw repo. The plugin does not modify that block; it prepends the same instruction to every run, including subagent runs.
4. **`event.config`**: Plugin config may be passed via `event.config`; if OpenClaw does not provide it, `enabled` and `extraStructuredOutputGuard` default to their schema values.

---

## Alternative: Patching the Installed Package

Another developer suggested patching the installed dist files directly. That approach:

- Requires patching all three bundles where `buildSubagentSystemPrompt` appears (or where the main prompt is built).
- Places text exactly where you want it (e.g., inside the Rules section).
- Is overwritten on every OpenClaw upgrade.

Paths to patch (on a typical install):

- `/opt/homebrew/lib/node_modules/openclaw/dist/reply-B_4pVbIX.js`
- `/opt/homebrew/lib/node_modules/openclaw/dist/loader-n6BPnYom.js`
- `/opt/homebrew/lib/node_modules/openclaw/dist/extensionAPI.js`

---

## Summary

| Approach      | Pros                                   | Cons                                           |
|---------------|----------------------------------------|------------------------------------------------|
| **Plugin**    | Survives upgrades, no dist patching    | Text prepended only; `systemPrompt` ignored    |
| **Dist patch**| Exact placement inside prompt blocks   | Overwritten on upgrade; must patch 3 files     |
| **Upstream**  | Proper fix, survives upgrades          | Requires fork/PR and build process             |

The current solution uses the plugin with `prependContext` because it is non-invasive and upgrade-safe. If strict placement is required, a dist patch or upstream change would be needed.
