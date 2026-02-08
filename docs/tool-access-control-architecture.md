# Tool Access Control Architecture in OpenClaw

**Created:** 2026-02-08  
**Purpose:** Complete reference for controlling agent tool access in OpenClaw

---

## Executive Summary

OpenClaw provides **multi-layered tool access control** through:

1. **Tool profiles** (preset allowlists: minimal/coding/messaging/full)
2. **Global tool policies** (`tools.allow` / `tools.deny`)
3. **Per-agent tool policies** (`agents.list[].tools.allow/deny`)
4. **Provider-specific restrictions** (`tools.byProvider` and per-agent variants)
5. **Sandbox tool policies** (when sandboxing is enabled)
6. **Subagent tool policies** (for spawned sub-agents)

**Key Principle:** Each layer can only **further restrict** tools; no layer can grant back tools denied by earlier layers.

---

## Tool Filtering Order (Precedence Chain)

When determining which tools an agent can access:

1. **Tool profile** (`tools.profile` or `agents.list[].tools.profile`)
2. **Provider tool profile** (`tools.byProvider[provider].profile`)
3. **Global tool policy** (`tools.allow` / `tools.deny`)
4. **Provider tool policy** (`tools.byProvider[provider].allow/deny`)
5. **Agent-specific tool policy** (`agents.list[].tools.allow/deny`)
6. **Agent provider policy** (`agents.list[].tools.byProvider[provider].allow/deny`)
7. **Sandbox tool policy** (`tools.sandbox.tools` or `agents.list[].tools.sandbox.tools`)
8. **Subagent tool policy** (`tools.subagents.tools`)

**Rule:** Deny always wins. Each successive layer can only narrow the allowed set.

---

## Tool Profiles (Base Allowlists)

Tool profiles provide pre-configured base allowlists:

### `minimal`
- Tools: `session_status` only
- Use case: Severely restricted agent

### `coding`
- Tools: `group:fs`, `group:runtime`, `group:sessions`, `group:memory`, `image`
- Use case: Development-focused agent with file/exec access

### `messaging`
- Tools: `group:messaging`, `sessions_list`, `sessions_history`, `sessions_send`, `session_status`
- Use case: Communication-only agent

### `full`
- Tools: No restrictions (all available tools)
- Default when unset

**Configuration:**

```json5
{
  // Global profile
  tools: { profile: "coding" },
  
  // Per-agent override
  agents: {
    list: [
      {
        id: "support",
        tools: { profile: "messaging", allow: ["slack"] }
      }
    ]
  }
}
```

---

## Tool Groups (Shorthands)

Use `group:*` entries in allow/deny lists:

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

**Example:**

```json5
{
  tools: {
    deny: ["group:runtime"]  // Denies exec, bash, process
  }
}
```

---

## Global Tool Policies

Control tools across all agents:

```json5
{
  tools: {
    // Base allowlist approach
    allow: ["read", "exec", "sessions_list"],
    
    // Or base denylist approach
    deny: ["browser", "canvas", "gateway"]
  }
}
```

**Notes:**
- Case-insensitive matching
- Supports `*` wildcards (`"*"` means all tools)
- Deny wins over allow
- Applied even when Docker sandbox is off

---

## Per-Agent Tool Policies

Restrict specific agents beyond global policies:

```json5
{
  agents: {
    list: [
      {
        id: "family",
        tools: {
          allow: ["read"],
          deny: ["exec", "write", "edit", "apply_patch", "browser"]
        }
      },
      {
        id: "work",
        tools: {
          allow: ["read", "write", "exec", "process"],
          deny: ["browser", "gateway", "discord"]
        }
      }
    ]
  }
}
```

**Constraint:** Agent policies can only narrow the global policy, not expand it.

---

## Provider-Specific Tool Restrictions

Restrict tools for specific model providers or provider/model combinations:

```json5
{
  tools: {
    profile: "coding",
    
    // Global provider restrictions
    byProvider: {
      "google-antigravity": { profile: "minimal" },
      "openai/gpt-5.2": { allow: ["group:fs", "sessions_list"] }
    }
  },
  
  agents: {
    list: [
      {
        id: "support",
        tools: {
          // Per-agent provider restrictions
          byProvider: {
            "google-antigravity": { allow: ["message", "sessions_list"] }
          }
        }
      }
    ]
  }
}
```

**When to use:**
- Provider has unreliable tool calling
- Specific models need stricter controls
- Testing new providers with limited access

---

## Sandbox Tool Policies

