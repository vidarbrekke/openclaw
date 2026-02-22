# Cloud / Linode Agent Context

Read once per session. Applies to the OpenClaw instance on Linode (stock-home).

**Web search:** You **can** search the web. Use **exec** + `mcporter call perplexity.perplexity_ask` (or `perplexity_search` / `perplexity_reason`) — see "When to use Perplexity MCP" below. **Never** say you don't have web search capability.

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

1. **Never say "I don't have the capability."** You have **read**, **write**, **edit**, **exec**, **ls**, and web search via **exec** + Perplexity MCP (mcporter). If the user asks you to do something, check whether your tools can do it before responding. Almost always they can.
2. **"Can you do X?" is a request.** Do it (or ask permission once, then do it). Don't just answer yes/no.
3. **Policy ≠ incapability.** Some actions need user approval first (e.g. config edits). Say *"I can do that — shall I go ahead?"* then act. Never say *"I can't."*
4. **Don't guess — look.** Before saying "I don't have enough information" or "I don't know," try **read**, **ls**, **exec**, or **memory_search** on relevant files. The answer is usually in the workspace or config.
5. **When something fails, adapt.** If a tool call errors, try a different tool or approach. If the same thing fails twice, switch strategy entirely. Don't retry the same failing call.
6. **Do, don't narrate.** Prefer acting over describing what you would do. If you need permission, ask concisely and act on the answer.

## Common request → action mappings

When the user says... | You do...
---|---
"Compare models" / "pricing" / "search the web" / "find out online" | **exec** + `mcporter call perplexity.perplexity_ask` (or `perplexity_search`) first — do **not** use web_fetch or say you can't search
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
- **`web_fetch` is denied for the main agent** (in `openclaw.json`: `main.tools.deny` includes `web_fetch`). So you cannot use web_fetch; use **exec** + Perplexity MCP for any web lookup (see "When to use Perplexity MCP").

## Tool usage

- **read** = files only. For directories use **ls**.
- **exec** = shell commands. The **process** tool has no "exec" action — always use **exec**.
- **memory_search** = searches memory files (MEMORY.md, daily notes). It does **not** search repos, config, or arbitrary files — use **read**, **exec** + grep/git, or **ls** for those.
- **session_status** = use session key `agent:main:main` (or omit). Do **not** pass the `message_id` from "Conversation info (untrusted metadata)" — that is not a session key and will return "Unknown sessionId".
- **web_search** = disabled by policy. Use Perplexity MCP instead (see below).
- On tool error: try a different approach (e.g. ls instead of read for a directory). Don't retry the same failing call.

### Search ladder (use this order)

1. **Known file path** -> `read` that file directly.
2. **Maybe a directory** -> `ls` first, then `read` a file inside it (never `read` a directory).
3. **Need symbol/content lookup** -> `exec` with `rg` in the likely directory.
4. **Unknown location** -> `exec` with a narrow `find`/`ls` pattern, then `read`.
5. If one approach fails twice, switch to the next approach. Do not loop the same failing call.

### Strict file-search rules (must follow)

- For a path that might be a directory, use `ls` first. Never use `read` on a directory.
- If `read` returns `ENOENT`, do not retry `read` on guessed paths. Switch to `ls`/`find` to locate the file, then `read`.
- If `read` returns `EISDIR`, immediately switch to `ls` for that path, then `read` a concrete file within it.
- After one failed lookup method, change method on the next attempt (`read` -> `ls/find` -> `read`).
- Do not make more than 2 failed lookup attempts before reporting what path checks were performed and asking for one clarifying path hint.

### Symlink-safe search + repo checks

- `/root/.openclaw/workspace` is a symlink. For recursive `find`, prefer the real path `/root/openclaw-stock-home/.openclaw/workspace` or use `find -L`.
- For git repository discovery, check `/root/openclaw-stock-home/.openclaw/workspace/repositories` first (not broad workspace scan first).
- Preferred command for git repo discovery: `clawd-find-git-repos` (or `clawd-find-git-repos <base> <pattern>`).
- If a first repo scan returns empty but user expects repos, retry once with `find -L` + narrowed repo path before concluding.
- Do not claim "none found" until two checks agree (for example `find -L` + `ls` of expected parent path).
- For `motherknitter`/repo-name checks, run `clawd-find-git-repos /root/openclaw-stock-home/.openclaw/workspace/repositories motherknitter` before any free-form answer.

