# OpenClaw (formerly Clawdbot/moltbot) troubleshooting notes

## 0. Cloud bot (Linode): queries take minutes or get stuck

### Root cause (Feb 2026)
Two things were happening on the Linode gateway:

1. **Read-tool loop:** The agent was repeatedly calling the `read` tool in a way that failed validation: "Missing required parameter: path". This is a **known OpenClaw bug** (not model-specific): many models (including Mistral) follow OpenAI/Claude-style tool schemas and send **`file_path`**, while the gateway historically required **`path`**. Validation ran before the alias was applied, so the model kept retrying with `file_path` and the gateway kept rejecting it. See [openclaw/openclaw#2596](https://github.com/openclaw/openclaw/issues/2596); **fixed in PR #7451** (Feb 2026). So the problem was the tool schema mismatch, not Mistral being unable to use tools.
2. **Long timeout:** The embedded run timeout was the default 600 seconds (10 minutes). So every stuck run burned the full 10 minutes, then OpenRouter was put in cooldown and follow-up requests failed with "all in cooldown or unavailable".

So queries appeared to "take minutes" or "get stuck" because the agent was stuck in that tool-call loop until the 10-minute timeout.

### Fix applied (Linode)
On the Linode (`/root/openclaw-stock-home/.openclaw/openclaw.json`):

1. **Lower run timeout:** `agents.defaults.timeoutSeconds` set to **120** (2 minutes). Stuck runs now fail fast instead of burning 10 minutes.
2. **Primary model left as `router`** (Mistral Small 3.2 24B) for the routing skill (router evaluates task complexity and routes to specialist models). Fallbacks: **default** (Qwen), **writer** (Haiku), **generalist** (Gemini Flash).

With OpenClaw 2026.2.17 the read-tool `file_path`→`path` fix should be in place. If the loop reappears, ensure the Linode is on a recent OpenClaw version that includes the fix.

### If it happens again
- Check gateway logs: `ssh root@45.79.135.101 'journalctl --user -u openclaw-gateway.service -n 100'`. Look for `read tool called without path` or `embedded run timeout`.
- Confirm OpenClaw version on Linode includes the read-tool alias fix (e.g. `openclaw --version` or check release notes for #7451).
- To change timeout or model on the Linode: edit `/root/openclaw-stock-home/.openclaw/openclaw.json` (e.g. `agents.defaults.timeoutSeconds`, `agents.defaults.model.primary`), and apply only operator-approved restart procedures. Never execute restart/stop from chat/agent exec.

---

## Operator runbook (policy-only mode + emergency rollback)

Use this when the cloud bot appears slow, stuck, or disconnected.

### Current operating model

- Conversational sessions must not execute gateway lifecycle commands.
- Gateway lifecycle actions are operator-only via manual SSH.
- Guardrails are policy-first, with transparent status in:
  - `/root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md`

### Never do from chat/agent exec

- `openclaw gateway restart`
- `openclaw gateway stop`
- `systemctl --user restart openclaw-gateway.service`
- `systemctl --user stop openclaw-gateway.service`

### First response checklist (2-3 minutes)

1. Check gateway health:
   ```bash
   systemctl --user status openclaw-gateway.service --no-pager -n 40
   ```
2. Check recent restart or timeout signals:
   ```bash
   journalctl --user -u openclaw-gateway.service --since "15 minutes ago" --no-pager
   ```
3. Check active guard posture:
   ```bash
   cat /root/openclaw-stock-home/.openclaw/workspace/memory/ops-combined-report.md
   ```
   Confirm these lines:
   - `guard_policy_mode: enabled`
   - `runtime_patch_fallback: disabled` (or enabled during temporary rollback)
   - `elevated.webchat_allow: []`

### If user reports "prompt submitted, no result"

- Verify whether a restart occurred mid-turn:
  - Look for `signal SIGTERM received`
  - Look for `webchat disconnected code=1012 reason=service restart`
- If yes, start a fresh chat session and avoid restarts while a turn is running.

### Safe operator restart procedure (only if required)

Use only from SSH, and only after confirming no active critical turn:

```bash
systemctl --user restart openclaw-gateway.service
systemctl --user status openclaw-gateway.service --no-pager -n 30
```

### Emergency rollback (short-term)

If guard policy migration regresses and you need temporary fallback:

1. Restore saved drop-in:
   ```bash
   cp /root/openclaw-stock-home/.openclaw/var/rollback/10-websearch-guard.conf.bak /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
   ```
2. Reload + restart:
   ```bash
   systemctl --user daemon-reload
   systemctl --user restart openclaw-gateway.service
   ```
3. Re-check combined report for fallback status.

### Stability targets

- No restart-induced orphaned turns.
- No read-loop ENOENT storms.
- No recurring cooldown spikes from simple requests.
- Daily briefing includes ops combined report health.

---

## Excessive LLM calls (cost and rate limits)

### What drives cost

1. **Fallback cascade** — When the primary model times out or errors, the gateway tries each fallback (e.g. default, writer, generalist). One user request can become **4 LLM calls** (primary + 3 fallbacks). Many timeouts → many cascades.
2. **Tool rounds per turn** — Each time the model calls a tool and gets a result, that’s another LLM call (model decides next action). Example: gift-card flow with spawn → subagents list → sessions_history → sessions_send → session_status = **5+ LLM calls** for one balance check. Redundant or failing tool calls (e.g. forbidden) still burn calls.
3. **Long run timeout** — `agents.defaults.timeoutSeconds` (e.g. 180) lets a stuck run burn that long before failing and triggering the fallback cascade.
4. **Session-labeler hook** — Runs on `/new`, `/reset`, `/stop` and may call the LLM to generate a short label; frequent new sessions increase calls.

### Mitigations (operator-approved only)

- **Lower run timeout** — e.g. `agents.defaults.timeoutSeconds: 120` so stuck runs fail sooner and trigger fewer fallbacks.
- **Fewer fallbacks** — e.g. one fallback instead of three in `agents.defaults.model.fallbacks` to reduce cascade size (primary + 1 instead of +3).
- **Gift-card flow** — Main must not call `subagents`, `sessions_history`, `sessions_send`, or `session_status` after `sessions_spawn` for gift-card; wait only for the auto-announce. (Enforced in main workspace AGENTS.md.)
- **Session-labeler** — If it uses the LLM, disable it or raise its trigger threshold in Hooks config to reduce labeler calls.
- **Cooldown** — After timeouts/rate limits, restart gateway and wait 5–10 min before retrying (see command card section 4).

### Applied on Linode (as of 2026-02-20)

- `agents.defaults.timeoutSeconds`: **120**
- `agents.defaults.model.fallbacks`: **["default"]** (single fallback)
- `hooks.internal.entries.session-labeler.enabled`: **false**
- Main workspace AGENTS.md: gift-card flow must not call subagents/sessions_history/sessions_send/session_status after spawn. Backup before changes: `/root/openclaw-stock-home/.openclaw/openclaw.json.bak.pre-llm-fixes`

---

## 1. Control UI: replies not showing (FIXED)

### Root cause
The gateway correctly runs the model, appends the assistant message to the transcript, and broadcasts a `chat` event with `state: "final"` (and optionally the message in the payload). The Control UI **receives** this event and clears the "streaming" state (`chatStream`, `chatRunId`, `chatStreamStartedAt`) but **does not refresh the message list**. So `chatMessages` is never updated with the new assistant reply, and the UI keeps showing the spinner/placeholder.

- `deliver: false` in `chat.send` is **unrelated** to this. The gateway does not use `deliver` for the webchat path; it only affects whether the reply is sent to an external channel (e.g. WhatsApp). Replies are always written to the session transcript.
- `chat.history` does return the full history (including the new message) when called after the run completes; the bug was purely that the UI did not call `chat.history` when it received the `chat` / `state: "final"` event.

### Fix applied
A two-part patch is applied via `scripts/apply-webchat-display-fix.py`:

1. **Relax runId guard** — `state=final` events are no longer rejected when runIds mismatch (e.g. after WebSocket reconnect). Previously the guard caused early return and the final handler never ran.
2. **En(e) clears streaming state** — When `chat.history` loads (from final handler or Refresh), `chatRunId`/`chatStream` are cleared so the thinking animation stops.

**Apply on server (Linode):**
```bash
python3 /root/openclaw-stock-home/.openclaw/scripts/apply-webchat-display-fix.py
# Hard-refresh the browser (Cmd+Shift+R) to load the new bundle
```

**Strategy analysis:** See `docs/WEBCHAT_RESPONSE_DISPLAY_STRATEGIES.md` for the four-strategy evaluation and rationale.

**Note:** The patch lives inside the npm-installed package. Re-apply after every `openclaw update` or `npm install -g openclaw`.

**Model scanning is NOT affected:** The patch only touches the Control UI bundle (frontend JavaScript). Model discovery happens via `piSdk.discoverModels()` which scans from the agent directory (`~/.openclaw/agents/main/`) and is completely separate from the UI bundle. The model catalog code (`dist/agents/model-catalog.js`, `dist/gateway/server-model-catalog.js`) is untouched.

### Workaround if you revert the patch
After sending a message, click the **Refresh** button in the Chat tab (or switch session and back) so the UI calls `chat.history` and the reply appears.

### On the OpenClaw cloud server (clawbot): reply only after Refresh, thinking never stops
If the reply does not appear until you click the session **Refresh** button, and the **thinking animation stays** until you reload the browser page, the Control UI is not receiving (or not acting on) the `chat` event with `state: "final"`. So:

1. **Message list is never refreshed** → reply is only visible after a manual Refresh (which calls `chat.history`).
2. **Streaming state is never cleared** → the thinking spinner stays until a full page reload.

**Likely causes on the cloud server:**

- **WebSocket path:** The session proxy must strip `/s/:sessionKey` from the upgrade path and forward `/` or `/ws` to the gateway. If the proxy sent `/s/proxy:xxx/`, the WebSocket would fail and the UI would never get `state: "final"`. Ensure the proxy on the server is the latest version (see §7 Round-robin: WebSocket path stripping).
- **Session key format:** The gateway broadcasts "final" with session key in canonical form (e.g. `agent:main:proxy:uuid`). If the UI was using a different form (e.g. `proxy:uuid`), it would ignore the event. The proxy must use `SESSION_PREFIX=agent:main:proxy:` (default in current proxy).
- **Control UI bundle not patched:** The npm-installed Control UI may not call load-history on `state === "final"`. After an `openclaw` upgrade the bundle filename changes and any previous patch is lost. Re-apply the patch (see "Fix applied" above) on the server: find the current bundle under `.../node_modules/openclaw/dist/control-ui/assets/index-*.js` and add a call to the load-history function when the `chat` event has `state: "final"` or `"aborted"`.

**What to do on the Linode:**

1. Confirm the session proxy is up to date (path stripping, `x-openclaw-session-key` on all requests, session key format).
2. Check proxy logs for `WebSocket upgrade -> session: ... path: /` (path should be `/`, not `/s/...`).
3. Re-apply the webchat display fix: `python3 /root/openclaw-stock-home/.openclaw/scripts/apply-webchat-display-fix.py` (required after every `openclaw update`).

---

## 1b. Control UI (webchat): user message shows "Conversation info (untrusted metadata)" block

### What you see
When you send a message (e.g. "hi, what is your name?"), the chat shows a red-bordered box above your text:

```text
Conversation info (untrusted metadata):
{ "message_id": "...", "sender": "openclaw-control-ui" }
[timestamp] hi, what is your name?
```

### Why it happens
The gateway stores every user message with an inbound metadata envelope (`message_id`, `sender`). The Control UI renders that envelope as "Conversation info (untrusted metadata)" for transparency (e.g. on Discord it can show channel/thread context). For webchat, the only metadata is `openclaw-control-ui` and a message ID, so it's just noise.

### Fix
Upstream OpenClaw fixed this by not rendering the metadata block in webchat bubbles (see [openclaw/openclaw#13989](https://github.com/openclaw/openclaw/issues/13989), PRs #14045, #22345, #22346).

- **Verified (2026-02-21):** OpenClaw **2026.2.19-2** (45d9b20) does **not** include the webchat metadata fix. The installed Control UI bundle (`index-CJS46cAv.js`) does not contain the display-layer stripping logic (no `message-extract` / `stripInbound` / “Conversation info” in the bundle). So the metadata box will keep appearing on that version. Check [OpenClaw releases](https://github.com/openclaw/openclaw/releases) for a later release that mentions webchat/inbound metadata (#22345, #22346) and upgrade to that; then restart the gateway.
- **Until then:** No patch in this repo. A future option is a Control UI bundle patch on the server (like the webchat display fix), re-applied after each `openclaw` upgrade.

---

## 1c. Cloud bot: “Add model to allow-list” — bug or feature?

**From Linode session transcript (2026-02-21):** User tried to use model `fireworks/accounts/fireworks/models/kimi-k2p5`; gateway replied "Model … is not allowed." User asked: "can you add it to the allowed list?" The assistant (Mistral) replied: *"I'm sorry, but I don't have the capability to add items to the allowed list. My functionality is limited to providing information and assistance based on the tools and data I have access to."* That response is a **bug** (model confusion): the agent does have read/write and could edit config; it should ask for permission, not claim it has no capability.

If you asked the Linode webchat bot to add a model to the allow-list and it refused or asked for permission, that is **intended behavior (feature)**, not a bug:

- **Your rules:** Never change server configuration, package, or app version without **explicit permission** (see user rules / AGENTS.md). Adding a model to the allow-list means editing `openclaw.json` (e.g. `agents.defaults.models` or `models.providers`). The bot has **read** and **write** and could do it, but it is correct to refuse or ask for confirmation before changing config.
- **If the bot said it “doesn’t have the tools” or “can’t edit config”:** That could be the model being overly cautious or misdescribing its capabilities (closer to a **bug** in model behavior). The cloud agent does have the tools to read/write workspace and config files; it is only constrained by policy (no config change without your approval, no gateway restart from chat).

So: **refusing to change config without permission = feature.** Saying it has no tools for it when it does = model confusion (bug).

---

## 2. TUI (and Control UI chat): "HTTP 401: User not found"

### Root cause (confirmed)
**"HTTP 401: User not found" comes from OpenRouter**, not from the OpenClaw gateway or TUI auth. When the agent runs (TUI or Control UI chat), it calls the OpenRouter API; OpenRouter returns 401 with "User not found" when the **API key is invalid, disabled, or not recognized**.

- Session transcripts in `~/.openclaw/agents/main/sessions/*.jsonl` show `"errorMessage":"401 User not found."` on assistant messages with `"stopReason":"error"`.
- So gateway/TUI connection is fine; the failure happens when the model request is sent to OpenRouter.

### How to fix
1. **Verify your OpenRouter API key**
   - Open [OpenRouter → Settings → Keys](https://openrouter.ai/settings/keys).
   - Confirm the key you use in OpenClaw is present and **not** disabled or deleted.
2. **Regenerate the key if needed**
   - If the key was disabled, exposed, or compromised, create a new key on the same page and use it in OpenClaw.
3. **Update the key in OpenClaw**
   - The OpenRouter key is stored in `~/.openclaw/agents/main/agent/auth-profiles.json` under the `openrouter:default` profile (`key` field).
   - After creating a new key, either:
     - Run `openclaw onboard` and go through the provider/auth step for OpenRouter again, or
     - Manually edit `auth-profiles.json` and set the new key (then restart gateway if it's running).
4. **Optional: use env for the key**
   - You can use an environment variable for the API key if your OpenClaw/OpenRouter setup supports it (see OpenClaw docs for OpenRouter auth), so the key isn't stored in plain text in the profile.

### Gateway/TUI auth (separate from this)
- TUI connects to the gateway over WebSocket; that uses `gateway.auth.token` (or device token). The 401 you see is **not** from that step; it appears when the **model run** (OpenRouter call) fails.
- So fixing the OpenRouter key should resolve "HTTP 401: User not found" in both TUI and Control UI chat.

---

## 3. Model discovery and moonshotai/kimi-k2.5

### Model scanning mechanism (intact)
Model discovery is **completely separate** from the Control UI bundle and was **not affected** by the patch:

- **Model catalog loading:** `dist/agents/model-catalog.js` uses `piSdk.discoverModels()` to scan models from the agent directory (`~/.openclaw/agents/main/`).
- **Model registry:** Models are discovered from `models.json` (auto-generated by `ensureOpenClawModelsJson()`) and the `@mariozechner/pi-coding-agent` SDK.
- **Moonshot support:** Moonshot provider is defined in `dist/agents/models-config.providers.js` with `kimi-k2.5` as the default model ID (`MOONSHOT_DEFAULT_MODEL_ID`).

### Verifying moonshotai/kimi-k2.5 availability (via OpenRouter)
**Note:** If you're using OpenRouter (not direct Moonshot provider), the model path is `openrouter/moonshotai/kimi-k2.5` (provider prefix is `openrouter`, sub-provider is `moonshotai`).

1. **Check if models.json exists:**
   ```bash
   ls -la ~/.openclaw/agents/main/models.json
   ```
   If it doesn't exist, it will be created automatically when the gateway starts or when models are scanned.

2. **List available models:**
   ```bash
   openclaw models list | grep -i "moonshot\|kimi"
   ```

3. **If openrouter/moonshotai/kimi-k2.5 doesn't appear or shows "not allowed":**
   - **Root cause:** Model discovery uses `piSdk.discoverModels()` from `@mariozechner/pi-coding-agent`, which uses a static catalog. Since `moonshotai/kimi-k2.5` is very new (created Jan 27, 2026), it may not be in the SDK's catalog yet. Additionally, OpenClaw validates models against an allowlist - models must be either in the catalog OR their provider must be in `models.providers` config.
   - **Fix:** Add OpenRouter to `models.providers` in `~/.openclaw/openclaw.json` with required fields:
     ```json
     {
       "models": {
         "providers": {
           "openrouter": {
             "baseUrl": "https://openrouter.ai/api/v1",
             "models": []
           }
         }
       }
     }
     ```
     This allows any OpenRouter model to be used, even if it's not in the SDK's catalog. The `baseUrl` and `models` fields are required by the config schema (even though OpenRouter models are discovered via the SDK, not from this config).
   - **Also add the model to allowlist:** Add `"openrouter/moonshotai/kimi-k2.5": {}` to `agents.defaults.models` in the same config file.
   - **Note:** `openclaw models scan` only scans **free** models (filters by `isFreeOpenRouterModel`), so paid models like `moonshotai/kimi-k2.5` won't appear in scan results.
   - **Future:** The SDK catalog will likely be updated in a future release to include newer OpenRouter models. Until then, this configuration allows you to use any OpenRouter model.

**Direct Moonshot provider (if not using OpenRouter):**
- If using the direct Moonshot provider instead of OpenRouter, configure `moonshot-api-key` via `openclaw onboard`
- The model would appear as `moonshot/kimi-k2.5` (provider prefix is `moonshot`, not `moonshotai`)

### Model catalog files (not corrupted)
The patch **only** modified the Control UI bundle (`index-DFDgq9AK.js`), which is frontend JavaScript. It did **not** touch:
- `dist/agents/model-catalog.js` (model discovery logic)
- `dist/agents/models-config.js` (models.json generation)
- `dist/agents/models-config.providers.js` (provider definitions including Moonshot)
- `dist/gateway/server-model-catalog.js` (gateway model catalog loader)

All model scanning/inclusion/approval logic is intact.

---

## 4. Model drift: agent uses Anthropic instead of OpenRouter

### Symptoms
- You only use OpenRouter (and e.g. Perplexity for search), but the gateway reports **"No API key found for provider anthropic"** and all queries fail or are unresponsive.
- Logs show the agent model as anthropic/... instead of openrouter/....

### Cause
OpenClaw resolves the configured model alias (e.g. `primary: "router"`) from `agents.defaults.models`. If that resolution fails, it falls back to the **built-in default provider "anthropic"** (and default model). So the drift is: something prevented the alias index from being built or used, so the code fell back to anthropic.

Common cause: **invalid config**. If `openclaw.json` contains an unrecognized key (e.g. `tools.web.search.fallback`), config validation can fail. On reload or restart the gateway may then load a stripped or default config, so `agents.defaults.models` is missing in memory and the alias "router" is not found → fallback to anthropic.

### Fix
1. **Remove invalid keys** from `openclaw.json` (e.g. remove `tools.web.search.fallback` if present). Check logs for "Unrecognized key" or "config reload skipped (invalid config)".
2. Ensure **`agents.defaults.model.primary`** and **`agents.defaults.models`** are present with your OpenRouter model(s) and alias (e.g. `primary: "router"` and an entry with `alias: "router"`).
3. **Restart the gateway** so it loads the full config. After restart, logs should show e.g. `[gateway] agent model: openrouter/mistralai/...` not anthropic.

---

## 5. Kimi-K2.5 tool calling issues: ": 0," prefix corrupting tool parameters

### Root cause
**Kimi-K2.5 (via OpenRouter) has a known bug** where it adds a `": 0,"` prefix to tool call parameters, corrupting them and causing tool calls to fail. This is a **model-level issue**, not an OpenClaw bug. The error message "The : 0, prefix keeps corrupting my tool parameters. This appears to be a session-level issue that I cannot resolve from within the conversation" is **coming from the model itself** - Kimi-K2.5 is reporting that it cannot fix its own tool call formatting.

### When it happens
- Most commonly occurs when reviewing code or git repositories (tasks that require multiple tool calls)
- The model attempts to call tools but generates malformed parameters with the `": 0,"` prefix
- Tool calls fail to parse correctly, causing the agent to report errors

### Known issue status
This is a documented issue with Kimi K2/K2.5 models when used through OpenRouter:
- [GitHub Gist documenting the issue](https://gist.github.com/ben-vargas/c7c9633e6f482ea99041dd7bd90fbe09)
- The model is advertised as supporting tool calling, but has compatibility issues when routed through OpenRouter's API
- Some users report the model generates JSON in text responses instead of actual tool calls
- Others report malformed tool calls with corrupting prefixes (your case)

### Workarounds

**Option 1: Use a different model for tool-heavy tasks**
- Switch to a fallback model (e.g., `openrouter/google/gemini-2.5-flash-lite` or `openrouter/auto`) when you need reliable tool calling
- You can temporarily change models in-session: `model openrouter/google/gemini-2.5-flash-lite`
- Or configure fallbacks in `~/.openclaw/openclaw.json`:
  ```json
  {
    "agents": {
      "defaults": {
        "model": {
          "primary": "openrouter/moonshotai/kimi-k2.5",
          "fallbacks": [
            "openrouter/google/gemini-2.5-flash-lite",
            "openrouter/auto"
          ]
        }
      }
    }
  }
  ```

**Option 2: Use direct Moonshot provider (if available)**
- If Moonshot offers a direct API (not through OpenRouter), it might have better tool calling support
- Configure via `openclaw onboard` and use `moonshot/kimi-k2.5` instead of `openrouter/moonshotai/kimi-k2.5`
- **Note:** This may not resolve the issue if it's a model-level bug, not an OpenRouter-specific problem

**Option 3: Wait for upstream fixes**
- Monitor OpenRouter/MoonshotAI for updates that fix tool calling
- Check OpenRouter's model page for `moonshotai/kimi-k2.5` for status updates
- Consider reporting the issue to OpenRouter support if not already documented

### Why OpenClaw can't fix this
- OpenClaw's transcript sanitization (`dist/agents/transcript-policy.js`) handles Google, Anthropic, Mistral, and OpenAI models, but **does not have specific handling for Moonshot/Kimi models**
- The corruption happens at the model's output level before OpenClaw receives it
- Adding Moonshot-specific sanitization would require patching the installed package and may not fully resolve the issue if the model's tool call format is fundamentally broken

### Technical details
- OpenClaw uses `resolveTranscriptPolicy()` in `transcript-policy.js` to determine sanitization rules
- Currently, Moonshot/Kimi models get `sanitizeMode: "images-only"` (minimal sanitization)
- Models like Google/Anthropic get `sanitizeMode: "full"` with additional repair logic
- Even with full sanitization, a `": 0,"` prefix in tool parameters would likely break JSON parsing

### Future improvements
- If OpenClaw adds Moonshot/Kimi-specific sanitization, it could potentially strip or repair the `": 0,"` prefix
- This would require modifying `/opt/homebrew/lib/node_modules/openclaw/dist/agents/transcript-policy.js` to detect Kimi models and apply appropriate sanitization
- However, this is a workaround for a model bug - the proper fix should come from MoonshotAI/OpenRouter

---

## 6. "Tool [name] not found" (read, exec, etc.)

### Root cause
The error `Tool read not found` or `Tool exec not found` comes from **pi-agent-core** when the agent tries to execute a tool call, but that tool is **not in the resolved tool set** passed to the agent loop. The model receives tool definitions (e.g. from the system prompt) and generates tool calls, but at execution time the gateway's tool registry doesn't include that tool.

### When it happens
- **web_search** works, but **read** and **exec** consistently fail with "Tool X not found"
- Affects proxy sessions (`agent:main:proxy:uuid`), Control UI chat, or TUI

### Likely causes

1. **Agent routing / tool policy**  
   The session uses an agent whose `tools.allow` list excludes `read` or `exec`. For example, `default_api` has `tools.deny: ["read"]` and `tools.allow: ["web_search","web_fetch","sessions_list","session_status","exec"]` — so `read` is denied for that agent. Verify which agent your session uses: `agent:main:proxy:uuid` → agent `main`; `agent:default_api:...` → agent `default_api`.

2. **Session key not passed or wrong**  
   The proxy must send `x-openclaw-session-key: agent:main:proxy:uuid` so the gateway resolves the `main` agent (full tools). If the header is missing or malformed, the gateway may fall back to an agent with restricted tools.

3. **Exec allowlist / security**  
   With `tools.exec.security: "allowlist"`, exec only runs allowlisted commands. That does **not** cause "Tool exec not found" — it would cause a different error when a command is rejected. "Tool exec not found" means the exec tool itself is missing from the tool set.

### What to check

1. **Confirm session key and agent**
   ```bash
   # In gateway logs or proxy logs, look for the session key used
   openclaw logs --follow
   ```
   For proxy/Control UI sessions, you should see `agent:main:proxy:uuid` or similar.

2. **Verify main agent config**
   In `~/.openclaw/openclaw.json`, the `main` agent should have no `tools.deny` for read/exec:
   ```json
   "agents": {
     "list": [
       { "id": "main" }
     ]
   }
   ```
   If `main` has `tools.allow` or `tools.deny`, ensure `read` and `exec` are allowed.

3. **Restart gateway and proxy**
   ```bash
   openclaw gateway   # or your usual start method
   ./start-session-proxy.sh
   ```

4. **Try a fresh session**
   Create a new session (e.g. open `http://127.0.0.1:3010/new` in a new tab) and test tool calls again.

### If it persists
- Check gateway logs for tool-resolution warnings
- Run `openclaw doctor --fix`
- Ensure no plugin or skill is overriding the agent's tool set

---

## 5b. "Unknown action exec" when taking screenshots on cloud

### Symptoms
On the Linode (or any headless cloud workspace), when the user asks for a screenshot of a URL, the agent fails with **"Unknown action exec"** and may then say it cannot take screenshots and suggest manual steps.

### Cause
The agent is calling the **process** tool with `action: "exec"`. The process tool does **not** support an "exec" action — it only supports: list, poll, log, write, kill, clear, remove. Running shell commands (including mcporter) must be done with the **exec** tool, not the process tool.

### Fix
1. **Workspace instructions:** Ensure the cloud workspace has clear instructions that the agent reads. Copy **`docs/CLOUD_SCREENSHOT_TOOLS.md`** to the workspace root on the Linode (e.g. `/root/openclaw-stock-home/.openclaw/workspace/CLOUD_SCREENSHOT_TOOLS.md`). That file states: use the **exec** tool for mcporter; never use the process tool with action "exec".
2. **AGENTS.md:** The repo `AGENTS.md` (and the copy on the server under the workspace) already says under Tools: use **exec** for URL screenshots via mcporter; process has no "exec" action. Keep that in sync on the server (e.g. overwrite `/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md` with the repo version).
3. **Optional: deny process on cloud main agent** — If the agent keeps using process for "run command" despite the above, you can add `process` to `main.tools.deny` in `/root/openclaw-stock-home/.openclaw/openclaw.json` on the Linode. Then the agent cannot call the process tool at all and must use **exec** for mcporter. Only do this if you do not need the process tool for other tasks (e.g. listing background exec sessions).

### Correct flow for URL screenshots on cloud
- **exec** with command: `mcporter call playwright.browser_navigate url=<url>`
- **exec** with command: `mcporter call playwright.browser_take_screenshot` (and optionally `filename=...`)

---

## 5c. Cloud (Linode): git clone / repo development stopped working

### Symptoms
OpenClaw on the cloud used to clone git repos and continue development (read + exec), but now it doesn’t — the agent may say it has “constraints” or “limited shell access” and offer to try `git clone` without actually running it, or you see **“Tool exec not found”** / **“Tool read not found”**.

### Likely causes (check in order)

1. **main agent has exec or read denied**  
   On the Linode, the **main** agent may have `tools.deny: ["exec"]` (or exec missing from `tools.allow`). Without **exec**, the agent cannot run `git clone` or any shell command. Without **read**, it cannot read repo files for “continue development”.  
   - **Check:** On the Linode, `cat /root/openclaw-stock-home/.openclaw/openclaw.json` and look under `agents.list` for the main agent. If you see `"tools": { "deny": ["exec"] }` or an `allow` list that omits `read` or `exec`, that’s the cause.  
   - **Fix:** Ensure the main agent used by webchat (and proxy sessions) has both **read** and **exec** allowed. Either remove `exec` (and `read` if present) from `tools.deny`, or use an explicit `tools.allow` that includes `read`, `write`, `edit`, `exec`, and any other tools you need (and omit only `browser` if you’re on headless cloud). See **CLOUD_BOT_SELF_FIX_GUIDE.md** §4 for the browser-deny pattern; do **not** deny exec/read for development use.

2. **Session resolving to a restricted agent**  
   If the session key is wrong or missing, the gateway may resolve to an agent that denies read or exec (e.g. `default_api`).  
   - **Check:** Gateway or proxy logs for the session key (e.g. `agent:main:proxy:uuid`). For webchat via the session proxy, the proxy must send `x-openclaw-session-key: agent:main:proxy:<uuid>` so the **main** agent is used.  
   - **Fix:** Update the session proxy so it sends the correct session key and path (see §7). Create a new webchat session and retry.

3. **Exec approvals blocking git on headless cloud**  
   If `~/.openclaw/exec-approvals.json` exists with `security: "allowlist"` and `ask: "on-miss"` (or `ask: "always"`), then **exec** runs but commands not on the allowlist prompt for approval. On a headless server nobody can approve in the UI, so the run may block or use `askFallback: "deny"` and reject the command.  
   - **Check:** On the Linode, `cat /root/openclaw-stock-home/.openclaw/exec-approvals.json` (if present). Look at `defaults` and `agents.main` (or the agent used by webchat). If `security` is `allowlist` and `git` (or `/usr/bin/git`) is not in the allowlist, `git clone` will not run without approval.  
   - **Fix (operator-only):** Either add `git` (or the full path e.g. `/usr/bin/git`) to the allowlist for the main agent in `exec-approvals.json`, or for the cloud-only main agent use a less strict policy (e.g. `security: "full"` or `ask: "off"` with a broad allowlist that includes git). Restart is not required for exec-approvals config changes if the gateway hot-reloads them; otherwise restart via SSH (see command card).

### Quick checklist (run on Linode via SSH)

```bash
# 1) Main agent must allow read + exec
grep -A 20 '"id": "main"' /root/openclaw-stock-home/.openclaw/openclaw.json
# Ensure no tools.deny containing "exec" or "read"; or tools.allow includes both.

# 2) Exec approvals: if present, git must be allowlisted or policy relaxed for main
test -f /root/openclaw-stock-home/.openclaw/exec-approvals.json && cat /root/openclaw-stock-home/.openclaw/exec-approvals.json

# 3) Session key (from gateway logs when you send a message)
journalctl --user -u openclaw-gateway.service -n 50 --no-pager | grep -i session
```

### After fixing
Have the user start a **new** webchat session and ask again to clone a repo and continue development. The agent should be able to call **exec** (e.g. `git clone ...`) and **read** (repo files) when the main agent has both tools and exec approvals (if any) allow git.

### Full clone → build → deploy workflow

For the complete GitHub repo development and deployment workflow (clone, build, install binary/package, push branches), see **`docs/CLOUD_GIT_DEV_OPS.md`** and the "GitHub Repository Workflow" section in the cloud workspace `AGENTS.md`. Key infrastructure:

- **Git auth:** `git config --global url."git@github.com:vidarbrekke/".insteadOf "https://github.com/vidarbrekke/"` rewrites HTTPS to SSH for owner repos. SSH key at `/root/.ssh/github`.
- **Build runtimes:** Go 1.23 (`/usr/local/go/bin/go`), Node.js v22, Python 3.12, Make/GCC.
- **Repo directory:** `/root/openclaw-stock-home/.openclaw/workspace/repositories/<name>`.
- **Deployment map:** In AGENTS.md — tells the agent where to put built output for each known repo.
- **Private repo access:** SSH key may only have access to public repos. If private repos fail, see `/root/openclaw-stock-home/.openclaw/workspace/SETUP_GITHUB_ACCESS.md`.

---

## 5d. read tool: "EISDIR: illegal operation on a directory, read"

### Symptoms
The agent repeatedly calls the **read** tool on a path that is a **directory** (e.g. `repositories/` or `workspace/repositories`). Each call returns: `"error": "EISDIR: illegal operation on a directory, read"`. The tool is allowed; the wrong tool is being used for the task.

### Cause
OpenClaw’s **read** tool is for **files** only. It does not list directory contents. Using read on a directory causes the runtime to attempt a file read and throw EISDIR.

### Fix
Use the **ls** tool to list directory contents (e.g. to see which repos exist under `repositories/`). Cloud context (`docs/CLOUD_AGENT_CONTEXT.md`) now states: for directories use **ls**, not read. If the model keeps using read on a directory, start a new session so it gets the updated context, or add a one-line reminder in the prompt/skill that **read** is files-only and **ls** is for listing directories.

---

## 5e. web_fetch returns 429 (rate limit) — run stuck comparing repos / GitHub

### Symptoms
The agent is comparing two GitHub repos or checking "what changed upstream" and repeatedly calls **web_fetch** on GitHub URLs. Each call returns **429 (Too Many Requests)**. The run appears stuck with many web_fetch errors.

### Cause
GitHub (and some other hosts) rate-limit requests. Repeated web_fetch of the same or similar URLs triggers 429. The model keeps retrying instead of switching strategy.

### Fix
Use **local git** and **read** instead of web_fetch for repo comparison. In the cloned repo under `workspace/repositories/<name>`: run **exec** with `git fetch origin` (or the upstream remote), then `git log HEAD..origin/main --oneline`, `git diff origin/main --stat`, and **read** local README or docs. Cloud context (`docs/CLOUD_AGENT_CONTEXT.md`) now tells the agent: for comparing repos/upstream, use exec+git and read; do not retry web_fetch on 429. If the run is already stuck, start a new session and ask again; the agent should then use git + read.

---

## 5f. memory_search loop — "check repo sync" or similar gets stuck

### Symptoms
The user asks whether a local repo is in sync with the remote (e.g. "check if local repo is in sync with remote", "was it cloned right?"). The agent repeatedly calls **memory_search** with queries like "MK-MCP repository sync status" and gets only irrelevant results (e.g. auto-created memory date files). It never runs **exec** or **git** in the repo.

### Cause
memory_search searches the **vector index of memory/workspace files**, not the git state of a repo. Git sync status requires **exec** in the repo dir (`git remote -v`, `git fetch`, `git status`). The model (often Mistral Small when used as the only model) keeps retrying memory_search instead of switching strategy.

### Fix
Use **exec** in `workspace/repositories/<name>`: e.g. `cd workspace/repositories/mcp-motherknitter && git remote -v && git fetch origin && git status`. Cloud context (`docs/CLOUD_AGENT_CONTEXT.md`) now states: for repo sync / git status use exec+git, not memory_search. If the run is already stuck, start a new session. Optionally configure the router to delegate git/repo tasks to a more capable model so it uses exec+git instead of looping on memory_search.

---

## 5g. Default (router) model says "I don't have access to the tools"

### Symptoms
The primary/default model (e.g. Mistral Small 3.2 24B, used as "router") responds to requests like "add instructions to AGENTS.md" or "edit the router config" with: "I don't have the necessary access to the tools" or "I can guide you on how to approach this" instead of using **read** / **edit** / **write** / **exec**.

### Cause
The agent has the same tool set regardless of model. Smaller models sometimes (1) refuse or self-limit because they are cautious, or (2) infer from "routing" instructions that they should only delegate and not edit. So they answer in text instead of calling tools.

### Fix
- **AGENTS.md** now states explicitly: you have full tool access; do not refuse with "I don't have access"; for adding or editing instructions (AGENTS.md, docs, config), do it yourself with read + edit/write; only delegate when the task clearly needs a different model (vision, long coding, etc.).
- If the default model still refuses, switch model in-session (e.g. `model <fallback>`) for that request, or use a session that already uses a more capable model.

---

## 7. Useful paths and commands

- **Config (Linode stock-home):** `/root/openclaw-stock-home/.openclaw/openclaw.json` (or `~/.openclaw/openclaw.json` if not using stock-home) (or `~/.clawdbot/clawdbot.json` if symlinked)
- **Device identity:** `~/.openclaw/identity/device.json`
- **Paired devices:** `~/.openclaw/devices/paired.json`
- **OpenRouter auth profile:** `~/.openclaw/agents/main/agent/auth-profiles.json`
- **Moonshot auth profile:** `~/.openclaw/agents/main/agent/auth-profiles.json` (look for `moonshot:default` if using direct Moonshot, or `openrouter:default` if using via OpenRouter)
- **Models registry:** `~/.openclaw/agents/main/models.json` (auto-generated)
- **Gateway logs:** `~/.openclaw/logs/gateway.log` or `/tmp/openclaw/openclaw-*.log`
- **Start gateway:** `openclaw gateway`
- **Start dashboard (tokenized):** `openclaw dashboard`
- **TUI (with optional token):** `OPENCLAW_GATEWAY_TOKEN=<same-as-gateway.auth.token> openclaw tui`  
  Or ensure `gateway.remote.token` in config matches `gateway.auth.token` when using remote mode.
- **List models:** `openclaw models list`
- **Onboard (configure providers):** `openclaw onboard`

---

## 6b. "disconnected (1008): unauthorized: gateway token missing" (remote dashboard)

### Symptoms
You open the OpenClaw dashboard via a remote URL (e.g. Tailscale: `https://localhost-0.xxxxx.ts.net`) and see a red banner: **"disconnected (1008): unauthorized: gateway token missing (open the dashboard URL and paste the token in Control UI settings)"**. The Config page shows "Schema unavailable" and there is no visible field to paste the token.

### Cause
The Control UI connects to the gateway over WebSocket and must send the gateway token to authenticate. When you open the dashboard **directly** (not via a proxy that injects the token), the browser never has the token, so the WebSocket is rejected and the UI stays disconnected. Because Config is loaded only after a successful connection, you never see a "paste token" field.

### Fix
**Pass the token in the URL.** The Control UI reads the `token` query parameter and uses it for the WebSocket connection. Open the dashboard with your token appended:

```
https://YOUR-DASHBOARD-HOST/?token=YOUR_GATEWAY_TOKEN
```

Example (Tailscale, dummy token):

```
https://localhost-0.tail590941.ts.net/?token=oc_demo_token_replace_me_0123456789abcdef
```

You can also add `?token=...` to any path (e.g. `/config?token=...`). After the first successful load, the UI often stores the token (e.g. in localStorage), so you may not need it in the URL on later visits.

**On the server:** The token in the URL must match `gateway.auth.token` in `~/.openclaw/openclaw.json` on the machine running the gateway. Set it there (or via `openclaw onboard`) and restart the gateway if you change it.

---

## 8. Session proxy: responses disappear from chat UI

### Symptoms
When using the session proxy, assistant replies vanish from the chat UI before they complete or immediately after completing.

### Root cause (fixed)
The WebSocket upgrade handler was forwarding the full path (e.g. `/s/proxy:xxx/`) to the gateway. The gateway expects `/` or `/ws`, not `/s/proxy:xxx/`. The WebSocket failed to connect properly, so the Control UI never received the `chat` / `state: "final"` event. Without that event (or with a broken WebSocket), the UI clears the streaming content and doesn't refresh history — the message appears to disappear.

### Fix applied
1. **WebSocket path stripping:** The proxy now strips `/s/:sessionKey` from the WebSocket upgrade path before forwarding (same as HTTP). So `/s/proxy:xxx/` → `/`, `/s/proxy:xxx/ws` → `/ws`. The gateway receives the path it expects.
2. **Request headers:** The proxy uses `delete` for `content-length` and `transfer-encoding` when buffering request bodies, instead of invalid values.
3. **Session header for all requests:** The proxy now injects `x-openclaw-session-key` for **every** proxied request when a session exists, not just POST to chat.
4. **Session key format:** The proxy now uses the gateway's canonical format `agent:main:proxy:uuid` (was `proxy:uuid`). The Control UI filters chat events by `sessionKey`; when the gateway broadcasts "final" with `agent:main:proxy:uuid` but the UI had `proxy:uuid`, the event was ignored and history never refreshed.

Update to the latest clawd/openclaw-session-proxy.js and restart the proxy.

### If it persists
1. **Verify Control UI fix:** Section 1 above — if replies don't show when state becomes "final", the Control UI may need the history-refresh patch.
2. **Confirm proxy wiring:** Restart the proxy and re-test to isolate proxy vs. Control UI vs. gateway behavior.
3. **Check proxy logs:** `/tmp/openclaw-proxy.log` — look for `WebSocket upgrade -> session: ... path: /` to confirm path stripping.

---

## 7b. Cloud instance: best approach (recent reply/thinking + browser message)

If the cloud bot has **recently** started (a) not showing replies until session Refresh with the thinking animation stuck until page reload, and/or (b) replying with "The browser control service is not running. Please restart the OpenClaw gateway", treat them as follows.

### Reply/thinking issue (very recent)

- **Cause:** Control UI is not receiving or not acting on the `chat` / `state: "final"` event (see §1 "On the OpenClaw cloud server"). Common after an OpenClaw upgrade (patch in the UI bundle is overwritten) or if the session proxy or path/sessionKey changed.
- **Best approach (in order):**
  1. **Session proxy:** Ensure the proxy on the server is the latest version (WebSocket path strip to `/`, session key `agent:main:proxy:uuid`, `x-openclaw-session-key` on all requests). Restart the proxy and check logs for `WebSocket upgrade -> session: ... path: /`.
  2. **Re-apply Control UI patch:** On the Linode, the history-refresh patch lives inside the installed OpenClaw package and is **overwritten on every upgrade**. Find the current bundle under the global openclaw install (`.../node_modules/openclaw/dist/control-ui/assets/index-*.js`) and re-apply the one-line fix (call load-history when `chat` event has `state: "final"` or `"aborted"`). See §1 "Fix applied" for the pattern.
  3. **Workaround:** Users can click the Chat tab **Refresh** to load history and see the reply; a full page reload clears the thinking animation until the patch is back in place.

### "Browser control service not running / restart gateway" (trivial)

- **Cause:** The main agent has the `browser` tool allowed. On a headless cloud server the browser/Playwright service does not run. When the agent (or a skill) tries to use the browser tool, OpenClaw returns that error and the model echoes it. The suggested fix ("restart the gateway") is for local use and is wrong on the cloud.
- **Best approach:** Disable the browser tool for the main agent on the cloud so it never tries and never suggests restarting the gateway for that. In `/root/openclaw-stock-home/.openclaw/openclaw.json`, under `agents.list` for the main agent, add `"tools": { "deny": ["browser"] }` (or use an allow list that omits `browser`). See **CLOUD_BOT_SELF_FIX_GUIDE.md** §4. No gateway restart needed (hot-reload). For browser automation, use a local OpenClaw instance.

---

## Telegram: current setup and next steps

### Status update (supersedes older spawn-based notes for Vidar DM)

As of Feb 2026, the stable production pattern for Vidar Telegram gift-card chat is:

- Route Vidar direct Telegram to `telegram-vidar-proxy`.
- In proxy, use direct `exec` calls to `mcp-motherknitter` CLI.
- Do not use `sessions_spawn` for this path.
- Use MCP `--format json` output and compose one natural-language user reply.

This supersedes earlier notes that relied on `main` + `sessions_spawn` auto-announce behavior for Vidar DM.

### Current state (Linode)

- **Routing:** `telegram-sender-router` hook: Vidar (`5309173712`) → **main** (same agent as webchat); everyone else → **telegram-isolated**. One **stable session** per (agent, channel, sender): `agent:main:telegram:5309173712`. Conversation persists across messages; `/new` resets it.
- **Gift-card:** Main asks for code → user sends code → main spawns `local-ops` with node CLI → auto-announce delivers balance. Main must not call subagents/sessions_history/sessions_send/session_status after spawn (see main workspace `AGENTS.md`).
- **Monitoring:** Ops report at `memory/ops-combined-report.md` includes Telegram Routing (vidar_to_main_24h, duplicate_message_id_24h, etc.).

### Current stable routing (Vidar DM)

- Vidar direct Telegram should bind to `telegram-vidar-proxy`.
- `telegram-vidar-proxy` tool surface should be minimal (`exec`, `read`).
- Proxy policy should enforce:
  - one final message per turn
  - no progress/system relay chatter
  - no generic "no tools" response for gift-card intent
  - clarification question on ambiguity

### MCP output modes (agent-friendly)

`mcp-motherknitter` gift-card tools support:

- `--format text`
- `--format compact`
- `--format json`

For agent execution paths, prefer `--format json` to reduce parsing errors, accidental field leakage, and token burn from retries.

### Quick diagnosis for duplicate Telegram messages

If duplicates reappear:

1. Confirm Vidar DM binding still points to `telegram-vidar-proxy`.
2. Confirm proxy is not using `sessions_spawn` for gift-card flows.
3. Confirm proxy AGENTS policy still bans progress/relay chatter.
4. Confirm proxy uses MCP `--format json` command templates.
5. Run a 3-turn smoke test (`lookup`, `update`, `timeline`) and inspect transcript for one reply per turn.

### Telegram gift-card: duplicate messages and two balance amounts (fixed: MCP-only)

**What you may see** after sending a gift card code:

- One line: `✅ Subagent local-ops finished` and e.g. `$53.40`
- A second line: `Subagent local-ops finished with Balance: 100.00`

So: **two** delivery lines and sometimes **two different** balance amounts (e.g. $53.40 vs 100.00).

**Likely causes:**

1. **Stale announce** — OpenClaw may deliver subagent completion keyed by **Telegram peer**, not by session. A **previous** session’s completion (e.g. "Balance: 100.00") can be delivered again in the **current** session. The amount that matches the code you just sent (or the most recent one) is the one to trust.
2. **Two delivery paths** — The gateway can send (a) the subagent auto-announce (e.g. "Subagent local-ops finished" plus the tool result like "$53.40"), and (b) another message if the parent agent also replies after spawn, producing duplicate or redundant lines.

**What to do:**

- **Single reply:** Main's `AGENTS.md` already says: after `sessions_spawn` for gift-card, do not send any follow-up. User gets the balance only from the auto-announce.
- **Which balance to trust:** Use the balance that matches the code you just sent, or the last one in the thread.
- **One clean "Balance: $X.XX" in Telegram:** Would require upstream OpenClaw changes (e.g. subagent announce format, or session-keyed delivery so the previous session’s announce is not re-delivered). No config-only fix in this repo.

**Fix applied (Feb 2026):** Telegram gift-card now uses **MCP only** (mcporter), not sessions_spawn, so the user gets a single reply. See [TELEGRAM_GIFTCARD_MCP_ONLY.md](TELEGRAM_GIFTCARD_MCP_ONLY.md). Patch script: `scripts/patch-telegram-giftcard-mcp-only.py` (run on the Linode). If duplicates reappear, re-run the patch so server AGENTS.md has "Telegram Gift Card Handling (Hard Rule — MCP only)".

### Next steps

1. **Verify flow** — In Telegram: `/new`, then “can you check the balance on a giftcard for me?” → reply should ask for code only. Send code → you get at least one reply with the balance; duplicate lines or two amounts are the known quirk above. If you see a stale balance in a new session before sending a code, that's the same peer-keyed delivery quirk; the agent is instructed not to echo it and to ask for the code. 
2. **Stale announce** — If the gateway sometimes delivers a previous session’s subagent completion to a new session (same Telegram peer), that’s likely delivery keyed by peer not session. No config fix in this repo; options are document, work around (main asks for code), or report upstream to OpenClaw.
3. **Watch assertions** — Check `memory/ops-combined-report.md` (or ops-guard skill) for “Telegram Routing Assertions” and fix any breach (e.g. duplicate_message_id_24h &gt; 25).
4. **Optional** — If you want Telegram-specific formatting (e.g. no markdown tables), add a short note in main `AGENTS.md` under platform formatting (Discord/WhatsApp style already there).

---

## 9. Telegram: not receiving messages (channel not starting)

### Root cause
The OpenClaw config had no `channels.telegram` section. Without it, the gateway never starts the Telegram provider (which does long-polling via grammY `getUpdates`). There is no separate cron job or daemon—Telegram runs inside the gateway process.

### Fix applied
Added `channels.telegram` to `~/.openclaw/openclaw.json`:

```json
"channels": {
  "telegram": {
    "enabled": true,
    "dmPolicy": "pairing"
  }
}
```

### Bot token required
The Telegram channel only starts when a bot token is resolved. Add one of:

1. **Environment variable** (recommended if you don't want the token in config):
   ```bash
   export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
   ```
   Then start the gateway (e.g. `openclaw gateway`).

2. **Config** (stored in openclaw.json):
   ```json
   "channels": {
     "telegram": {
       "enabled": true,
       "botToken": "123456:ABC-DEF...",
       "dmPolicy": "pairing"
     }
   }
   ```

### Restart required
After changing config, restart the gateway:
- If using LaunchAgent: `launchctl kickstart -k gui/$UID/ai.openclaw.gateway`
- Or stop and start: `openclaw gateway`

### Verify it's running
- `openclaw logs --follow` — look for `[default] starting provider` or `[telegram]` entries.
- Control UI → Channels tab — Telegram should show as started/connected.

---

## 10. Telegram: `setMyCommands failed: 400 Bad Request: BOT_COMMANDS_TOO_MUCH`

### Root cause
OpenClaw registers native slash commands (e.g. `/model`, `/context`, skill commands) via `setMyCommands`. Skills add many commands; with many skills you can exceed the Telegram Bot API limit (100 commands per scope). Even after truncation to 100, some setups still get this error (possibly due to scope or payload limits).

### Fix applied
Disable skill commands for Telegram in `~/.openclaw/openclaw.json`:

```json
"channels": {
  "telegram": {
    "enabled": true,
    ...
    "commands": {
      "nativeSkills": false
    }
  }
}
```

This keeps core commands (`/model`, `/context`, etc.) but excludes skill-specific commands, typically reducing the count to ~20–40.

### If error persists
Use a more aggressive option to disable all native command registration:

```json
"channels": {
  "telegram": {
    "commands": {
      "native": false
    }
  }
}
```

This clears the Telegram command menu entirely. Slash commands still work when typed manually; they just won't appear in the menu.

### Restart required
Restart the gateway after config changes: `launchctl kickstart -k gui/$UID/ai.openclaw.gateway` or stop/start `openclaw gateway`.

---

## 11. Gateway startup: "blocked model (context window too small)" / FailoverError

### Symptoms
On gateway start you see:

- `[agent/embedded] low context window: ollama/mistral-small-8k ctx=8192 (warn<32000)`
- `[agent/embedded] blocked model (context window too small): ollama/mistral-small-8k ctx=8192 (min=16000)`
- `[diagnostic] lane task error: lane=main ... error="FailoverError: Model context window too small (8192 tokens). Minimum is 16000."`
- Same for `lane=session:agent:main:main`

### Cause
The OpenClaw gateway (npm package) enforces:

- **Minimum context:** 16 000 tokens. Models below that are **blocked** for the main/session agent and are not used.
- **Warning threshold:** 32 000 tokens. Models below that log a "low context window" warning but can still be used if they meet the minimum.

`ollama/mistral-small-8k` has an 8192-token context window, so it is below both the minimum and the warning threshold. The gateway marks it as blocked; when the main agent (or a lane task) is configured or defaulted to that model, the run fails with `FailoverError`.

### Fix (no code changes in clawd)
This behavior is in the **openclaw** package (e.g. `dist/agents/model-catalog.js` or gateway model catalog), not in the clawd repo.

1. **Use a model with ≥16k context for the main agent**
   - In `~/.openclaw/openclaw.json`, set the default model to one with context ≥16k (e.g. another Ollama model, or an API model).
   - Example: `agents.defaults.model` (or the equivalent in your config) to something like `ollama/mistral` (if that variant has 16k+), or `openrouter/...`, etc.
2. **If using session overrides**
   - Ensure `ollama/mistral-small-8k` is not the only or first choice for the main agent, or remove it from the list so the gateway can pick an allowed model.
3. **If you must use mistral-small-8k**
   - You would need a change in the openclaw package (e.g. a configurable minimum context or an override to allow smaller models). That is outside this repo; consider opening an issue or PR on the OpenClaw upstream.

### Summary
- **Cause:** Gateway blocks models with context < 16k; mistral-small-8k has 8k.
- **Change needed in clawd:** None.
- **What to do:** Point the main agent (and session defaults) at a model with ≥16k context, or remove mistral-small-8k from the main/session model selection.

---

## 12. LLM request rejected: unexpected `tool_use_id` in `tool_result` blocks

### Symptoms

You see an error from the LLM provider (OpenRouter or OpenAI-compatible API), for example:

```text
LLM request rejected: messages.6.content.0: unexpected `tool_use_id` found in `tool_result` blocks: call_2dd771680c144164a9777d8d. Each `tool_result` block must have a corresponding `tool_use` block in the previous message.
```

### What it means

The API requires a strict message order for tool use:

- Every **tool_result** (user/tool message) must refer to a **tool_use_id** that appears in the **immediately previous** assistant message.
- If the request has a `tool_result` with id `call_xxx` at e.g. `messages.6`, then `messages.5` must be an assistant message that contains a `tool_use` with that same id.

So the request the gateway is sending has at least one **tool_result** whose **tool_use** was in an earlier message that is no longer the “previous” assistant message—e.g. the pairing was broken when building the messages array.

### Likely causes

1. **Context pruning / compaction**  
   OpenClaw may prune or compact the transcript to fit the context window. If it **removes** an assistant message that contained `tool_use` blocks but **keeps** the next message that contained the corresponding `tool_result` blocks, the resulting sequence is invalid: a user message with `tool_result` ids that don’t appear in the previous assistant message.

2. **Session transcript order**  
   Session history (e.g. in `~/.openclaw/agents/main/sessions/`) could be reordered, merged, or corrupted so that tool_use and tool_result no longer sit in adjacent assistant → user pairs.

3. **Gateway or provider bug**  
   The code that builds the `messages` array from the transcript might drop or reorder messages in a way that breaks tool_use/tool_result pairing (e.g. when trimming by tokens or when merging multiple turns).

### Verified for session `agent:main:cron:aedc6292-1cbc-4b3a-bc8d-563e0f453fad`

For this cron (openclaw-update) session the transcript file is `~/.openclaw/agents/main/sessions/09c595e4-a9d5-4c22-87e3-28c7bd5d0794.jsonl` (106 lines). On disk the pairing is **correct**: the assistant message at line 10 contains `tool_use` id `call_2dd771680c144164a9777d8d`, and line 11 is the corresponding `tool_result`. The API error says the invalid `tool_result` appears at **messages.6** with no matching `tool_use` in the **previous** message. So when the gateway builds the request it is **trimming** the transcript (to fit the context window) and is including the tool_result at index 6 but **dropping** the assistant message that contained that tool_use (or reordering so it is no longer the immediately previous message). That confirms **compaction/trimming** is the cause for this session.

### What you can do

1. **Start a new session**  
   Use a new chat/session so the transcript is short and no pruning has happened yet. If the error goes away, the problem is almost certainly transcript length / compaction or a bad state in the old session.

2. **Relax or disable compaction (if configurable)**  
   In `~/.openclaw/openclaw.json`, check `agents.defaults.compaction` and any **contextPruning** (or similar) options. If you can turn compaction off or make it less aggressive, try that and see if the error stops. Compaction that only removes “old” messages without preserving assistant→tool_result pairs can cause this.

3. **Report upstream**  
   If the error persists even in new sessions or after disabling compaction, it’s likely a bug in the OpenClaw gateway (or the pi-ai / OpenAI-completion layer) when building the messages array. Report to OpenClaw with: the exact error text, whether it happens in a new session, and your compaction/context-window settings.

### Fix applied (make it stick)

A guard was added in **pi-ai** `transform-messages.js`: before pushing a `tool_result` onto the messages array, we check that the previous message is an assistant containing a `toolCall` with that id. If not, the `tool_result` is skipped (orphan dropped), so the API never receives an invalid sequence. This is in the globally installed OpenClaw dependency; re-apply after upgrades. See `docs/patches/README.md` and `docs/patches/pi-ai-orphan-tool-result.patch`.

### Summary

- **Cause:** The request sent to the LLM has a `tool_result` whose `tool_use_id` is not in the immediately previous assistant message (often due to pruning/compaction or transcript reorder).
- **Quick mitigation:** New session; optionally disable or reduce compaction.
- **Long-term fix:** Applied in pi-ai `transform-messages.js` (skip orphan tool_results). Re-apply patch after `npm install -g openclaw`.

### Getting the cron session back on track

1. **Operator-only restart (if required)** so the patched code is loaded. Do not trigger restart from chat/agent exec.
2. **Do nothing else** – the next time the cron runs (e.g. openclaw-update at 00:01), the guard will drop any orphan `tool_result` and the request should succeed.
3. **Optional – force a clean run:** If you want that session to start with a short transcript instead of the long one, you can clear the cron session transcript so the next run is effectively fresh:
   - Session key: `agent:main:cron:aedc6292-1cbc-4b3a-bc8d-563e0f453fad`
   - Transcript file: `~/.openclaw/agents/main/sessions/09c595e4-a9d5-4c22-87e3-28c7bd5d0794.jsonl`
   - Back it up, then truncate to only the session header (first line, `{"type":"session",...}`). Or leave the file as-is and rely on the patch.

You don’t need to prompt OpenClaw in chat; just restart the gateway and let the next scheduled run (or a manual trigger) use the fixed code.

### Running pending cron jobs manually

From this repo, the CLI often hits **gateway timeout** when talking to `ws://127.0.0.1:18789` (e.g. from Cursor's environment). Run crons from your own terminal on the same machine as the gateway:

```bash
# From repo root; token is read from ~/.openclaw/openclaw.json
./scripts/run-pending-cron-jobs.sh
# Optional: longer timeout (default 120s)
./scripts/run-pending-cron-jobs.sh --timeout 180000
```

Or run a single job:

```bash
openclaw cron run aedc6292-1cbc-4b3a-bc8d-563e0f453fad --timeout 120000 --expect-final
openclaw cron run c5a44eb8-5a5e-43a2-a342-85bb87cdb800 --timeout 120000 --expect-final
```

Ensure the gateway is running (`openclaw gateway` or your usual start) before running.

### Direct cloud dashboard access (no tunnel)

To reach the OpenClaw dashboard on a cloud server by IP (no Tailscale/SSH tunnel):

1. **Bind the gateway to all interfaces**  
   In `~/.openclaw/openclaw.json` on the server, set `gateway.bind` to **`"lan"`** (not `"0.0.0.0"` — the CLI only accepts: `loopback` | `lan` | `tailnet` | `auto` | `custom`). Example:
   ```json
   "gateway": { "port": 18789, "bind": "lan", "auth": { "token": "YOUR_TOKEN" } }
   ```
2. **Open port 18789** on the server (e.g. `ufw allow 18789/tcp` and `ufw reload`). If the host is behind a cloud firewall (e.g. Linode Cloud Firewall), allow inbound TCP 18789 there too.
3. **Restart the gateway** (`pkill -f openclaw` then `nohup openclaw gateway &` or your usual start).
4. **In your browser:** `http://SERVER_IP:18789/?token=YOUR_TOKEN`

---

## 13. Telegram: message sent but no reply (or reply after many minutes)

### Symptoms
You send a question via Telegram (e.g. “What’s the balance on gift card SZ58-RH4G-J5YF-PVYH?”) and get no answer, or the answer arrives only after several minutes.

### Likely causes (check in this order)

1. **Message never reaches the gateway**
   - In gateway logs (`openclaw logs --follow` or `~/.openclaw/logs/gateway.log`), confirm that the Telegram message is received when you send it (look for `[telegram]` or incoming message/update).
   - If nothing appears, see **§8. Telegram: not receiving messages** — channel may not be started or bot token missing.

2. **MCP server (e.g. motherknitter) not used or not responding**
   - The gateway runs the **model**; the model decides whether to call MCP tools. If the model is slow, doesn’t call the tool, or the MCP process hangs, you get no or delayed reply.
   - **Quick check:** Run the same query **without Telegram** so you know the tool path works:
     - From the mcp-motherknitter repo:  
       `node build/cli.js giftcard_lookup --code "SZ58-RH4G-J5YF-PVYH"`
     - Or via mcporter:  
       `mcporter call motherknitter.giftcard_lookup code:SZ58-RH4G-J5YF-PVYH`
   - If the CLI/mcporter returns in a few seconds, the MCP server and backend are fine; the delay is in **Telegram → gateway → model → MCP** or in the model itself.

3. **Model slow or not calling tools**
   - Some models (e.g. Kimi-K2.5 via OpenRouter) can be slow or have tool-calling bugs (see **§4**). Try the same question in the **Control UI** or **TUI** with the same agent; if it’s slow or fails there too, the issue is model/agent, not Telegram.
   - Check gateway logs for tool calls to `motherknitter` or `giftcard_lookup` and for any errors or timeouts.

4. **Reply not sent back to Telegram**
   - Gateway might complete the run but not deliver the reply to the Telegram channel (e.g. wrong session, delivery flag, or channel error). Check logs for “deliver” or “telegram” after the run finishes; check Control UI Channels tab for Telegram status.

### Checklist (user-friendly)

| Step | Action |
|------|--------|
| 1 | Send the Telegram message again and run `openclaw logs --follow`. Do you see the message logged? |
| 2 | Run `node .../mcp-motherknitter/build/cli.js giftcard_lookup --code "SZ58-RH4G-J5YF-PVYH"`. Does it return a balance in &lt;5 s? |
| 3 | Ask the **same question** in the Control UI or TUI. Do you get a reply there? |
| 4 | In gateway logs, after sending via Telegram, do you see a tool call to `giftcard_lookup` or the motherknitter server? |
| 5 | In `mcp-motherknitter/logs/audit-YYYY-MM-DD.log`, do you see an entry for `giftcard_lookup` around the time you sent the Telegram message? (If yes, the MCP was called; the bottleneck is elsewhere.) |

### If the CLI works but Telegram doesn’t
The problem is between Telegram and the gateway, or between the gateway and the model (e.g. model not invoking the tool, or very slow). Focus on gateway logs, channel config, and model/session used for Telegram. Ensure the agent used for Telegram has access to the motherknitter MCP (e.g. skill/MCP config in `mcporter.json` and agent tools).

### Specific case: reply stops after “Let me look that up using the MCP server:”
**What you see:** The bot replies with that sentence, then nothing — no balance, no error, no further message.

**What’s going on:** The model received your message, decided to use the MCP server, and streamed that text. Then it should issue a **tool call** (e.g. `giftcard_lookup`). One of these is failing:

1. **MCP tool never runs** — The gateway doesn’t invoke the motherknitter MCP, or the invocation fails (spawn/timeout/wrong tool name). Check `mcp-motherknitter/logs/audit-YYYY-MM-DD.log`: if there is **no** `giftcard_lookup` entry around the time you sent the Telegram message, the MCP server was never called. The fix is on the gateway/OpenClaw side: ensure the **main** agent (Telegram uses `agent:main:main`) has the motherknitter MCP in its tool set and that the gateway actually forwards tool calls to that server.
2. **Tool runs but final reply not delivered** — If the audit log **does** show a `giftcard_lookup` at that time, the MCP ran; the problem is that the gateway never sends the model’s final reply (with the balance) back to Telegram. Check gateway logs for that run (e.g. `chat.send` with `deliver` or Telegram delivery) and any errors after the tool returns.

**Quick check:** Run the same question in **Control UI** (same agent/session type as Telegram). If you get the full answer there but not in Telegram, the issue is delivery to the Telegram channel. If you also get the truncated “Let me look that up…” with no balance in Control UI, the issue is MCP invocation or tool execution for that run.

---

## 14. Webchat session healthcheck (disconnect spikes)

If webchat replies appear to stall, require refreshes, or the spinner gets stuck, run:

```bash
/root/openclaw-stock-home/.openclaw/scripts/check-webchat-session-health.py --json
```

What it checks:

- `openclaw-gateway.service` and `openclaw-session-proxy.service` are active
- Gateway/proxy ports are listening (`18789`, `3010`)
- Last 30 minutes of gateway logs for webchat close spikes:
  - `1006` abnormal disconnects
  - `1008` auth/pairing disconnects
  - `1012` restart disconnects

Exit codes:

- `0` healthy
- `2` warning
- `3` critical

### Disconnect cause analyzer

To identify the top root causes behind `1008`/`1012`:

```bash
/root/openclaw-stock-home/.openclaw/scripts/analyze-webchat-disconnect-causes.py --window-minutes 120 --json
```

This groups disconnects by reason (e.g. `pairing required`, `device token mismatch`, `service restart`) and prints suggested fixes.