When sandboxing is enabled (`agents.defaults.sandbox.mode` or `agents.list[].sandbox.mode`):

```json5
{
  // Global sandbox tool policy
  tools: {
    sandbox: {
      tools: {
        allow: ["exec", "process", "read", "write", "edit"],
        deny: ["browser", "gateway"]
      }
    }
  },
  
  // Per-agent override
  agents: {
    list: [
      {
        id: "public",
        sandbox: { mode: "all", scope: "agent" },
        tools: {
          sandbox: {
            tools: {
              allow: ["read"],
              deny: ["exec", "write", "edit", "apply_patch"]
            }
          }
        }
      }
    ]
  }
}
```

**Default sandbox tools (when enabled but not configured):**
- Allow: `exec`, `process`, `read`, `write`, `edit`, `apply_patch`, `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status`

---

## Subagent Tool Policies

Control tools available to spawned sub-agents:

```json5
{
  tools: {
    subagents: {
      tools: {
        allow: ["read", "exec", "sessions_list"],
        deny: ["write", "edit", "browser", "gateway"]
      }
    }
  }
}
```

---

## Elevated Mode (Host Execution)

Control who can run commands on the host (bypassing sandbox):

```json5
{
  tools: {
    elevated: {
      enabled: true,
      allowFrom: {
        whatsapp: ["+15555550123"],
        discord: ["steipete", "1234567890123"],
        telegram: ["@username", "123456789"]
      }
    }
  },
  
  // Per-agent restriction
  agents: {
    list: [
      {
        id: "family",
        tools: {
          elevated: { enabled: false }  // Cannot use elevated even if sender is allowlisted
        }
      }
    ]
  }
}
```

**Important:**
- `tools.elevated` is sender-based (global baseline)
- `agents.list[].tools.elevated` can only further restrict (both must allow)
- Elevated exec runs on host and bypasses sandboxing
- Tool policy still applies (if `exec` is denied, elevated cannot be used)

---

## Complete Multi-Agent Example

```json5
{
  // Global defaults
  tools: {
    profile: "coding",
    deny: ["gateway"],  // No agent can restart gateway
    
    byProvider: {
      "google-antigravity": { profile: "minimal" }
    },
    
    elevated: {
      enabled: true,
      allowFrom: {
        whatsapp: ["+15555550123"]
      }
    }
  },
  
  agents: {
    defaults: {
      workspace: "~/.openclaw/workspace",
      sandbox: {
        mode: "non-main",
        scope: "agent"
      }
    },
    
    list: [
      {
        id: "main",
        default: true,
        name: "Personal Assistant",
        workspace: "~/.openclaw/workspace",
        sandbox: { mode: "off" }
        // Inherits global tool policies (coding profile, no gateway)
      },
      
      {
        id: "family",
        name: "Family Bot",
        workspace: "~/.openclaw/workspace-family",
        sandbox: {
          mode: "all",
          scope: "agent"
        },
        tools: {
          profile: "minimal",  // Override global coding profile
          allow: ["read", "sessions_list"],
          deny: ["exec", "write", "edit", "apply_patch", "browser"],
          elevated: { enabled: false }  // Never allow elevated
        }
      },
      
      {
        id: "work",
        name: "Work Assistant",
        workspace: "~/.openclaw/workspace-work",
        sandbox: {
          mode: "all",
          scope: "agent"
        },
        tools: {
          allow: ["read", "write", "exec", "process", "browser"],
          deny: ["edit", "apply_patch"],  // Read-only edits
          
          byProvider: {
            "openai/gpt-5.2": {
              deny: ["browser"]  // Specific model can't use browser
            }
          }
        }
      }
    ]
  },
  
  bindings: [
    {
      agentId: "family",
      match: {
        channel: "whatsapp",
        peer: { kind: "group", id: "120363424282127706@g.us" }
      }
    },
    {
      agentId: "work",
      match: { channel: "discord", guildId: "1234567890" }
    }
  ]
}
```

---

## Testing Tool Access

### 1. Check Agent Configuration

```bash
openclaw agents list --bindings
```

### 2. Verify Tool Availability (Diagnostic)

```bash
# Check which tools are available for a specific agent
openclaw gateway call tools.list --params '{"agentId": "family"}'
```

### 3. Monitor Tool Filtering in Logs

```bash
tail -f ~/.openclaw/logs/gateway.log | grep -E "tools|filtering"
```

### 4. Explain Sandbox Decision

```bash
openclaw sandbox explain --session <sessionKey>
```

---

## Common Patterns

### Read-Only Agent

