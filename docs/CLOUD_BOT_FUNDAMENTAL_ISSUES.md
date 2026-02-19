# Cloud bot: why restarts happen and why tools fail

Two separate issues are making the cloud bot feel broken. Both are addressable.

---

## 1. Why did the gateway restart?

The gateway restarts when it receives **SIGUSR1**. That signal is sent in these cases:

| Trigger | What happens |
|--------|-------------------------------|
| **Restart from Control UI** | Clicking "Restart" in the dashboard (or equivalent) sends SIGUSR1 to the gateway. |
| **Config overwrite that requires restart** | OpenClaw treats some config changes as "critical" (e.g. `agents.list`, `bindings`, gateway port). When such a change is applied (e.g. via Control UI "Save" or `config.apply`), the gateway restarts so the new config is fully loaded. |
| **`/restart` command** | If chat commands are enabled and someone runs `/restart`, the gateway restarts. |

In your case, the logs showed **Config overwrite** from the Control UI (writes to `openclaw.json`) and then **SIGUSR1** a few seconds later. So either:

- You (or the agent) changed config in the UI and saved, and that change was in the "restart required" set, or  
- The UI or an automation triggered a restart after the config write.

**What to do**

- **Avoid accidental restarts:** In `/root/.openclaw/openclaw.json` on the Linode, set `commands.restart: false` if you don’t want `/restart` or UI-driven restart to be possible.
- **Strict boundary:** Gateway lifecycle commands are operator-only and must not run from chat/agent exec flows.
- **Be careful with config in the UI:** Saving certain fields (e.g. under Agents, Bindings) can trigger a full gateway restart and drop all WebSocket connections, so both tabs go blank and need a refresh + session reselect.

---

## 2. Why can’t it use tools? (read tool “without path”)

This has two layers:

### Layer A: Schema mismatch (fixed in OpenClaw)

Many models (including Mistral) send **`file_path`** for file tools (OpenAI/Claude style). OpenClaw’s tools historically expected **`path`**. So validation failed and the agent got stuck in a loop.

- **Fix in OpenClaw:** PR [#7451](https://github.com/openclaw/openclaw/pull/7451) (schema) and [#16717](https://github.com/openclaw/openclaw/issues/16717) (diagnostics) make the read tool accept **both** `path` and `file_path`. Your Mac and Linode are on **2026.2.17**, which includes these fixes.

### Layer B: Model sometimes sends no path at all

The log line **"read tool called without path"** is emitted when, after considering both `path` and `file_path`, **neither** is a non-empty string. So the failure you’re seeing now is not “model sent `file_path` and gateway wanted `path`” — it’s **“model sent a read tool call with no path (and no file_path) at all”**.

So the remaining problem is:

- The **router** (or the model that handles the turn) sometimes emits a **malformed** `read` tool call: the arguments object is missing both `path` and `file_path`, or they’re empty/wrong type.
- That can be a **model bug** (e.g. Mistral Small 3.2 24B occasionally outputting incomplete tool calls), or a **parsing/serialization** issue between the provider (OpenRouter) and OpenClaw (e.g. args getting lost or renamed).

**What to do**

1. **Report upstream (OpenClaw):** Open an issue that says: “On 2026.2.17 we still see ‘read tool called without path’ when the model (OpenRouter/Mistral) is used; please confirm whether args are normalized (including `file_path` → `path`) **before** the tool-start diagnostic, and log the actual `args` when this warning fires so we can see what the model sent.” That will help confirm if the problem is model output or an earlier validation/normalization layer.
2. **Temporary workaround:** For the cloud bot, you can restrict tools so that the router has no `read` tool (e.g. give it only routing-related tools). Then the specialist agents (which get the routed task) can have `read`; they might use it more reliably. Or try a different primary model for sessions that need heavy file/tool use and see if the problem goes away.
3. **Check OpenRouter/Mistral:** If you have a way to inspect raw tool_calls from OpenRouter for Mistral Small 3.2 24B, confirm whether the model sometimes sends `read` with empty or missing `path`/`file_path`. If yes, it’s a model/provider issue and can be reported to OpenRouter/Mistral.

---

## Summary

| Issue | Cause | What you can do |
|-------|--------|-------------------|
| **Unexpected restart** | SIGUSR1 from UI “Save” (config overwrite) or “Restart” / `/restart` | Set `commands.restart: false` if you want to avoid in-app restarts; avoid saving “critical” config from the UI when people are in chat; refresh and reselect session after a restart. |
| **Read tool fails** | (A) Schema mismatch — fixed in 2026.2.17. (B) Model sometimes sends `read` with **no** path/file_path. | (A) Already fixed. (B) Report to OpenClaw with request to log args when the warning fires; optionally restrict `read` for the router or try another model for tool-heavy use; check OpenRouter/Mistral for malformed tool_calls. |

These are the two fundamental flaws behind “why did it restart?” and “why can’t it use tools?”. Addressing restart triggers and gathering evidence (logged args) for the read-tool case will move both toward a proper fix.
