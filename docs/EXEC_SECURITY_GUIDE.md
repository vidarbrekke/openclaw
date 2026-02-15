# OpenClaw Exec Security Guide

## Overview

With `exec` enabled on all agents, you have several layers of protection against malicious code execution. This guide explains what's available and how to configure it.

---

## Security Layers

### 1. **Sandboxing** (Container Isolation)

**What it does:** Runs commands in isolated Docker containers instead of directly on your host.

**Configuration:**
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all"  // "off" | "non-main" | "all"
      }
    }
  }
}
```

**Modes:**
- `"off"`: No sandboxing (exec runs on host) - **NOT RECOMMENDED** with exec enabled
- `"non-main"`: Only non-main agents are sandboxed
- `"all"`: All agents run in sandboxes

**Current status:** Your config has `sandbox.mode: "off"` (default), meaning exec runs directly on your host.

**Recommendation:** Enable sandboxing for agents with exec:
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "workspaceAccess": "rw"  // or "ro" for read-only
      }
    }
  }
}
```

---

### 2. **Exec Approvals** (Manual Approval Required)

**What it does:** Requires explicit approval before commands run on the gateway host or node hosts.

**Configuration file:** `~/.openclaw/exec-approvals.json`

**Example config:**
```json
{
  "version": 1,
  "defaults": {
    "security": "allowlist",  // "deny" | "allowlist" | "full"
    "ask": "on-miss",         // "off" | "on-miss" | "always"
    "askFallback": "deny"     // What happens if UI unavailable
  },
  "agents": {
    "main": {
      "security": "allowlist",
      "ask": "always",  // Prompt for every command
      "allowlist": [
        {
          "pattern": "/usr/bin/ls",
          "id": "uuid-here"
        }
      ]
    }
  }
}
```

**Security modes:**
- `"deny"`: Block all host exec requests
- `"allowlist"`: Only allowlisted commands can run
- `"full"`: Allow everything (dangerous)

**Ask modes:**
- `"off"`: Never prompt (uses allowlist/deny only)
- `"on-miss"`: Prompt only when allowlist doesn't match
- `"always"`: Prompt for every command (most secure)

**How to enable:**
1. Edit `~/.openclaw/exec-approvals.json` (create if missing)
2. Set `security: "allowlist"` and `ask: "always"` for strictest control
3. Or use Control UI → Nodes → Exec approvals

**Note:** Approvals only apply when `host=gateway` or `host=node`. With `host=sandbox` and sandboxing off, approvals are bypassed.

---

### 3. **Safe Bins Allowlist** (Pre-approved Safe Commands)

**What it does:** Defines a list of "safe" stdin-only binaries that can run without explicit allowlist entries.

**Default safe bins:** `jq`, `grep`, `cut`, `sort`, `uniq`, `head`, `tail`, `tr`, `wc`

**Configuration:**
```json
{
  "tools": {
    "exec": {
      "safeBins": ["jq", "grep", "cut", "sort", "uniq", "head", "tail", "tr", "wc"]
    }
  }
}
```

**How it works:** These binaries are considered safe because they:
- Only operate on stdin (no file system access)
- Reject positional file arguments
- Don't support shell chaining/redirections in allowlist mode

---

### 4. **Exec Host Routing** (Control Where Commands Run)

**What it does:** Controls whether commands run in sandbox, on gateway host, or on a node.

**Configuration:**
```json
{
  "tools": {
    "exec": {
      "host": "sandbox"  // "sandbox" | "gateway" | "node"
    }
  }
}
```

**Per-session override:**
```
/exec host=gateway security=allowlist ask=always
```

**Security implications:**
- `host=sandbox`: Runs in container (if sandboxing enabled) - **SAFEST**
- `host=gateway`: Runs on gateway host - requires approvals if configured
- `host=node`: Runs on paired node - requires approvals if configured

**Current default:** `host=sandbox` (but sandboxing is off, so it runs on host anyway)

---

### 5. **Tool Policy Restrictions** (Per-Agent Tool Allowlists)

**What it does:** Limits which tools each agent can use.

