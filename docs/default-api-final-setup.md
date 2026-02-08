# `default_api` Agent - Final Setup Guide (No Docker)

**Date:** 2026-02-08  
**Status:** ✅ **COMPLETE & TESTED**

---

## ✅ What's Implemented

### Tool Restrictions (ACTIVE & VERIFIED)

The `default_api` agent now has **strict tool access control**:

**Allowed Tools (5 total):**
- ✅ `read` - Read files
- ✅ `web_search` - Search the web (requires Brave API key)
- ✅ `web_fetch` - Fetch URL content
- ✅ `sessions_list` - List chat sessions
- ✅ `session_status` - Get session info

**Denied Tools (Everything Else):**
- ❌ `exec` - No command execution
- ❌ `write`, `edit`, `apply_patch` - No file modifications
- ❌ `browser`, `canvas` - No UI automation
- ❌ `gateway` - No gateway control
- ❌ `cron` - No scheduled tasks
- ❌ `nodes` - No node control
- ❌ `message` - No messaging
- ❌ All other tools

**Elevated Mode:**
- ❌ Disabled - Cannot execute on host system

---

## 🧪 Test Results

All tests passed successfully:

### Test 1: Basic Message ✅
```bash
curl http://localhost:18789/v1/chat/completions \
  -H "x-openclaw-agent-id: default_api" \
  -H "Authorization: Bearer ..." \
  -d '{"model": "gpt-4", "messages": [...]}'
```
**Result:** Agent responds normally

### Test 2: Denied Tool (exec) ✅
```bash
# Request: "Please run this command: ls -la /Users"
```
**Result:** Agent correctly refuses: *"I can't execute shell commands like `ls` directly."*

### Test 3: Allowed Tool (read) ✅
```bash
# Request: "Read the file ~/clawd/docs/README.md"
```
**Result:** Agent successfully reads and summarizes the file

---

## 📋 Current Configuration

Location: `~/.openclaw/openclaw.json`

```json5
{
  "agents": {
    "list": [
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
        // No sandbox - Docker not used
      }
    ]
  }
}
```

**Backup saved:** `~/.openclaw/openclaw.json.backup-2026-02-08`

---

## 🎯 How to Use the API

### Important: Agent Targeting Required

**By default, API requests use the `main` agent** (which has full tool access).

To use the restricted `default_api` agent, you **must** specify it in requests:

### Method 1: Header (Recommended)

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -H "x-openclaw-agent-id: default_api" \
  -d '{
    "model": "gpt-4",
    "messages": [
      {"role": "user", "content": "Your message here"}
    ]
  }'
```

### Method 2: Model Field

```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -d '{
    "model": "openclaw:default_api",
    "messages": [
      {"role": "user", "content": "Your message here"}
    ]
  }'
