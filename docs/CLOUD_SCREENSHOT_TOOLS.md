# Cloud workspace: URL screenshots (agent instructions)

**Place this file in the workspace root on the Linode** (e.g. `/root/openclaw-stock-home/.openclaw/workspace/CLOUD_SCREENSHOT_TOOLS.md`) so the agent reads it. You can copy from `docs/CLOUD_SCREENSHOT_TOOLS.md` in the repo.

---

On this cloud workspace the **browser** and **canvas** tools are not available (no display). For screenshots of URLs or “check this page”:

1. **Use the `exec` tool** — not the process tool. The **process** tool does **not** have an "exec" action. If you call the process tool with `action: "exec"`, the gateway returns **"Unknown action exec"**. Process only supports: list, poll, log, write, kill, clear, remove.

2. **Run mcporter via exec.** Example for a URL screenshot:
   - First: `exec` with command:  
     `mcporter call playwright.browser_navigate url=<the-url>`
   - Then: `exec` with command:  
     `mcporter call playwright.browser_take_screenshot`  
     (optionally add `filename=something.png` if you need a specific path)

3. **Never** call the process tool with `action: "exec"`. Use the **exec** tool for any shell command, including mcporter.

Config: `config/mcporter.json` in the workspace. Playwright server is `playwright`; tools include `browser_navigate`, `browser_take_screenshot`, etc. List tools with: `mcporter list` or `mcporter list --schema`.
