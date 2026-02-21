#!/usr/bin/env node
/**
 * Add browser to tools.deny for the main agent in openclaw.json (cloud fix).
 * Run on the Linode (or with OPENCLAW_CONFIG_PATH set).
 * Usage: node scripts/cloud-disable-browser-tool.mjs
 */

import fs from "fs";
import path from "path";

const configPath =
  process.env.OPENCLAW_CONFIG_PATH ||
  path.join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "openclaw.json");

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const list = config.agents?.list;
if (!Array.isArray(list)) {
  console.error("No agents.list found in", configPath);
  process.exit(1);
}

const main = list.find((a) => a.id === "main");
if (!main) {
  console.error("No agent with id 'main' in agents.list");
  process.exit(1);
}

main.tools = main.tools || {};
const deny = new Set(Array.isArray(main.tools.deny) ? main.tools.deny : []);
deny.add("browser");
main.tools.deny = [...deny];

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
console.log("Updated", configPath, ": main agent now has tools.deny including 'browser'. Hot-reload; no gateway restart needed.");
