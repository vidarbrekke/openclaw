# Telegram gift-card: why duplicates and MCP-only fix

## What we found (Feb 2026)

Duplicate replies (e.g. "✅ Subagent local-ops finished" + "$53.40" then "Balance: 30.00") were caused by **two delivery paths** in the same run:

1. **sessions_spawn** → local-ops runs `node .../giftcard_lookup` → OpenClaw sends the **subagent auto-announce** (first balance).
2. The model then **ignored** the "do not call subagents/sessions_history after spawn" rule and called:
   - `subagents` (multiple times)
   - `sessions_history`
   - `message` (to send a second balance to the user)

So the model was both (a) triggering the auto-announce and (b) fetching the result via subagents/sessions_history and sending it again with the `message` tool. The second amount (e.g. 30.00) could be from a different field, stale data, or a different format from the subagent history.

MotherKnitter was recently configured via **mcporter** (MCP). The main agent has both:

- **local-ops skill** → sessions_spawn with CLI task
- **motherknitter skill** → MCP tools (giftcard_lookup) and mcporter CLI

So the model had two ways to get a balance; combined with post-spawn tool use, that produced duplicate replies.

## Fix: MCP-only for Telegram gift-card balance

Use **one path only** for gift-card balance so there is no subagent and no second message:

- **Do not use sessions_spawn** for gift-card balance.
- **Use mcporter** (exec): `mcporter call motherknitter.giftcard_lookup code=CODE site:production`
- Reply **once** with the balance from the mcporter result.

This removes the subagent auto-announce path entirely for this flow, so the user gets a single reply.

## Server change

The main workspace `AGENTS.md` on the Linode was updated so that **Telegram gift-card balance** uses mcporter only (see script `scripts/patch-telegram-giftcard-mcp-only.py`). The "Telegram Gift Card Handling" section now instructs: ask for code if missing; then run mcporter for the lookup and reply once. sessions_spawn is not used for gift-card balance.

## Replicating local MotherKnitter MCP on the server (Linode)

On your **local machine** MotherKnitter works because:

1. **mcporter.json** in the workspace points at your local mcp-motherknitter binary, e.g.  
   `config/mcporter.json`:  
   `"motherknitter": { "command": "node", "args": ["/Users/vidarbrekke/Dev/mcp-motherknitter/build/index.js"] }`
2. **mcporter CLI** is on PATH when OpenClaw runs (so `exec` of `mcporter call motherknitter.giftcard_lookup ...` works).
3. The **main** agent can run **exec** and has the **mcporter** and **motherknitter** skills, so it uses the MCP path and replies once.

To replicate on the **Linode**:

| Setting | Local (reference) | Server (replicate) |
|--------|-------------------|--------------------|
| **mcporter.json** | Workspace `config/mcporter.json` with **absolute path** to `mcp-motherknitter/build/index.js` | Same structure at `/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json`, but **args** must be the **server path** to mcp-motherknitter (e.g. `/root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/index.js`). Do **not** overwrite the server file with the repo’s `config/mcporter.json` (it has the Mac path). See `config/mcporter.linode.example.json` for a server-shaped example. |
| **mcporter CLI** | On PATH | `npm install -g mcporter` (or ensure `npx mcporter` works when the gateway runs as the same user). |
| **Agent tools** | main has exec (or process group) and mcporter + motherknitter skills | Same: main must be allowed to run `mcporter` (e.g. via **exec**). |
| **AGENTS.md** | N/A (single path locally) | Patched so Telegram gift-card uses **mcporter only** (run `scripts/patch-telegram-giftcard-mcp-only.py` on the server). |

**Check server mcporter.json:** On the Linode run:

```bash
cat /root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json
```

The `motherknitter.args[0]` must be the **Linux path** to `mcp-motherknitter/build/index.js` on that machine. If it still has a Mac path or a wrong path, edit it to the correct server path and leave the rest of the file unchanged.

**Quick test on server:**  
`mcporter call motherknitter.giftcard_lookup code=TEST site:production`  
(from the workspace dir or with `--config /root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json`). If that returns a balance (or a clear API error), the server config matches local behavior.

## References

- MotherKnitter skill: `~/.openclaw/skills/motherknitter/SKILL.md`
- mcporter config: `~/.openclaw/workspace/config/mcporter.json` (path inside must match the machine)
- OpenClaw log: `embedded run tool start/end` for sessions_spawn, subagents, sessions_history, message
