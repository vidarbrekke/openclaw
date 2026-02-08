---
name: browser
description: Unified browser entry point. Default to agent-browser; fall back to Playwright MCP only when needed.
allowed-tools: Bash(agent-browser:*), mcp(playwright:*)
---

# Browser Router Policy

## Routing
1) **Default: agent-browser** for browsing, automation, scraping, screenshots/PDF/video.
2) **Fallback: Playwright MCP** only when:
   - agent-browser fails **2 times** on the same step, or
   - the task requires advanced control (complex timing, iframes/shadow DOM, deep network extraction/assertions, multi-page orchestration).

## Invariants
- **Timeouts always.** Never wait indefinitely.
- **Evidence on failure before fallback:** screenshot first; then trace/video if available; record URL + short error note.
- **Isolation:** separate session/profile/state per backend and per site. Never share auth state across tools.
- **Secrets:** state files and credentials are secrets; never print contents; never commit; delete when done.