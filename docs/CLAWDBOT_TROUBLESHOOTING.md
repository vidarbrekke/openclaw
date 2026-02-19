# OpenClaw (formerly Clawdbot/moltbot) troubleshooting notes

## 0. Cloud bot (Linode): queries take minutes or get stuck

### Root cause (Feb 2026)
Two things were happening on the Linode gateway:

1. **Read-tool loop:** The agent was repeatedly calling the `read` tool in a way that failed validation: "Missing required parameter: path". This is a **known OpenClaw bug** (not model-specific): many models (including Mistral) follow OpenAI/Claude-style tool schemas and send **`file_path`**, while the gateway historically required **`path`**. Validation ran before the alias was applied, so the model kept retrying with `file_path` and the gateway kept rejecting it. See [openclaw/openclaw#2596](https://github.com/openclaw/openclaw/issues/2596); **fixed in PR #7451** (Feb 2026). So the problem was the tool schema mismatch, not Mistral being unable to use tools.
2. **Long timeout:** The embedded run timeout was the default 600 seconds (10 minutes). So every stuck run burned the full 10 minutes, then OpenRouter was put in cooldown and follow-up requests failed with "all in cooldown or unavailable".

So queries appeared to "take minutes" or "get stuck" because the agent was stuck in that tool-call loop until the 10-minute timeout.

### Fix applied (Linode)
On the Linode (`/root/.openclaw/openclaw.json`):

1. **Lower run timeout:** `agents.defaults.timeoutSeconds` set to **120** (2 minutes). Stuck runs now fail fast instead of burning 10 minutes.
2. **Primary model left as `router`** (Mistral Small 3.2 24B) for the routing skill (router evaluates task complexity and routes to specialist models). Fallbacks: **default** (Qwen), **writer** (Haiku), **generalist** (Gemini Flash).

With OpenClaw 2026.2.17 the read-tool `file_path`→`path` fix should be in place. If the loop reappears, ensure the Linode is on a recent OpenClaw version that includes the fix.

### If it happens again
- Check gateway logs: `ssh root@45.79.135.101 'journalctl --user -u openclaw-gateway.service -n 100'`. Look for `read tool called without path` or `embedded run timeout`.
- Confirm OpenClaw version on Linode includes the read-tool alias fix (e.g. `openclaw --version` or check release notes for #7451).
- To change timeout or model on the Linode: edit `/root/.openclaw/openclaw.json` (e.g. `agents.defaults.timeoutSeconds`, `agents.defaults.model.primary`), and apply only operator-approved restart procedures. Never execute restart/stop from chat/agent exec.

---

## Operator runbook (strict + phased mode)

Use this when the cloud bot appears slow, stuck, or disconnected.

### Current operating model

- Conversational sessions must not execute gateway lifecycle commands.
- Gateway lifecycle actions are operator-only via manual SSH.
- Guardrails are policy-first, with transparent status in:
  - `/root/.openclaw/workspace/memory/ops-combined-report.md`

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
   cat /root/.openclaw/workspace/memory/ops-combined-report.md
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
   cp /root/.openclaw/var/rollback/10-websearch-guard.conf.bak /root/.config/systemd/user/openclaw-gateway.service.d/10-websearch-guard.conf
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

## 1. Control UI: replies not showing (FIXED)

### Root cause
The gateway correctly runs the model, appends the assistant message to the transcript, and broadcasts a `chat` event with `state: "final"` (and optionally the message in the payload). The Control UI **receives** this event and clears the "streaming" state (`chatStream`, `chatRunId`, `chatStreamStartedAt`) but **does not refresh the message list**. So `chatMessages` is never updated with the new assistant reply, and the UI keeps showing the spinner/placeholder.

- `deliver: false` in `chat.send` is **unrelated** to this. The gateway does not use `deliver` for the webchat path; it only affects whether the reply is sent to an external channel (e.g. WhatsApp). Replies are always written to the session transcript.
- `chat.history` does return the full history (including the new message) when called after the run completes; the bug was purely that the UI did not call `chat.history` when it received the `chat` / `state: "final"` event.

### Fix applied
A one-line patch was applied to the Control UI bundle so that when a `chat` event with `state: "final"` (or `"aborted"`) is received, the UI also calls the load-history function (`St(e)` in the minified bundle), which fetches `chat.history` and updates `chatMessages`. That makes the new assistant message appear without a manual refresh.

**Files patched (in the globally installed package):**
- Old: `.../node_modules/clawdbot/dist/control-ui/assets/index-Cl-Y9zqE.js` (2026.1.24-3)
- New: `.../node_modules/openclaw/dist/control-ui/assets/index-DFDgq9AK.js` (2026.1.29)

**Note:** This patch lives inside the npm-installed package. It will be overwritten on the next `npm install -g openclaw` or upgrade. For a permanent fix, the upstream Control UI should be updated to refresh history (or merge the final message from the event) when `state === "final"`.

**Model scanning is NOT affected:** The patch only touches the Control UI bundle (frontend JavaScript). Model discovery happens via `piSdk.discoverModels()` which scans from the agent directory (`~/.openclaw/agents/main/`) and is completely separate from the UI bundle. The model catalog code (`dist/agents/model-catalog.js`, `dist/gateway/server-model-catalog.js`) is untouched.

### Workaround if you revert the patch
After sending a message, click the **Refresh** button in the Chat tab (or switch session and back) so the UI calls `chat.history` and the reply appears.

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

## 4. Kimi-K2.5 tool calling issues: ": 0," prefix corrupting tool parameters

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

## 5. "Tool [name] not found" (read, exec, etc.)

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

## 6. Useful paths and commands

- **Config:** `~/.openclaw/openclaw.json` (or `~/.clawdbot/clawdbot.json` if symlinked)
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

Example (Tailscale):

```
https://localhost-0.tail590941.ts.net/?token=d3b8f9c2e7a1b4c5d6e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0
```

You can also add `?token=...` to any path (e.g. `/config?token=...`). After the first successful load, the UI often stores the token (e.g. in localStorage), so you may not need it in the URL on later visits.

**On the server:** The token in the URL must match `gateway.auth.token` in `~/.openclaw/openclaw.json` on the machine running the gateway. Set it there (or via `openclaw onboard`) and restart the gateway if you change it.

---

## 7. Round-robin: responses disappear from chat UI

### Symptoms
When using the session proxy with round-robin enabled, assistant replies vanish from the chat UI before they complete or immediately after completing.

### Root cause (fixed)
The WebSocket upgrade handler was forwarding the full path (e.g. `/s/proxy:xxx/`) to the gateway. The gateway expects `/` or `/ws`, not `/s/proxy:xxx/`. The WebSocket failed to connect properly, so the Control UI never received the `chat` / `state: "final"` event. Without that event (or with a broken WebSocket), the UI clears the streaming content and doesn't refresh history — the message appears to disappear.

### Fix applied
1. **WebSocket path stripping:** The proxy now strips `/s/:sessionKey` from the WebSocket upgrade path before forwarding (same as HTTP). So `/s/proxy:xxx/` → `/`, `/s/proxy:xxx/ws` → `/ws`. The gateway receives the path it expects.
2. **Request headers:** The proxy also uses `delete` for `content-length` and `transfer-encoding` when buffering the round-robin body, instead of invalid values.
3. **Session header for all requests:** The proxy now injects `x-openclaw-session-key` for **every** proxied request when a session exists, not just POST to chat.
4. **Session key format:** The proxy now uses the gateway's canonical format `agent:main:proxy:uuid` (was `proxy:uuid`). The Control UI filters chat events by `sessionKey`; when the gateway broadcasts "final" with `agent:main:proxy:uuid` but the UI had `proxy:uuid`, the event was ignored and history never refreshed.

Update to the latest clawd/openclaw-session-proxy.js and restart the proxy.

### If it persists
1. **Verify Control UI fix:** Section 1 above — if replies don't show when state becomes "final", the Control UI may need the history-refresh patch. That can also affect round-robin sessions.
2. **Try without round-robin:** Start the proxy with `ROUND_ROBIN_MODELS=off ./start-session-proxy.sh`. If responses appear, the issue is round-robin–specific; if not, it's the Control UI or gateway.
3. **Check proxy logs:** `/tmp/openclaw-proxy.log` — look for `WebSocket upgrade -> session: ... path: /` to confirm path stripping.

---

## 8. Telegram: not receiving messages (channel not starting)

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

## 9. Telegram: `setMyCommands failed: 400 Bad Request: BOT_COMMANDS_TOO_MUCH`

### Root cause
OpenClaw registers native slash commands (e.g. `/model`, `/round-robin`, skill commands) via `setMyCommands`. Skills add many commands; with many skills you can exceed the Telegram Bot API limit (100 commands per scope). Even after truncation to 100, some setups still get this error (possibly due to scope or payload limits).

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

This keeps core commands (`/model`, `/round-robin`, `/context`, etc.) but excludes skill-specific commands, typically reducing the count to ~20–40.

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

## 10. Gateway startup: "blocked model (context window too small)" / FailoverError

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
2. **If using round-robin or session overrides**
   - Ensure `ollama/mistral-small-8k` is not the only or first choice for the main agent, or remove it from the list so the gateway can pick an allowed model.
3. **If you must use mistral-small-8k**
   - You would need a change in the openclaw package (e.g. a configurable minimum context or an override to allow smaller models). That is outside this repo; consider opening an issue or PR on the OpenClaw upstream.

### Summary
- **Cause:** Gateway blocks models with context < 16k; mistral-small-8k has 8k.
- **Change needed in clawd:** None.
- **What to do:** Point the main agent (and session defaults) at a model with ≥16k context, or remove mistral-small-8k from the main/session model selection.

---

## 11. LLM request rejected: unexpected `tool_use_id` in `tool_result` blocks

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

## 12. Telegram: message sent but no reply (or reply after many minutes)

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
