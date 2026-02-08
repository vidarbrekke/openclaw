---
name: playwright-mcp
description: Fallback backend for deterministic testing and hard UI/network cases. Use only when selected by the browser router or explicitly requested.
allowed-tools: mcp(playwright:*)
---

# Playwright MCP (Fallback Backend)

## When to use
- agent-browser failed twice on the same step, OR
- the task requires advanced control (complex timing, iframes/shadow DOM, deep network extraction/assertions, multi-page orchestration).

## Operating rules
- Prefer stable selectors + explicit waits.
- Always capture failure artifacts (screenshot; trace/video if available).
- Keep state/profiles separate from agent-browser.