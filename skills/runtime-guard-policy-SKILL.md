---
name: runtime-guard-policy
description: >
  Stock-friendly runtime safety policy for tool usage and service control.
  Use this skill to prevent restart loops, web-search loops, and read-loop storms
  without relying on compiled bundle patching.
---

# Runtime Guard Policy

This skill defines policy-layer guardrails that must be followed in all sessions.

## Service-control safety (strict)

- Never run gateway lifecycle commands from conversational turns.
- Blocked in-chat operations:
  - `openclaw gateway restart`
  - `openclaw gateway stop`
  - `systemctl --user restart openclaw-gateway.service`
  - `systemctl --user stop openclaw-gateway.service`
- Gateway lifecycle actions are operator-only and must be performed via manual SSH.

## Tool loop safety

- `web_search`: max 5 calls per session window; max 2 duplicate normalized queries.
- `read` same-path repeats: max 2 per run.
- Memory date sweep reads (`/memory/YYYY-MM-DD.md`): max 20 per run.
- On cap breach, stop tool retries and return a concise partial answer with next-step guidance.

## Escalation rules

- If the same tool failure happens twice, escalate to a worker model/session.
- Do not continue retries for confidence.
- For server-state checks, use local checks first before web search.

## Transparency

- Include active guard mode in ops reports:
  - `guard_policy_mode=enabled`
  - `runtime_patch_fallback=enabled|disabled`
- If a blocked command is attempted, surface it in ops combined report.