```json5
{
  tools: {
    allow: ["read", "sessions_list", "sessions_history"],
    deny: ["exec", "write", "edit", "apply_patch", "process", "browser"]
  }
}
```

### Safe Execution Agent (No File Modifications)

```json5
{
  tools: {
    allow: ["read", "exec", "process"],
    deny: ["write", "edit", "apply_patch", "browser", "gateway"]
  }
}
```

### Communication-Only Agent

```json5
{
  tools: {
    profile: "messaging",
    deny: ["exec", "write", "edit", "apply_patch", "read", "browser"]
  }
}
```

### Development Agent with Browser but No Elevated

```json5
{
  tools: {
    profile: "coding",
    allow: ["browser"],
    elevated: { enabled: false }
  }
}
```

---

## Troubleshooting

### Tools Still Available Despite Deny List

**Check the filtering order:**
1. Verify global policy (`tools.allow/deny`)
2. Check agent-specific policy (`agents.list[].tools.allow/deny`)
3. Review sandbox policy if applicable
4. Monitor logs: `[tools] filtering tools for agent:${agentId}`

**Remember:** Each level can only restrict further, not grant back.

### Agent Not Using Expected Profile

**Profile resolution order:**
1. `agents.list[].tools.profile` (per-agent)
2. `tools.profile` (global)
3. Default: `full` (no restrictions)

**Verify:** Check that per-agent profile is set if you want to override global.

### Elevated Mode Not Working

**Requirements:**
1. `tools.elevated.enabled: true` (global)
2. Sender in `tools.elevated.allowFrom.<channel>`
3. `agents.list[].tools.elevated.enabled` not set to `false` (per-agent)
4. `exec` tool not denied by tool policies

**Both global AND per-agent must allow.**

### Sandbox Not Applied

**Check:**
1. `agents.defaults.sandbox.mode` or `agents.list[].sandbox.mode`
2. Session key (is it "main"? `mode: "non-main"` won't sandbox main sessions)
3. Agent-specific override may disable sandbox

**Note:** `mode: "non-main"` is based on `session.mainKey` (default `"main"`), not agent ID.

---

## Best Practices

### 1. Start Restrictive, Open Gradually

```json5
{
  tools: {
    profile: "minimal",
    allow: ["read", "sessions_list"]
  }
}
```

Add tools as needed rather than starting with `full`.

### 2. Use Profiles for Common Patterns

Don't manually list all tools—use profiles:

```json5
{
  tools: {
    profile: "coding",
    deny: ["browser", "gateway"]  // Remove specific tools from coding profile
  }
}
```

### 3. Layer Security for Sensitive Agents

Combine sandbox + tool restrictions + elevated denial:

```json5
{
  agents: {
    list: [
      {
        id: "public-bot",
        sandbox: { mode: "all", scope: "agent" },
        tools: {
          profile: "minimal",
          allow: ["read"],
          elevated: { enabled: false }
        }
      }
    ]
  }
}
```

### 4. Document Agent Boundaries

Add comments to your config explaining security decisions:

```json5
{
  agents: {
    list: [
      {
        id: "family",
        // Security: Family members can read but not modify files
        // No exec to prevent arbitrary code execution
        tools: {
          allow: ["read"],
          deny: ["exec", "write", "edit", "apply_patch"]
        }
      }
    ]
  }
}
```

### 5. Test Tool Restrictions

After configuration changes:

```bash
# 1. Verify config is valid
openclaw doctor

# 2. Check agent tool availability
openclaw agents list --bindings

# 3. Send test messages to verify restrictions
# (Try to use a denied tool and confirm it's blocked)
```

---

## References

- [Tools Documentation](/opt/homebrew/lib/node_modules/openclaw/docs/tools/index.md)
- [Multi-Agent Routing](/opt/homebrew/lib/node_modules/openclaw/docs/concepts/multi-agent.md)
- [Multi-Agent Sandbox & Tools](/opt/homebrew/lib/node_modules/openclaw/docs/multi-agent-sandbox-tools.md)
- [Configuration Reference](/opt/homebrew/lib/node_modules/openclaw/docs/gateway/configuration.md)
- [Sandboxing](/opt/homebrew/lib/node_modules/openclaw/docs/gateway/sandboxing.md)
- [Sandbox vs Tool Policy vs Elevated](/opt/homebrew/lib/node_modules/openclaw/docs/gateway/sandbox-vs-tool-policy-vs-elevated.md)

---

## Changelog

- **2026-02-08:** Initial comprehensive reference created
