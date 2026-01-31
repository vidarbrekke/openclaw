# OpenClaw extras

Community add-ons and docs for [OpenClaw](https://github.com/mariozechner/openclaw) users.

---

## What's in this package

- **Parallel Sidecar** — Run multiple isolated chat tabs (each tab is its own session). No need to fork the Control UI.
- **Troubleshooting guide** — Fixes for Control UI, login, models, and Kimi-K2.5 issues (`docs/CLAWDBOT_TROUBLESHOOTING.md`).

---

## Install (one command)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/vidarbrekke/openclaw/v0.1.3/install-openclaw-parallel-sidecar.sh | bash
```

The installer automatically enables the gateway HTTP endpoint (answer "n" if you run it interactively and want to skip this).

**Windows:**  
Open PowerShell in the folder with the installer and run:

```powershell
.\install-openclaw-parallel-sidecar.ps1
```

Or use Git Bash and run the same `curl | bash` line above; it will call the PowerShell script for you.

---

## During install

If you run the installer **interactively** (not via `curl|bash`), it will ask:

**"Enable OpenClaw gateway HTTP chat endpoint? (required for sidecar) [Y/n]"**

- Default is **Yes** — just press Enter to enable.
- Say **No (n)** if you want to configure it yourself later.

When installed via `curl ... | bash`, it **auto-enables** (assumes Yes).

---

## After install: run the sidecar

If you answered **Yes** (or used `curl|bash`), the installer **restarts the gateway and starts the sidecar in the background** so you can use them right away. Ports are read from your OpenClaw config when possible (default gateway **18789**, sidecar **3005**).

If you prefer to run in the **foreground** (e.g. to see logs), stop the background processes and run in two terminals:

1. **Gateway** (terminal 1):
   ```bash
   openclaw gateway
   ```

2. **Sidecar** (terminal 2). Set the gateway URL (default port 18789; installer uses config when present):
   ```bash
   cd ~/.openclaw/sidecar/parallel-chat
   export OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789"
   # export OPENCLAW_GATEWAY_TOKEN="your-token-here"   # if your gateway uses a token
   PORT=3005 npm start
   ```
   On Windows:
   ```powershell
   cd $env:USERPROFILE\.openclaw\sidecar\parallel-chat
   $env:OPENCLAW_GATEWAY_URL = "http://127.0.0.1:18789"
   npm start
   ```

3. **Open your browser** at:  
   **http://127.0.0.1:3005/new**  
   Each new tab (or each time you open that URL) is a separate, isolated chat session.

**Ports:** Gateway port is read from `~/.openclaw/openclaw.json` (`gateway.http.port` or `gateway.port`) when present; otherwise **18789**. Sidecar uses **3005** by default; set `PORT` to override.

---

## Requirements

- **OpenClaw** installed and configured.
- **Node.js 18+** and **npm** (for the sidecar).
- Gateway HTTP chat endpoint **enabled** (the installer does this automatically).

---

## Uninstall / disable

### Stop the sidecar

If the sidecar is running, press `Ctrl+C` in the terminal where `npm start` is running, or find the process and kill it:

```bash
# macOS/Linux
pkill -f "node.*parallel-chat"

# Windows
Stop-Process -Name node -Force
```

### Remove the sidecar files

**macOS / Linux:**
```bash
rm -rf ~/.openclaw/sidecar/parallel-chat
```

**Windows:**
```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.openclaw\sidecar\parallel-chat"
```

### Disable the HTTP endpoint (optional)

If you want to turn off the gateway's HTTP chat endpoint (to save resources or for security), edit your OpenClaw config:

**macOS/Linux:** `~/.openclaw/openclaw.json`  
**Windows:** `%USERPROFILE%\.openclaw\openclaw.json`

Find this section and set `enabled: false`:

```json
"gateway": {
  "http": {
    "endpoints": {
      "chatCompletions": { "enabled": false }
    }
  }
}
```

Then restart the gateway:
```bash
openclaw gateway stop
openclaw gateway
```

---

## Troubleshooting

- **No page at http://127.0.0.1:3005/new or connection refused**  
  The sidecar is not running. Start it manually (so you can see any errors):
  ```bash
  cd ~/.openclaw/sidecar/parallel-chat
  export OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789"
  npm start
  ```
  Then open http://127.0.0.1:3005/new again. If the installer started it in the background, it may have exited (e.g. missing env or port in use); running it in the foreground shows the cause.

- **Sidecar says "Failed to load models" or chat doesn't work**  
  Make sure the gateway HTTP chat endpoint is enabled and the gateway has been restarted. You can enable it yourself in `~/.openclaw/openclaw.json` (macOS/Linux) or `%USERPROFILE%\.openclaw\openclaw.json` (Windows) by adding or setting:
  ```json
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
  ```
  Then run: `openclaw gateway stop` and then `openclaw gateway`.

- **Control UI, login, models, Kimi-K2.5**  
  See **docs/CLAWDBOT_TROUBLESHOOTING.md** in this package or on the repo.

---

## Repo and one-liner

- **Repo:** https://github.com/vidarbrekke/openclaw  
- **One-liner (install only):**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/vidarbrekke/openclaw/main/install-openclaw-parallel-sidecar.sh | bash
  ```

---

## License

Use and share as you like. OpenClaw itself has its own license; this repo is community extras.
