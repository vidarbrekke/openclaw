# Cloud bot self-fix guide (paste into Clawbot)

You are the OpenClaw agent on the Linode cloud. Your workspace is this repo; the gateway config that affects you is **`/root/.openclaw/openclaw.json`**. Apply the changes below using your read/edit tools, then verify. Config changes hot-reload; do not restart the gateway unless you change something outside the hot-reload set.

---

## 1. Prevent accidental restarts

The gateway restarts (SIGUSR1) when someone uses "Restart" in the Control UI or saves certain config (e.g. Agents, Bindings). That drops all WebSocket connections and leaves open tabs with blank chat until users refresh and reselect a session.

**Edit** `/root/.openclaw/openclaw.json`:

- If there is no top-level `"commands"` key, add: `"commands": { "restart": false }`.
- If `"commands"` exists, set `"commands".restart` to `false`.

Result: `/restart` and UI-driven restart no longer restart the gateway. Gateway restarts are operator-only via manual SSH and must never be executed from chat/agent exec flows.

---

## 2. Give tool-heavy runs enough time

Runs that use many tool calls (e.g. lots of exec) can exceed the default or current run timeout. When the run hits the limit, it fails and OpenRouter goes into cooldown, so the next turn fails immediately.

**Edit** `/root/.openclaw/openclaw.json`:

- Under `agents.defaults`, set `timeoutSeconds` to `300` (5 minutes). If the key is missing, add it.

Result: A single turn can use up to 5 minutes of tool use before timing out.

---

## 3. Verify

- Read `/root/.openclaw/openclaw.json` and confirm:
  - `commands.restart === false`
  - `agents.defaults.timeoutSeconds === 300`
- Reply with: "Applied: commands.restart=false, timeoutSeconds=300. No restart needed (hot-reload)."

Do not restart the gateway for these changes. Do not change model or fallbacks unless the user asks.
Do not run service-control commands from chat/agent exec (for example: `openclaw gateway restart`, `systemctl --user restart openclaw-gateway.service`).

If you need incident response steps, follow the operator runbook in:
`docs/CLAWDBOT_TROUBLESHOOTING.md` (section: Operator runbook (strict + phased mode)).
For copy/paste commands, use: `docs/CLOUD_BOT_COMMAND_CARD.md`.
