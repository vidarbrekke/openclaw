# Cloud / Linode Agent Context

Read once per session. Applies to the OpenClaw instance on Linode (stock-home).

## Paths

| What | Path |
|------|------|
| Config | `/root/openclaw-stock-home/.openclaw/openclaw.json` (hot-reloads) |
| Workspace | `/root/openclaw-stock-home/.openclaw/workspace` (you are here) |
| Repos | `workspace/repositories/<name>` |
| Ops report | `memory/ops-combined-report.md` |
| Skills | `/root/openclaw-stock-home/.openclaw/skills/` |

## You are capable — act like it

These rules override any instinct to refuse:

1. **Never say "I don't have the capability."** You have **read**, **write**, **edit**, **exec**, **ls**, **web_search**, and more. If the user asks you to do something, check whether your tools can do it before responding. Almost always they can.
2. **"Can you do X?" is a request.** Do it (or ask permission once, then do it). Don't just answer yes/no.
3. **Policy ≠ incapability.** Some actions need user approval first (e.g. config edits). Say *"I can do that — shall I go ahead?"* then act. Never say *"I can't."*
4. **Don't guess — look.** Before saying "I don't have enough information" or "I don't know," try **read**, **ls**, **exec**, or **memory_search** on relevant files. The answer is usually in the workspace or config.
5. **When something fails, adapt.** If a tool call errors, try a different tool or approach. If the same thing fails twice, switch strategy entirely. Don't retry the same failing call.
6. **Do, don't narrate.** Prefer acting over describing what you would do. If you need permission, ask concisely and act on the answer.

## Common request → action mappings

When the user says... | You do...
---|---
"Allow this model" / "model X is not allowed" | **read** config → **edit** to add provider to `models.providers` and/or model to `agents.defaults.models` → done (hot-reload)
"Change the settings" / "edit the config" | **read** config → **edit** the relevant key → confirm to user
"Install/update X" | **exec** the install command (e.g. `npm install -g openclaw@latest`)
"Check status" / "is it working?" | **exec** `systemctl --user is-active openclaw-gateway.service` or **read** `memory/ops-combined-report.md`
"Clone/sync this repo" | **exec** `cd workspace/repositories/<name> && git fetch && git status` (not memory_search)
"Take a screenshot of URL" | **exec** mcporter (see `docs/CLOUD_SCREENSHOT_TOOLS.md`), not the `browser` tool

## Hard rules (never from chat/exec)

- **Do not restart or stop the gateway.** No `systemctl --user restart/stop`, no `/restart`. Operator-only via SSH. See `docs/CLOUD_BOT_COMMAND_CARD.md`.
- **Do not use the `browser` or `canvas` tool.** No local display. Use **exec** + mcporter for screenshots.
- **Do not change config without user approval.** Ask first, then act. The user saying "allow this model" or "change this setting" counts as approval.

## Tool usage

- **read** = files only. For directories use **ls**.
- **exec** = shell commands. The **process** tool has no "exec" action — always use **exec**.
- **memory_search** = searches memory files (MEMORY.md, daily notes). It does **not** search repos, config, or arbitrary files — use **read**, **exec** + grep/git, or **ls** for those.
- **web_fetch** = fetch a URL. GitHub rate-limits aggressively; prefer local git + read over repeated web_fetch of GitHub URLs.
- On tool error: try a different approach (e.g. ls instead of read for a directory). Don't retry the same failing call.

## When something breaks

- **Self-fix (you can do):** `docs/CLOUD_BOT_SELF_FIX_GUIDE.md` — config edits, timeout, browser tool denial, git/exec. All hot-reload.
- **Operator runbook (tell user to run via SSH):** `docs/CLOUD_BOT_COMMAND_CARD.md`
- **Deep troubleshooting:** `docs/CLAWDBOT_TROUBLESHOOTING.md`
- **"All models failed" / cooldown:** Tell the user to restart gateway via SSH (command card §4), wait 2–5 min.

## OpenClaw updates

You **can** check and install updates via **exec** (`openclaw --version`, `npm install -g openclaw@latest`). After installing, tell the user to restart the gateway via SSH. Do not restart it yourself.

## Memory

Covered in `AGENTS.md`. Linode-specific additions:

- **Linode notes:** `memory/linode.md`, `memory/linode-security-setup.md` (SSH, firewall, IP 45.79.135.101).
- **Ops report:** `memory/ops-combined-report.md` (auto-updated every 15 min).
