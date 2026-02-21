#!/usr/bin/env node
/**
 * Add Playwright MCP server to openclaw.json and allow it for the main agent.
 * Run on the Linode after install-playwright-mcp-linode.sh.
 */
import fs from "fs";
import path from "path";

const configPath =
  process.env.OPENCLAW_CONFIG_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "openclaw.json");

const playwrightEntry =
  process.env.PLAYWRIGHT_MCP_ENTRY ||
  path.join(
    path.dirname(configPath),
    "playwright-mcp",
    "node_modules",
    "@playwright",
    "mcp",
    "index.js"
  );

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Add mcp.servers.playwright
config.mcp = config.mcp || {};
config.mcp.servers = config.mcp.servers || {};
config.mcp.servers.playwright = {
  command: "node",
  args: [playwrightEntry],
};

// Allow playwright (MCP tools) for main agent
const main = config.agents?.list?.find((a) => a.id === "main");
if (main) {
  main.tools = main.tools || {};
  const allow = new Set(Array.isArray(main.tools.allow) ? main.tools.allow : []);
  allow.add("playwright");
  main.tools.allow = [...allow];
}

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log("Updated", configPath);
console.log("  mcp.servers.playwright:", { command: "node", args: [playwrightEntry] });
console.log("  main.tools.allow now includes playwright");
console.log("Restart the gateway to load MCP: systemctl --user restart openclaw-gateway.service");
