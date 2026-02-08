# Tool Access Control Research Summary

**Date:** 2026-02-08  
**Researcher:** Clawd  
**Task:** Investigate correct method for strictly controlling `default_api` tool access

---

## Key Findings

### 1. Per-Agent Tool Policies Are the Correct Method

✅ **Confirmed:** OpenClaw supports fine-grained, per-agent tool access control via `agents.list[].tools` in `openclaw.json`.

This is **not** a workaround or hack—it's the documented, officially supported method.

---

### 2. Tool Access Control Architecture

OpenClaw implements a **multi-layered security model** where each layer can further restrict (but never expand) tool access:

**Filtering Order (Precedence Chain):**
1. Tool profile (minimal/coding/messaging/full)
2. Provider tool profile (per-provider restrictions)
3. Global tool policy (`tools.allow/deny`)
4. Provider tool policy (`tools.byProvider[provider]`)
5. **Agent-specific tool policy** (`agents.list[].tools`) ← **This is what we need**
6. Agent provider policy
7. Sandbox tool policy (when sandboxing enabled)
8. Subagent tool policy (for spawned sub-agents)

**Key Principle:** Each layer can only **narrow** the allowed set. Deny always wins.

---

### 3. Three Approaches to Restrict `default_api` Tools

#### A. Allowlist (Recommended)

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "web_search", "sessions_list"]
        }
      }
    ]
  }
}
```

**Benefits:**
- Explicit about permitted tools
- New tools won't be automatically available
- Easier to audit
- Defense-in-depth

#### B. Denylist

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          deny: ["exec", "write", "edit", "browser", "gateway"]
        }
      }
    ]
  }
}
```

**Risks:**
- New tools added in future versions will be automatically available
- May inadvertently allow more than intended

#### C. Tool Profile + Allowlist

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          profile: "minimal",  // Start with minimal
          allow: ["read", "web_search"]  // Add specific safe tools
        }
      }
    ]
  }
}
```

**Benefits:**
- Leverages pre-configured security profiles
- Can layer additional restrictions
- Clear security baseline

---

### 4. Tool Groups (Shorthands)

OpenClaw provides convenient `group:*` syntax for managing related tools:

- `group:runtime`: `exec`, `bash`, `process`
- `group:fs`: `read`, `write`, `edit`, `apply_patch`
- `group:sessions`: `sessions_list`, `sessions_history`, `sessions_send`, `sessions_spawn`, `session_status`
- `group:memory`: `memory_search`, `memory_get`
- `group:web`: `web_search`, `web_fetch`
- `group:ui`: `browser`, `canvas`
- `group:automation`: `cron`, `gateway`
- `group:messaging`: `message`
- `group:nodes`: `nodes`
- `group:openclaw`: All built-in OpenClaw tools

**Example:**

```json5
{
  tools: {
    deny: ["group:runtime"]  // Denies exec, bash, process
  }
}
```

---

### 5. Elevated Mode Must Be Explicitly Disabled

To prevent host execution via elevated mode:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          elevated: { enabled: false },  // Disable elevated
          deny: ["exec", "bash", "process"]  // Also deny runtime tools
        }
      }
    ]
  }
}
```

**Important:** Both `tools.elevated` (global) and `agents.list[].tools.elevated` (per-agent) must allow for elevated to work. Agent policy can only further restrict.

---

### 6. Sandboxing for Defense-in-Depth

Combine tool restrictions with Docker sandboxing for maximum isolation:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "web_search"],
          elevated: { enabled: false }
        },
        sandbox: {
          mode: "all",
          scope: "agent",
          workspaceAccess: "ro",
          docker: {
            network: "none",
            readOnlyRoot: true,
            pidsLimit: 128,
            memory: "512m"
          }
        }
      }
    ]
  }
}
```

**Layers of protection:**
1. Tool policy prevents dangerous tool calls
2. Sandbox prevents system access
3. Network isolation prevents external communication
4. Resource limits prevent resource exhaustion

---

## Recommended Configuration for `default_api`

Based on research, here's the recommended secure configuration:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        name: "External API Agent",
        
        // Strict tool allowlist
        tools: {
          allow: [
            "read",           // Read files
            "web_search",     // Search the web
            "web_fetch",      // Fetch URLs
            "sessions_list",  // List sessions
            "session_status"  // Session info
          ],
          elevated: { enabled: false }  // No host execution
        },
        
        // Optional: Docker sandbox for defense-in-depth
        sandbox: {
          mode: "all",
          scope: "agent",
          workspaceAccess: "ro",
          docker: {
            network: "none",
            readOnlyRoot: true
          }
        }
      }
    ]
  }
}
```

---

## Testing Checklist

After applying configuration:

- [ ] Run `openclaw doctor` to validate config
- [ ] Restart gateway: `openclaw gateway restart`
- [ ] Verify agent config: `openclaw agents list --bindings`
- [ ] Test via API: Try to use a denied tool (should fail)
- [ ] Monitor logs: `tail -f ~/.openclaw/logs/gateway.log | grep default_api`
- [ ] Check tool filtering: Look for `[tools] filtering tools for agent:default_api`

