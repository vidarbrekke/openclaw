# `default_api` Agent Implementation Status

**Date:** 2026-02-08  
**Status:** ✅ Configuration Complete | ⏳ Docker Setup Pending

---

## ✅ What's Done

### 1. Configuration Applied

Added `default_api` agent with Variant A (Maximum Security) to `~/.openclaw/openclaw.json`:

```json5
{
  "id": "default_api",
  "name": "External API Agent",
  "tools": {
    "allow": [
      "read",
      "web_search",
      "web_fetch",
      "sessions_list",
      "session_status"
    ],
    "elevated": {
      "enabled": false
    }
  },
  "sandbox": {
    "mode": "all",
    "scope": "agent",
    "workspaceAccess": "ro",
    "docker": {
      "network": "bridge",
      "memory": "512m",
      "cpus": 1.0,
      "pidsLimit": 128,
      "readOnlyRoot": true,
      "user": "1000:1000"
    }
  }
}
```

### 2. Validation Passed

```bash
✅ openclaw doctor
   - Config validated successfully
   - No errors reported
   - Agent recognized: "Agents: main (default), local-ops, default_api"
```

### 3. Gateway Restarted

```bash
✅ openclaw gateway restart
   - Service restarted successfully
   - Gateway running on ws://127.0.0.1:18789
```

### 4. Agent Verified

```bash
✅ openclaw agents list --bindings
   - default_api (External API Agent)
   - Workspace: ~/.openclaw/workspace-default_api
   - Model: openrouter/qwen/qwen3-coder-plus
```

### 5. Backup Created

```bash
✅ Backup saved: ~/.openclaw/openclaw.json.backup-2026-02-08
```

---

## ⏳ What's Pending

### Docker Setup Required

The `default_api` agent is configured to use Docker sandboxing, but Docker is not currently running.

**Current Status:**
- Docker installed: ✅ `/usr/local/bin/docker`
- Docker daemon running: ❌ Not running

**Impact:**
- The `default_api` agent **cannot be used** until Docker is running and the sandbox image is built
- API calls to `/v1/chat/completions` will fail with sandbox-related errors

---

## 🔧 Next Steps

### Option A: Enable Docker (Recommended for Maximum Security)

**1. Start Docker Desktop:**

```bash
open -a Docker
```

Wait for Docker to fully start (whale icon in menu bar should be stable).

**2. Verify Docker is Running:**

```bash
docker ps
```

Should show container list (even if empty).

**3. Build Sandbox Image:**

```bash
# From OpenClaw installation directory
cd /opt/homebrew/lib/node_modules/openclaw
./scripts/sandbox-setup.sh
```

Or use the OpenClaw helper:

```bash
openclaw sandbox build
```

**4. Verify Sandbox Image:**

```bash
docker images | grep openclaw-sandbox
```

Should show `openclaw-sandbox:bookworm-slim` image.

**5. Test API Endpoint:**

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Hello, test message"}
    ]
  }'
```

---

### Option B: Disable Sandboxing (Less Secure)

If you don't want to use Docker sandboxing, you can disable it for `default_api`:

**1. Edit Config:**

Remove the `sandbox` section from the `default_api` agent:

```json5
{
  "id": "default_api",
  "name": "External API Agent",
  "tools": {
    "allow": [
      "read",
      "web_search",
      "web_fetch",
      "sessions_list",
      "session_status"
    ],
    "elevated": {
      "enabled": false
    }
  }
  // Remove sandbox section entirely
}
```

**2. Restart Gateway:**

```bash
openclaw gateway restart
```

**⚠️ Security Impact:**
- Tool restrictions still apply (only allowed tools can be used)
- But agent runs on host system (not isolated in Docker container)
- Less defense-in-depth compared to sandboxed approach
- Acceptable for internal/trusted API use

---

## 🧪 Testing Checklist

Once Docker is running (or sandboxing is disabled):

### 1. Test Allowed Tool (should work)

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Search the web for OpenAI latest news"}
    ]
  }'
```

**Expected:** Agent uses `web_search` tool successfully.