**Current config:**
- `main`: All tools allowed (no restrictions)
- `default_api`: Only `read`, `web_search`, `web_fetch`, `sessions_list`, `session_status`, `exec`
- `local-ops`: Only `exec`, `read`, `write`, `edit`

**To restrict exec on specific agents:**
```json
{
  "agents": {
    "list": [
      {
        "id": "default_api",
        "tools": {
          "allow": ["read", "web_search"],  // Remove "exec"
          "elevated": {
            "enabled": false  // Blocks exec even if in allow list
          }
        }
      }
    ]
  }
}
```

---

### 6. **Channel Authorization** (Who Can Send Commands)

**What it does:** Only authorized senders can trigger exec commands.

**Controls:**
- Telegram: `channels.telegram.allowFrom` (DM allowlist)
- Telegram groups: `channels.telegram.groupAllowFrom` + `groupPolicy`
- Other channels: Similar allowlist mechanisms

**Current status:** Your Telegram is configured with `dmPolicy: "pairing"` and allowlist `["5309173712"]`.

---

## Recommended Security Setup

### For Maximum Protection:

1. **Enable sandboxing:**
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "workspaceAccess": "rw"
      }
    }
  }
}
```

2. **Enable exec approvals with strict policy:**
Create/edit `~/.openclaw/exec-approvals.json`:
```json
{
  "version": 1,
  "defaults": {
    "security": "allowlist",
    "ask": "always",
    "askFallback": "deny"
  },
  "agents": {
    "main": {
      "security": "allowlist",
      "ask": "always"
    },
    "default_api": {
      "security": "allowlist",
      "ask": "always"
    },
    "local-ops": {
      "security": "allowlist",
      "ask": "on-miss"  // Less strict for local ops
    }
  }
}
```

3. **Set exec host to sandbox:**
```json
{
  "tools": {
    "exec": {
      "host": "sandbox",
      "security": "allowlist",
      "ask": "on-miss"
    }
  }
}
```

4. **Restrict gateway exposure:**
Your gateway is bound to `"lan"` (0.0.0.0) - consider `"loopback"` if only local access needed:
```json
{
  "gateway": {
    "bind": "loopback"  // Only localhost
  }
}
```

---

## Current Risk Assessment

**With your current setup:**

| Risk | Level | Mitigation |
|------|-------|------------|
| **Sandboxing** | ❌ **OFF** | Commands run directly on host |
| **Exec approvals** | ⚠️ **Not configured** | No approval prompts |
| **Tool restrictions** | ✅ **Partial** | Per-agent allowlists exist |
| **Channel auth** | ✅ **Enabled** | Telegram pairing + allowlist |
| **Gateway exposure** | ⚠️ **LAN** | Accessible on local network |

**Overall:** Medium-high risk. Commands can run on your host without approval if:
- An authorized Telegram user sends a message
- The agent decides to use exec
- No sandboxing or approval system blocks it

---

## Quick Fixes

### Option 1: Enable Sandboxing (Recommended)
```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all"
      }
    }
  }
}
```

### Option 2: Enable Exec Approvals
Create `~/.openclaw/exec-approvals.json` with strict defaults (see above).

### Option 3: Restrict Gateway Binding
```json
{
  "gateway": {
    "bind": "loopback"  // Instead of "lan"
  }
}
```

### Option 4: Remove exec from default_api
If you don't need exec on the external API agent, remove it from the allowlist.

---

## Monitoring

**Check what commands are running:**
- Gateway logs: `~/.openclaw/logs/gateway.log`
- Control UI → Sessions → View transcript
- System events: `Exec running`, `Exec finished`, `Exec denied`

**Audit exec usage:**
```bash
openclaw security audit --deep
```

---

## Summary

**You have exec enabled on all agents with minimal protections.** To secure it:

1. ✅ **Enable sandboxing** (isolates commands in containers)
2. ✅ **Enable exec approvals** (requires manual approval)
3. ✅ **Restrict gateway binding** (limit network exposure)
4. ✅ **Use allowlists** (only pre-approved commands)

The combination of sandboxing + approvals provides strong protection while still allowing legitimate use.
