# Playwright MCP on the cloud (Linode)

## What was done

1. **Playwright MCP + Chromium installed** on the Linode at `/root/openclaw-stock-home/.openclaw/playwright-mcp/`:
   - `npm install @playwright/mcp@latest`
   - `npx playwright install chromium` + `npx playwright install-deps chromium`
   - System dependencies for headless Chromium are installed.

2. **OpenClaw config:** OpenClaw **2026.2.17** does **not** accept a top-level `"mcp"` key in `openclaw.json`. The gateway fails to start with `Unrecognized key: "mcp"`. So the Playwright MCP server could not be registered there; the install is ready for use via **mcporter** or exec (see below).

## mcporter (skill + CLI) and MCP

**mcporter** is an OpenClaw skill that lets the agent call MCP servers via the **mcporter** CLI. Servers are listed in **`config/mcporter.json`** (or `--config` path), not in `openclaw.json`. The agent runs commands like `mcporter call playwright.playwright_navigate url=...` or `mcporter call motherknitter.giftcard_lookup code=...`. So you can add Playwright as a server in **mcporter.json** and use the mcporter skill for “screenshot this URL” / “check this page” without needing OpenClaw to support a top-level `mcp` key.

**Requirements:** mcporter CLI must be installed where the agent runs (e.g. on the Linode), and the agent must be allowed to run it (typically via **exec**). The **mcporter skill** must be installed so the agent knows to use `mcporter call <server>.<tool> ...`. On the Linode the workspace config is at `/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json` (it already has `motherknitter`); add a `playwright` entry there (see Option D below).

## Options going forward

### Option A: Use Playwright via exec (when you allow it)

If you allow `exec` for the main agent (or a dedicated agent), the agent can run the Playwright CLI for screenshots and simple automation using the already-installed environment:

```bash
cd /root/openclaw-stock-home/.openclaw/playwright-mcp && npx playwright screenshot "https://example.com" --path /tmp/screenshot.png --project=chromium
```

You could add a skill that tells the agent to use this pattern for “screenshot this URL” / “check this page” when exec is available. Main currently has `tools.deny: ["exec"]`, so you’d need to allow exec for that agent or use another agent with exec + this skill.

### Option B: Wait for OpenClaw to support MCP in config

When a future OpenClaw release supports a top-level `mcp` (or equivalent) in `openclaw.json`, you can add:

```json
"mcp": {
  "servers": {
    "playwright": {
      "command": "node",
      "args": ["/root/openclaw-stock-home/.openclaw/playwright-mcp/node_modules/@playwright/mcp/index.js"]
    }
  }
}
```

Then add `"playwright"` to the main agent’s `tools.allow` and restart the gateway.

### Option C: Re-run config script after an OpenClaw upgrade

After upgrading OpenClaw to a version that accepts `mcp`:

1. From the repo: `node scripts/cloud-add-playwright-mcp-config.mjs` on the Linode (with `OPENCLAW_CONFIG_PATH=/root/openclaw-stock-home/.openclaw/openclaw.json`).
2. Restart the gateway: `systemctl --user restart openclaw-gateway.service`.

### Option D: Use mcporter skill (recommended if you already use mcporter)

If the Linode already uses the **mcporter** skill and **mcporter.json** (e.g. for motherknitter), add Playwright to the same config so the agent can call Playwright MCP via `mcporter call playwright.<tool> ...`.

1. **On the Linode**, edit `/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json` (or wherever the workspace mcporter config lives). Add a `playwright` entry to `mcpServers` (use **cli.js** with cwd and env so the server stays up; `index.js` can close the connection when run without cwd):

   ```json
   "playwright": {
     "command": "bash",
     "args": ["-c", "cd /root/openclaw-stock-home/.openclaw/playwright-mcp && exec node node_modules/@playwright/mcp/cli.js"],
     "env": { "PLAYWRIGHT_BROWSERS_PATH": "/root/.cache/ms-playwright" }
   }
   ```

   So the file looks like: `{"mcpServers":{"motherknitter":{...},"playwright":{...}},"imports":[]}`.

2. **Install mcporter CLI** on the Linode if not already: `npm install -g mcporter` (or use npx from the workspace).

3. **Install the mcporter skill** if not already (e.g. `skills install @clawdbot/mcporter` or from the OpenClaw skill catalog). The skill tells the agent how to use `mcporter call <server>.<tool> ...`.

4. The agent needs to be able to run mcporter (usually via **exec**). If the main agent has `exec` denied, you’d need to allow exec for that agent or use another agent that has exec and the mcporter skill.

5. Test from the server:  
   `mcporter call playwright.playwright_navigate url=https://example.com`  
   (or list tools first: `mcporter list --schema` to see Playwright tools).

## Scripts in this repo

| Script | Purpose |
|--------|--------|
| `scripts/install-playwright-mcp-linode.sh` | Install @playwright/mcp + Chromium + deps on the server (already run). |
| `scripts/cloud-add-playwright-mcp-config.mjs` | Add `mcp.servers.playwright` and `playwright` to main’s `tools.allow`. Run only when OpenClaw supports `mcp`. |

## Local vs cloud

- **Local (Mac):** You can use Cursor’s Playwright MCP and/or OpenClaw’s native `browser` tool; no change.
- **Cloud (Linode):** Native `browser` is disabled (no display). Playwright MCP is installed but not wired into OpenClaw until the config schema supports it; until then, “screenshot this URL” can be done via exec + Playwright CLI if you allow exec for the relevant agent.
