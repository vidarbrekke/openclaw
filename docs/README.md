# Clawd Documentation

Documentation for the Clawd workspace and OpenClaw agent configuration.

---

## Tool Access Control Research (2026-02-08)

Complete research on controlling agent tool access in OpenClaw:

### Quick Start
- **[Restricting Default API Agent](./restricting-default-api-agent.md)**  
  Focused guide for limiting `default_api` tool access. Start here if you just want to secure your API endpoint.

### Deep Dive
- **[Tool Access Control Architecture](./tool-access-control-architecture.md)**  
  Complete reference for all tool access control mechanisms in OpenClaw. Read this to understand the full security model.

### Research Summary
- **[Tool Access Research Summary](./tool-access-research-summary.md)**  
  Overview of findings, key takeaways, and next steps. Good for understanding what was learned.

---

## Quick Reference

### Restrict `default_api` Tools (TL;DR)

Add to `~/.openclaw/openclaw.json`:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "web_search", "sessions_list"],
          elevated: { enabled: false }
        }
      }
    ]
  }
}
```

Then restart:

```bash
openclaw gateway restart
```

---

## Tool Groups Reference

Use `group:*` in allow/deny lists:

| Group | Tools |
|-------|-------|
| `group:runtime` | `exec`, `bash`, `process` |
| `group:fs` | `read`, `write`, `edit`, `apply_patch` |
| `group:sessions` | `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status` |
| `group:memory` | `memory_search`, `memory_get` |
| `group:web` | `web_search`, `web_fetch` |
| `group:ui` | `browser`, `canvas` |
| `group:automation` | `cron`, `gateway` |
| `group:messaging` | `message` |
| `group:nodes` | `nodes` |
| `group:openclaw` | All built-in OpenClaw tools |

---

## Tool Profiles Reference

Pre-configured security profiles:

| Profile | Tools | Use Case |
|---------|-------|----------|
| `minimal` | `session_status` only | Severely restricted |
| `messaging` | `group:messaging`, sessions | Communication-only |
| `coding` | `group:fs`, `group:runtime`, sessions, memory, `image` | Development |
| `full` | No restrictions | Default |

**Example:**

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          profile: "minimal",
          allow: ["read", "web_search"]
        }
      }
    ]
  }
}
```

---

## Testing Your Configuration

```bash
# 1. Validate config
openclaw doctor

# 2. Restart gateway
openclaw gateway restart

# 3. Verify agent config
openclaw agents list --bindings

# 4. Monitor logs
tail -f ~/.openclaw/logs/gateway.log | grep -E "default_api|tools"
```

---

## Official OpenClaw Documentation

- Tools: `/opt/homebrew/lib/node_modules/openclaw/docs/tools/index.md`
- Multi-Agent: `/opt/homebrew/lib/node_modules/openclaw/docs/concepts/multi-agent.md`
- Configuration: `/opt/homebrew/lib/node_modules/openclaw/docs/gateway/configuration.md`
- Sandbox & Tools: `/opt/homebrew/lib/node_modules/openclaw/docs/multi-agent-sandbox-tools.md`

---

**Last Updated:** 2026-02-08
