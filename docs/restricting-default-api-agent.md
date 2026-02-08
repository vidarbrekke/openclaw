# Restricting Tools for the `default_api` Agent

**Created:** 2026-02-08  
**Problem:** How to strictly control which tools the `default_api` agent can access  
**Solution:** Use per-agent tool policies in `openclaw.json`

---

## Quick Answer

Add an agent-specific tool policy to your `~/.openclaw/openclaw.json`:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",  // The agent serving /v1/chat/completions
        tools: {
          // Option A: Allowlist approach (recommended)
          allow: ["read", "web_search", "sessions_list"],
          
          // Option B: Denylist approach
          // deny: ["exec", "write", "edit", "apply_patch", "browser", "gateway"]
        }
      }
    ]
  }
}
```

**Restart required:**

```bash
openclaw gateway restart
```

---

## Understanding `default_api`

The `default_api` agent is a **special agent** that serves OpenClaw's OpenAI-compatible HTTP API at `/v1/chat/completions`.

By default, it has access to **all tools** (unless global restrictions apply). To limit its capabilities, you must explicitly configure tool restrictions for the `default_api` agent.

---

## Method 1: Allowlist (Recommended)

**Philosophy:** "Only allow these specific tools; deny everything else."

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: [
            "read",
            "web_search",
            "web_fetch",
            "sessions_list",
            "sessions_history",
            "session_status"
          ]
        }
      }
    ]
  }
}
```

**Benefits:**
- Explicit about what's permitted
- New tools won't be automatically available
- Easier to audit

---

## Method 2: Denylist

**Philosophy:** "Block these dangerous tools; allow everything else."

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          deny: [
            "exec",
            "bash",
            "process",
            "write",
            "edit",
            "apply_patch",
            "browser",
            "canvas",
            "gateway",
            "cron",
            "nodes",
            "message"
          ]
        }
      }
    ]
  }
}
```

**Risk:**
- New tools added in future OpenClaw versions will be automatically available
- May inadvertently allow more than intended

---

## Method 3: Tool Profile

**Philosophy:** "Use a pre-configured security profile."

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          profile: "minimal"  // Only session_status
          // OR
          // profile: "messaging"  // Messaging + sessions
        }
      }
    ]
  }
}
```

**Available profiles:**
- `minimal`: Only `session_status`
- `messaging`: `group:messaging`, `sessions_list`, `sessions_history`, `sessions_send`, `session_status`
- `coding`: `group:fs`, `group:runtime`, `group:sessions`, `group:memory`, `image`
- `full`: No restrictions (default)

You can combine profiles with additional allow/deny:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          profile: "minimal",
          allow: ["read", "web_search"]  // Add specific tools to minimal profile
        }
      }
    ]
  }
}
```

---

## Tool Groups (Shorthands)

Use `group:*` to restrict entire categories:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "group:web", "group:sessions"],
          deny: ["group:runtime"]  // No exec, bash, process
        }
      }
    ]
  }
}
```

**Available groups:**
- `group:runtime`: `exec`, `bash`, `process`
- `group:fs`: `read`, `write`, `edit`, `apply_patch`
- `group:sessions`: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status`
- `group:memory`: `memory_search`, `memory_get`
- `group:web`: `web_search`, `web_fetch`
- `group:ui`: `browser`, `canvas`
- `group:automation`: `cron`, `gateway`
- `group:messaging`: `message`
- `group:nodes`: `nodes`
- `group:openclaw`: All built-in OpenClaw tools (excludes provider plugins)

---

## Layering with Global Policies

Agent-specific policies **inherit and narrow** global policies:

```json5
{
  // Global: deny gateway for ALL agents
  tools: {
    deny: ["gateway"]
  },
  
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          // Further restrict beyond global policy
          allow: ["read", "web_search"],
          deny: ["exec", "write", "edit"]
        }
      },
      
      {
        id: "main",
        // main agent inherits global policy (no gateway)
        // but can use all other tools
      }
    ]
  }
}
```

**Important:** Agent policies can only **narrow** global policies, not expand them.

---

## Elevated Mode Control

Prevent `default_api` from executing commands on the host:

```json5
{
  tools: {
    elevated: {
      enabled: true,
      allowFrom: {
        whatsapp: ["+15555550123"]  // Only you can use elevated
      }
    }
  },
  
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          elevated: { enabled: false },  // Explicitly disable elevated
          deny: ["exec", "bash", "process"]  // Belt-and-suspenders
        }
      }
    ]
  }
}
```

---

## Testing Your Configuration

### 1. Validate Configuration

```bash
openclaw doctor
```

If validation fails, OpenClaw won't start and will show errors.

### 2. Verify Agent Tools

After restart, check what tools are available:

```bash
openclaw agents list --bindings
```

### 3. Test via API

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Please run: ls -la"}
    ]
  }'
```

