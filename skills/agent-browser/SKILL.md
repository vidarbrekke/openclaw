---
name: agent-browser
description: Primary browser backend using snapshot + element refs. Use via the browser router unless explicitly requested.
allowed-tools: Bash(agent-browser:*)
---

# agent-browser (Primary Backend)

## Note
Prefer the **browser** router skill for tool selection. Use this skill when the router selects agent-browser or when explicitly requested.

## Mandatory loop
1) `agent-browser open <url>`
2) `agent-browser snapshot -i`
3) Act using refs: `click @eX`, `fill @eY "..."`, `get text @eZ`
4) **Re-snapshot after** navigation or major UI changes (refs invalidate).

## Non-negotiable rules
- Never act without a fresh `snapshot -i`.
- After navigation/modal/menu/filter/SPA route change → `snapshot -i` again.
- Use `--json` for outputs you will parse.
- Always use explicit timeouts.
- On failure: screenshot → trace/video if available → close session cleanly.