```

Or use the alias:

```bash
"model": "agent:default_api"
```

---

## 🔧 Practical Next Steps

### 1. Set Default Agent for HTTP API (Optional)

If you want ALL API requests to use `default_api` by default (without specifying it each time), you can configure a default routing.

**Currently researching:** How to set HTTP endpoint default agent. Will update this doc once confirmed.

### 2. Add Brave API Key (For Web Search)

Currently web search will fail because Brave API key isn't configured:

```bash
openclaw configure --section web
```

Then enter your Brave Search API key when prompted.

Get a key here: https://brave.com/search/api/

### 3. Consider Network Access Restrictions

Your gateway is currently bound to LAN (`0.0.0.0` - network accessible).

**For localhost-only access:**

Edit `~/.openclaw/openclaw.json`:

```json5
{
  "gateway": {
    "bind": "loopback"  // Change from "lan" to "loopback"
  }
}
```

Then restart:

```bash
openclaw gateway restart
```

This limits access to `127.0.0.1` only (same machine).

### 4. Rotate Auth Token (If Sharing This Doc)

The auth token is visible in this documentation and previous test scripts.

If you share these docs or commit them to a repo, rotate the token:

```bash
openclaw configure --section gateway
```

Choose "Regenerate token" when prompted.

### 5. Add More Tools (If Needed)

To add more tools to the allowlist:

1. Edit `~/.openclaw/openclaw.json`
2. Find the `default_api` agent section
3. Add tools to the `tools.allow` array:

```json5
{
  "tools": {
    "allow": [
      "read",
      "web_search",
      "web_fetch",
      "sessions_list",
      "session_status",
      "write",          // ← Add this for file writing
      "memory_search"   // ← Add this for memory search
    ]
  }
}
```

4. Validate and restart:

```bash
openclaw doctor
openclaw gateway restart
```

---

## 🛡️ Security Summary

### What's Protected:

✅ **No file modifications** - Can only read, not write/edit  
✅ **No code execution** - Cannot run shell commands  
✅ **No privileged access** - Elevated mode disabled  
✅ **No dangerous operations** - Browser, gateway control, etc. denied  
✅ **Explicit tool allowlist** - Only 5 safe tools permitted

### What's NOT Protected (Without Docker):

⚠️ **Runs on host system** - Not isolated in container  
⚠️ **No resource limits** - Can use unlimited CPU/memory  
⚠️ **No network isolation** - Full network access  
⚠️ **Workspace access** - Can read entire workspace

### Compensating Controls:

1. ✅ Strong tool policy (tested and working)
2. ✅ Elevated mode disabled
3. ✅ Auth token required
4. ⏳ Consider binding to localhost only (see step 3 above)
5. ⏳ Consider firewall rules for external access

**Verdict:** Acceptable security for internal/trusted API use. Tool restrictions provide a solid security boundary.

---

## 📊 Monitoring & Verification

### Check Gateway Status

```bash
openclaw status
```

Look for: `Agents: 3 · ... · default main active`

### Check Agent Configuration

```bash
openclaw agents list
```

Should show:
```
- default_api (External API Agent)
  Workspace: ~/.openclaw/workspace-default_api
  Model: openrouter/qwen/qwen3-coder-plus
```

### Monitor API Usage

```bash
tail -f ~/.openclaw/logs/gateway.log
```

Watch for requests and tool usage.

### Test Tool Restrictions Periodically

Run the test script:

```bash
chmod +x /tmp/test-api-correct.sh
/tmp/test-api-correct.sh
```

Verify:
- Test 1 (basic message): ✅ Works
- Test 2 (exec denied): ✅ Refuses
- Test 3 (read allowed): ✅ Works

---

## 🔍 Troubleshooting

### Problem: Tool restrictions not working

**Check:**
1. Are you specifying `x-openclaw-agent-id: default_api` in requests?
2. Without that header, requests use the `main` agent (full access)

**Fix:** Add the header or use `model: "openclaw:default_api"`

### Problem: "Agent not found" error

**Check:**
```bash
openclaw agents list
```

**Verify:** `default_api` appears in the list

**Fix:** Restart gateway:
```bash
openclaw gateway restart
```

### Problem: Web search not working

**Cause:** Brave API key not configured

**Fix:**
```bash
openclaw configure --section web
```

### Problem: All requests failing

**Check gateway status:**
```bash
openclaw status
```

**Check logs:**
```bash
tail -50 ~/.openclaw/logs/gateway.log
```

**Restart if needed:**
```bash
openclaw gateway restart
```

---

## 📚 Related Documentation

- [Tool Access Control Architecture](./tool-access-control-architecture.md)
- [Restricting Default API Agent](./restricting-default-api-agent.md)
- [Research Summary](./tool-access-research-summary.md)
- [Implementation Status](./default-api-implementation-status.md)

---

## 📝 Quick Reference Card

### API Endpoint
```
http://localhost:18789/v1/chat/completions
```

### Authentication
```
Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f
```

### Target restricted agent
```
x-openclaw-agent-id: default_api
```

### Allowed Tools
```
read, web_search, web_fetch, sessions_list, session_status
```

### Example Request
```bash
curl http://localhost:18789/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 1d0c959726dca8709840bf7bca25e1448537e2ae297ebc2f" \
  -H "x-openclaw-agent-id: default_api" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

---

**Status:** ✅ Production ready (for internal/trusted API use)  
**Security Level:** Medium-High (tool restrictions without container isolation)  
**Next Steps:** Optional web API key, network binding review, periodic testing