**Expected behavior:**
- If `exec` is denied: Agent cannot use the `exec` tool
- Response should indicate tool is unavailable

### 4. Monitor Logs

```bash
tail -f ~/.openclaw/logs/gateway.log | grep -E "default_api|tools"
```

Look for lines like:
```
[tools] filtering tools for agent:default_api
```

---

## Recommended Configuration for API Access

**Safe default for external API exposure:**

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        name: "External API Agent",
        tools: {
          // Only allow safe, read-only operations
          allow: [
            "read",           // File reading
            "web_search",     // Web search
            "web_fetch",      // Fetch URLs
            "sessions_list",  // Session management
            "session_status"  // Session info
          ],
          
          // Explicitly deny dangerous operations
          deny: [
            "exec",          // No command execution
            "bash",          // No bash commands
            "process",       // No process management
            "write",         // No file writing
            "edit",          // No file editing
            "apply_patch",   // No patches
            "browser",       // No browser automation
            "gateway",       // No gateway control
            "cron",          // No scheduled tasks
            "nodes",         // No node control
            "message"        // No messaging
          ],
          
          // Never allow elevated (host) execution
          elevated: { enabled: false }
        },
        
        // Optional: sandbox for defense-in-depth
        sandbox: {
          mode: "all",
          scope: "agent",
          workspaceAccess: "ro"  // Read-only workspace access
        }
      }
    ]
  }
}
```

---

## Combining with Sandboxing

For maximum isolation, combine tool restrictions with Docker sandboxing:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        
        // Tool restrictions
        tools: {
          allow: ["read", "web_search"],
          elevated: { enabled: false }
        },
        
        // Docker sandbox
        sandbox: {
          mode: "all",           // Always sandboxed
          scope: "agent",        // One container per agent
          workspaceAccess: "ro", // Read-only workspace
          
          docker: {
            network: "none",     // No network access
            readOnlyRoot: true,  // Read-only filesystem
            pidsLimit: 128,      // Limit processes
            memory: "512m"       // Memory limit
          }
        }
      }
    ]
  }
}
```

**Defense-in-depth:**
1. Tool policy prevents dangerous tool calls
2. Sandbox prevents system access even if tools are bypassed
3. Network isolation prevents external communication

---

## Common Mistakes

### ❌ Only Setting Global Policy

```json5
{
  // This affects ALL agents, not just default_api
  tools: {
    allow: ["read", "web_search"]
  }
}
```

**Fix:** Use agent-specific policy instead.

### ❌ Forgetting to Restart

Configuration changes require a restart:

```bash
openclaw gateway restart
```

### ❌ Mixing Allow and Deny Logic

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "exec"],  // Allow exec
          deny: ["exec"]            // But also deny exec?
        }
      }
    ]
  }
}
```

**Rule:** Deny always wins. In this example, `exec` would be denied.

**Best practice:** Choose either allowlist OR denylist, not both (unless you're layering carefully).

---

## Troubleshooting

### Problem: Tools Still Available Despite Deny

**Check:**
1. Did you restart the gateway? (`openclaw gateway restart`)
2. Is the agent ID correct? (Use `openclaw agents list` to verify)
3. Are you testing the right agent? (API uses `default_api`, not `main`)
4. Check logs for tool filtering messages

### Problem: Agent Can't Use Any Tools

**Check:**
1. Did you set `allow: []` (empty allowlist)?
2. Global deny overriding agent allow?
3. Tool profile too restrictive?

**Fix:** Start with a known-good config like:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["session_status"]  // At least one tool
        }
      }
    ]
  }
}
```

### Problem: Elevated Mode Still Working

**Check:**
1. `tools.elevated.enabled` must be `false` at global OR agent level
2. `exec` tool must also be denied
3. Restart required after changes

---

## Next Steps

- Read the full architecture guide: [Tool Access Control Architecture](./tool-access-control-architecture.md)
- Review OpenClaw docs: `/opt/homebrew/lib/node_modules/openclaw/docs/tools/index.md`
- Test your configuration thoroughly before exposing the API externally

---

## References

- [OpenClaw Tools Documentation](/opt/homebrew/lib/node_modules/openclaw/docs/tools/index.md)
- [Multi-Agent Sandbox & Tools](/opt/homebrew/lib/node_modules/openclaw/docs/multi-agent-sandbox-tools.md)
- [Gateway Configuration](/opt/homebrew/lib/node_modules/openclaw/docs/gateway/configuration.md)