---

## Common Pitfalls

### ❌ Only Setting Global Policy

Global policy affects **all agents**, not just `default_api`:

```json5
{
  tools: { allow: ["read"] }  // Wrong: affects main, default_api, etc.
}
```

**Fix:** Use agent-specific policy.

### ❌ Forgetting to Restart

Config changes require a restart to take effect:

```bash
openclaw gateway restart
```

### ❌ Assuming Tools Are Denied by Default

By default, agents have access to **all tools** (unless restricted). You must explicitly configure restrictions.

### ❌ Mixing Allow and Deny

**Deny always wins.** This can create confusing configurations:

```json5
{
  tools: {
    allow: ["exec"],  // Allow exec
    deny: ["exec"]    // But also deny exec → exec is DENIED
  }
}
```

**Best practice:** Choose allowlist OR denylist approach, not both (unless layering deliberately).

---

## Documentation References

### Primary Sources

1. **Tools Documentation**  
   `/opt/homebrew/lib/node_modules/openclaw/docs/tools/index.md`  
   - Core tool reference
   - Global vs per-agent policies
   - Tool groups (shorthands)

2. **Multi-Agent Routing**  
   `/opt/homebrew/lib/node_modules/openclaw/docs/concepts/multi-agent.md`  
   - How agents are isolated
   - Binding and routing logic
   - Per-agent configuration

3. **Multi-Agent Sandbox & Tools**  
   `/opt/homebrew/lib/node_modules/openclaw/docs/multi-agent-sandbox-tools.md`  
   - Per-agent sandbox configuration
   - Tool restriction examples
   - Precedence rules

4. **Gateway Configuration**  
   `/opt/homebrew/lib/node_modules/openclaw/docs/gateway/configuration.md`  
   - Complete config schema
   - `tools.*` and `agents.list[].*` options
   - Validation rules

### Key Sections

- **Tool Profiles:** Lines 2142-2149 in configuration.md
- **Provider Restrictions:** Lines 2173-2206 in configuration.md
- **Tool Allow/Deny:** Lines 2206-2231 in configuration.md
- **Elevated Mode:** Lines 2231-2277 in configuration.md
- **Tool Groups:** Lines 2218-2230 in configuration.md
- **Per-Agent Sandbox:** Multi-Agent Sandbox & Tools (full document)

---

## Generated Documentation

As a result of this research, I created two comprehensive guides:

### 1. Tool Access Control Architecture (`tool-access-control-architecture.md`)
- Complete reference for all tool access control mechanisms
- Precedence chain explained
- Tool profiles, groups, and policies
- Examples for common patterns
- Troubleshooting guide
- Best practices

### 2. Restricting Default API Agent (`restricting-default-api-agent.md`)
- Focused guide for the specific `default_api` use case
- Quick-start configurations
- Three methods (allowlist, denylist, profile)
- Combining with sandboxing
- Testing procedures
- Common mistakes

Both documents are located in `/Users/vidarbrekke/clawd/docs/`.

---

## Conclusion

**Question:** "How do I strictly control which tools `default_api` can access?"

**Answer:** Use per-agent tool policies in `openclaw.json`:

```json5
{
  agents: {
    list: [
      {
        id: "default_api",
        tools: {
          allow: ["read", "web_search", "sessions_list"]
        }
      }
    ]
  }
}
```

This is the **correct, officially supported method**. No hacks, no workarounds—just proper multi-agent configuration.

---

## Next Steps

1. ✅ **Research complete** — Per-agent tool policies are the correct method
2. 📝 **Documentation created** — Two comprehensive guides written
3. 🎯 **Ready to implement** — User can now configure `default_api` tool access
4. 🧪 **Testing recommended** — Validate configuration with `openclaw doctor` before deploying

---

## Research Notes

### What I Learned

OpenClaw's architecture is well-designed for security:

1. **Defense in depth:** Multiple layers (tool policy + sandbox + elevated control)
2. **Principle of least privilege:** Start restrictive, open gradually
3. **Per-agent isolation:** Each agent has independent configuration
4. **Deny-by-default where it matters:** Elevated mode requires explicit allowlisting
5. **Clear precedence rules:** Each layer can only narrow permissions

### What Surprised Me

1. **Tool groups are powerful:** `group:runtime` is cleaner than listing `exec`, `bash`, `process`
2. **Provider-specific restrictions:** Can restrict tools per model provider (useful for flaky providers)
3. **Sandbox tool policies:** Additional restriction layer when sandboxing is enabled
4. **Auth is per-agent:** Credentials don't leak between agents (good security boundary)

### What's Still Unclear

None. The documentation is comprehensive and the architecture is clear.

---

**Research Status:** ✅ Complete  
**Documentation Status:** ✅ Complete  
**Implementation Status:** 🟡 Ready for user to apply configuration

