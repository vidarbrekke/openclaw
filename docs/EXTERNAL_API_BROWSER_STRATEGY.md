# External API Browser Strategy

## Browser skill: native vs Playwright MCP

OpenClaw uses **both**:

1. **Native OpenClaw `browser` tool** — First-class agent tool built into OpenClaw. It controls the OpenClaw-managed Chrome/Brave/Edge profile via CDP (Chrome DevTools Protocol) and Playwright internally. This is what `default_api` and `browser_api` agents use when the `browser` tool is allowed.

2. **Browser router skill** (`~/.openclaw/skills/browser/`) — A skill that tells the agent:
   - **Default:** Use `agent-browser` (Bash/CLI commands that wrap the native browser tool)
   - **Fallback:** Use **Playwright MCP** when agent-browser fails twice or the task needs advanced control (iframes, shadow DOM, network assertions, etc.)

3. **Playwright MCP** — Separate MCP server (`mcp(playwright:*)`). Used only as a fallback when the native browser path fails or when explicitly requested. Requires the Playwright MCP server to be configured for OpenClaw.

**For External API UX testing:** Target the `browser_api` agent, which has the native `browser` tool allowed. No Playwright MCP is required for basic automation; the native tool covers navigation, snapshots, screenshots, console output, and UI actions.

---

## Strategy: dedicated agent instead of broadening default_api

To keep `default_api` locked down for general API use, browser capability is provided via a **dedicated agent**:

| Agent        | Purpose                          | Browser |
|-------------|-----------------------------------|---------|
| `default_api` | General external API calls        | No      |
| `browser_api` | UX testing, screenshots, automation | Yes     |

**How to use:** When making chat completions requests, specify `agentId: "browser_api"` (or your HTTP client’s equivalent) to route to the browser-capable agent.

---

## Mitigations applied

| Mitigation | Config | Effect |
|------------|--------|--------|
| Disable arbitrary JS | `browser.evaluateEnabled: false` | Blocks `act:evaluate` and `wait --fn`; prevents prompt-injection-driven JS in page context |
| Isolated profile | Use `defaultProfile: "openclaw"` | Keeps browser data separate from personal profile |
| Dedicated agent | `browser_api` | Limits browser access to sessions that explicitly opt in |
| Elevated disabled | `tools.elevated.enabled: false` | No host exec or gateway control from this agent |

---

## What still works with evaluate disabled

- Navigate, snapshot (AI/ARIA), screenshot (full page or element)
- Click, type, hover, drag, select
- Console output (`browser console`)
- Wait on text, selector, URL, load state
- PDF export
- Cookies/storage read (and set for test fixtures)

## What is disabled

- `act kind=evaluate` — arbitrary JavaScript in page context
- `wait --fn` — wait on a JS predicate

For most UX testing (screenshots, flows, console/debug output), evaluate is not required.

---

## Re-enabling evaluate

If you need arbitrary JS (e.g. complex assertions), set in `~/.openclaw/openclaw.json`:

```json
"browser": {
  "evaluateEnabled": true
}
```

Restart the gateway after changing.

---

## Checklist for safe browser testing

1. Use `browser_api` agent for browser tasks; keep `default_api` without browser.
2. Prefer `browser.evaluateEnabled: false` unless you have a clear need.
3. Use the `openclaw` profile (isolated) rather than `chrome` (extension relay to your main browser).
4. Keep gateway on loopback or private network; avoid public exposure.
5. Treat the browser profile as containing session data; clear or reset it periodically if it’s used for sensitive sites.