### 2. Test Denied Tool (should fail)

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Run this command: ls -la /Users"}
    ]
  }'
```

**Expected:** Agent cannot use `exec` tool (denied by tool policy).

### 3. Monitor Logs

```bash
tail -f ~/.openclaw/logs/gateway.log | grep -E "default_api|tools|sandbox"
```

Look for:
- `[tools] filtering tools for agent:default_api`
- Tool usage logs
- Sandbox container startup (if Docker enabled)

### 4. Check Sandbox Container (If Docker Enabled)

```bash
docker ps --filter "name=openclaw-sbx-default_api"
```

Should show running container when `default_api` is active.

---

## 📊 Current Configuration Summary

### Security Features Enabled:

✅ **Tool Allowlist:**
- Only 5 safe tools permitted
- No file writing
- No code execution
- No dangerous operations

✅ **Elevated Mode Disabled:**
- Cannot execute on host system
- No privileged access

⏳ **Docker Sandbox (Pending Docker):**
- Will run in isolated container
- Read-only workspace access
- Network isolation (bridge)
- Resource limits (512MB RAM, 1 CPU)
- Process limits (128 max)
- Read-only root filesystem

### API Endpoint:

- **URL:** `http://localhost:18789/v1/chat/completions`
- **Auth:** Bearer token (from config: `1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f`)
- **Bound to:** LAN (0.0.0.0) - Network accessible
- **Agent:** `default_api` (automatically used for HTTP API requests)

---

## 🔍 Verification Commands

```bash
# Check agent configuration
openclaw agents list --bindings

# Check gateway status
openclaw status

# View recent logs
openclaw logs --tail 50

# Validate configuration
openclaw doctor

# Check Docker status (if using sandbox)
docker ps
docker images | grep openclaw-sandbox

# Check sandbox container for default_api (when active)
docker ps --filter "name=openclaw-sbx-default_api"
```

---

## 📝 Configuration Files

- **Main Config:** `~/.openclaw/openclaw.json`
- **Backup:** `~/.openclaw/openclaw.json.backup-2026-02-08`
- **Agent Dir:** `~/.openclaw/agents/default_api/agent`
- **Workspace:** `~/.openclaw/workspace-default_api`
- **Logs:** `~/.openclaw/logs/gateway.log`

---

## 🚨 Important Notes

### Security Warnings:

1. **Gateway bound to LAN (0.0.0.0)**
   - Network-accessible on your local network
   - Ensure strong auth token (currently set)
   - Consider firewall rules for external access

2. **Auth Token Exposed in This Document**
   - Current token: `1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f`
   - Consider rotating if this document is shared
   - Set via: `openclaw configure --section gateway`

3. **Docker Daemon Not Running**
   - Sandbox protection is NOT active until Docker is started
   - Tool restrictions still apply (partial protection)
   - Start Docker before exposing API externally

---

## ❓ FAQ

### Q: Can I use the API now without Docker?

**A:** Yes, but with reduced security:
1. Edit config to remove `sandbox` section
2. Restart gateway
3. Tool restrictions still apply (only allowed tools work)
4. But agent runs on host (not isolated)

### Q: Which tools are allowed for `default_api`?

**A:** Only these 5 tools:
- `read` - Read files
- `web_search` - Search the web
- `web_fetch` - Fetch URLs
- `sessions_list` - List sessions
- `session_status` - Get session info

### Q: Can I add more tools later?

**A:** Yes:
1. Edit `~/.openclaw/openclaw.json`
2. Add tools to `agents.list[].tools.allow` array
3. Run `openclaw doctor` to validate
4. Run `openclaw gateway restart`

### Q: How do I test if restrictions are working?

**A:** Try to use a denied tool via API (like `exec`). It should fail.

---

## 📚 Related Documentation

- [Tool Access Control Architecture](./tool-access-control-architecture.md)
- [Restricting Default API Agent](./restricting-default-api-agent.md)
- [Research Summary](./tool-access-research-summary.md)

---

**Status:** Ready for Docker setup or sandbox disabling decision.
