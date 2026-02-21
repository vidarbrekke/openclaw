# Cloud bot self-fix guide (paste into Clawbot)

You are the OpenClaw agent on the Linode cloud. Your workspace is this repo; the gateway config that affects you is **`/root/openclaw-stock-home/.openclaw/openclaw.json`**. Apply the changes below using your read/edit tools, then verify. Config changes hot-reload; do not restart the gateway unless you change something outside the hot-reload set.

---

## 1. Prevent accidental restarts

The gateway restarts (SIGUSR1) when someone uses "Restart" in the Control UI or saves certain config (e.g. Agents, Bindings). That drops all WebSocket connections and leaves open tabs with blank chat until users refresh and reselect a session.

**Edit** `/root/openclaw-stock-home/.openclaw/openclaw.json`:

- If there is no top-level `"commands"` key, add: `"commands": { "restart": false }`.
- If `"commands"` exists, set `"commands".restart` to `false`.

Result: `/restart` and UI-driven restart no longer restart the gateway. Gateway restarts are operator-only via manual SSH and must never be executed from chat/agent exec flows.

---

## 2. Give tool-heavy runs enough time

Runs that use many tool calls (e.g. lots of exec) can exceed the default or current run timeout. When the run hits the limit, it fails and OpenRouter goes into cooldown, so the next turn fails immediately.

**Edit** `/root/openclaw-stock-home/.openclaw/openclaw.json`:

- Under `agents.defaults`, set `timeoutSeconds` to `300` (5 minutes). If the key is missing, add it.

Result: A single turn can use up to 5 minutes of tool use before timing out.

---

## 3. Verify

- Read `/root/openclaw-stock-home/.openclaw/openclaw.json` and confirm:
  - `commands.restart === false`
  - `agents.defaults.timeoutSeconds === 300`
- Reply with: "Applied: commands.restart=false, timeoutSeconds=300. No restart needed (hot-reload)."

Do not restart the gateway for these changes. Do not change model or fallbacks unless the user asks.
Do not run service-control commands from chat/agent exec (for example: `openclaw gateway restart`, `systemctl --user restart openclaw-gateway.service`).

If you need incident response steps, follow the operator runbook in:
`docs/CLAWDBOT_TROUBLESHOOTING.md` (section: Operator runbook (policy-only mode + emergency rollback)).
For copy/paste commands, use: `docs/CLOUD_BOT_COMMAND_CARD.md`.

**"All models failed" / "all in cooldown or unavailable":** This is OpenRouter rate-limit/cooldown. The gateway tracks cooldown in memory. Operator fix: restart gateway (section 4 in command card), wait 2–5 minutes, then retry. Do not run restart from chat/agent exec.

---

## 4. Stop "browser control service not running / restart gateway" on cloud

On the Linode there is no display and the browser/Playwright service does not run. If the main agent has the `browser` tool allowed, it may try to use it (or a skill may suggest it). OpenClaw then returns an error like: "The browser control service is not running. Please restart the OpenClaw gateway (OpenClaw.app menubar, or `openclaw gateway`)." That message is wrong for the cloud: restarting the gateway does not start a browser on a headless server, and we do not run gateway restarts from chat.

**Edit** `/root/openclaw-stock-home/.openclaw/openclaw.json` so the main agent does not have the browser tool:

- **Script (from repo on Linode):**  
  `node scripts/cloud-disable-browser-tool.mjs`  
  Uses `OPENCLAW_CONFIG_PATH` or default `~/.openclaw/openclaw.json` (so as root on Linode stock-home: `/root/openclaw-stock-home/.openclaw/openclaw.json`). Adds `browser` to `main.tools.deny` without touching other tools.
- **Manual:** Under `agents.list`, find the entry for the main agent (e.g. `id: "main"`). Add or merge:
  - **Option A (deny list):** `"tools": { "deny": ["browser"] }` so browser is explicitly denied; all other tools stay allowed.
  - **Option B (allow list):** If the agent already has `tools.allow`, add every tool you want (read, write, edit, exec, web_search, etc.) but omit `browser`.

Result: The agent will no longer call the browser tool. It will not see "browser control service not running" and will not suggest restarting the gateway for that. For browser automation on the cloud (screenshots, “check this page”), see **docs/PLAYWRIGHT_MCP_LINODE.md**: Playwright MCP is used via **mcporter**. No gateway restart needed (tool list hot-reloads).