### Cloud rule: no browser for repo verification

- On this cloud host, do not use `browser` for "verify local folder vs GitHub" tasks.
- Use `exec` + git instead (remote URL, fetch, `rev-parse`, `ls-remote`, branch/status comparison).
- Preferred command for this task: `clawd-verify-github-repo <local_repo_path> <owner/repo>`.
- If browser service errors once, do not retry browser; switch to git/exec workflow immediately.
- If first GitHub API check returns 404/Not Found, run a second method (`git ls-remote` or `clawd-verify-github-repo`) before concluding failure.

### After edits: always verify write

- After any config or instruction edit, immediately `read` the edited block and confirm the key value changed.
- Then check for automatic reverters (`systemctl --user status <timer/service>`). If active, tell the user that policy may overwrite chat edits.

### When to use Perplexity MCP (emphasized)

**Use Perplexity MCP first** whenever the user wants to look something up on the web, compare things, get pricing, or find current information. Run `mcporter` from the workspace (`config/mcporter.json`, server `perplexity`).

| User intent | Use this first |
|-------------|----------------|
| "Search for answers online" / "search the web" / "find out…" | **exec** + `mcporter call perplexity.perplexity_ask` or `perplexity.perplexity_search` |
| Model comparisons, pricing, "which is better/cost-efficient" | **exec** + `mcporter call perplexity.perplexity_ask` (or `perplexity_reason` for analysis) |
| News, recent events, "latest…" | **exec** + `mcporter call perplexity.perplexity_ask` with `search_recency_filter: day` or `week` |
| Deep research / multi-source overview | **exec** + `mcporter call perplexity.perplexity_research` |

**Available tools:** `perplexity.perplexity_ask`, `perplexity.perplexity_reason`, `perplexity.perplexity_research`, `perplexity.perplexity_search`.

### How to search the web (single command)

Use **exec** with `perplexity-search`:

`perplexity-search "your question here"`

Default:

- `perplexity-search "Compare gemini-2.5-flash-lite and gemini-2.5-flash pricing"`
- `perplexity-search "Latest ECB interest rate decision"`

Optional tuning flags:

- `--recency day|week|month|year`
- `--context low|medium|high`
- `--model <model-id>` (for example `sonar-pro`)

Examples with tuning:

- `perplexity-search --recency week --context high "latest AI model pricing changes"`
- `perplexity-search --model sonar-pro --context high "deep comparison of Gemini Flash vs Flash Lite for coding workflows"`

Do **not** call `mcporter` directly. Do **not** use raw `--messages` payloads in chat-generated commands.

If a call fails, fix once and retry once. Do **not** repeat the same malformed command in a loop.

Do **not** answer "I couldn't find…" from web_fetch failures when you have not yet used Perplexity MCP. If the user asked to search or compare, use MCP first.

### When to use web_fetch

Use **web_fetch** only when you already have a **specific URL** and need the content of that single page:

- User pasted a link: "Summarize this article: https://…"
- Perplexity MCP (or another step) returned a URL and you need to quote or verify that page.
- A known doc URL (e.g. from memory or config) that you need to read.

**Do not** use web_fetch to "search" or "find" information. **Do not** guess vendor URLs (e.g. openrouter.ai/docs/models/…) — they often 404. For search, comparisons, or pricing, use Perplexity MCP first; use web_fetch only as a follow-up on URLs that MCP or the user provided.

### When NOT to use web_fetch

- **Do not** use web_fetch when the user said "search for answers online," "find out…," or "compare X and Y" — use Perplexity MCP first.
- **Do not** construct or guess URLs to vendor docs/marketing pages (e.g. openrouter.ai/docs/models/…) as your first step; they frequently 404.
- **Do not** use web_fetch in place of Perplexity MCP for model comparisons, pricing, or capability questions.
- For GitHub content, prefer **read** + local git or **exec** over repeated web_fetch (rate limits).

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