---

## 5. "Unknown action exec" when user asks for a screenshot

If the user asks for a URL screenshot and the agent fails with **"Unknown action exec"**, the agent is calling the **process** tool with `action: "exec"`. The process tool has no "exec" action (only list, poll, log, write, kill, clear, remove). The agent must use the **exec** tool to run mcporter.

**Do this:**

1. **Copy workspace instructions** so the agent sees them every session:  
   Copy `docs/CLOUD_SCREENSHOT_TOOLS.md` to the workspace root:  
   `/root/openclaw-stock-home/.openclaw/workspace/CLOUD_SCREENSHOT_TOOLS.md`  
   (That file tells the agent: use **exec** for mcporter, never process with action "exec".)

2. **Keep AGENTS.md in sync**  
   Ensure `/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md` contains the Tools section that says: for URL screenshots use the **exec** tool with mcporter; process has no "exec" action. Overwrite from the repo version if needed.

3. **Optional (if the agent still uses process for "exec")**  
   Add `process` to `main.tools.deny` in `/root/openclaw-stock-home/.openclaw/openclaw.json`. Then the agent cannot call process at all and must use **exec** for mcporter. Only do this if you do not need the process tool for other tasks.

---

## 5b. Git clone / repo development on cloud not working

If the agent used to clone repos and work on them but now says it has "constraints" or "limited shell access", or you see "Tool exec not found" / "Tool read not found", see **CLAWDBOT_TROUBLESHOOTING.md** section **5c. Cloud (Linode): git clone / repo development stopped working**. Main checks: (1) main agent must have **read** and **exec** allowed (no `tools.deny: ["exec"]`); (2) session must resolve to main (proxy session key); (3) if exec-approvals exist, git must be allowlisted or policy relaxed for main on the cloud.

---

## 6. Natural gift-card chat (web + Telegram)

To support open-ended gift-card questions (not only direct code lookups), deploy the latest `mcp-motherknitter` with these tools:

- `giftcard_details`
- `giftcard_transactions`
- `giftcard_usage_summary`
- `giftcard_search_by_sender`
- `giftcard_timeline`

Then ensure `/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md` contains a **Gift Card Natural Chat** section that routes each user request to exactly one `sessions_spawn` for `local-ops`, using:

- `node /root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js <command> ...`

Behavior:

- Ask one clarification question if required parameters are missing.
- Use `giftcard_usage_summary --days 1` for "used today?" style questions.
- Use `giftcard_search_by_sender` for sender/name clues (best-effort on note/email fields).
- Use `giftcard_timeline` for issued/last-modified questions to avoid exposing raw internal fields.
- After spawn, do not chain extra tool calls in the same turn.

---

## 7. Stable Telegram super-user flow (Feb 2026 baseline)

Use this as the preferred production path for Vidar Telegram DM gift-card operations.

### Architecture

- **Telegram binding:** route Vidar direct Telegram to `telegram-vidar-proxy` (not `main`).
- **Proxy tools:** allow only `exec` + `read` for proxy.
- **Execution style:** no `sessions_spawn` for gift-card operations in proxy path.
- **Data source:** call `/root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js` directly via `exec`.

### Why this is stable

- Removes subagent auto-announce duplication path.
- Keeps one user-visible reply per turn.
- Uses MCP JSON output for deterministic parsing and safer user formatting.

### Required command style in proxy

Use `--format json` for all gift-card MCP calls:

- `giftcard_lookup --format json`
- `giftcard_update --format json`
- `giftcard_timeline --format json`
- `giftcard_details --format json`
- `giftcard_transactions --format json`
- `giftcard_usage_summary --format json`
- `giftcard_search_by_sender --format json`

### Conversational behavior guardrails

- Keep conversation free-flowing; map intent dynamically.
- Never return generic "I don't have tools" for gift-card intent.
- Fallback order:
  1. Attempt one mapped command.
  2. If missing/ambiguous fields, ask one concise clarifying question.
  3. If command fails, return concise retry-oriented error.

### Quick verification

Run these via `openclaw agent --agent telegram-vidar-proxy`:

- "is there a user with the name Peter White who has sent a giftcard?"
- "have any giftcards been used today?"
- "6NBT-W353-327J-WLH9"
- "subtract $10 from the card"

Expected: one clean response per turn, no relay/progress chatter, no duplicate result lines.
