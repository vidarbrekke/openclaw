# OpenClaw extras

Community add-ons and docs for [OpenClaw](https://github.com/mariozechner/openclaw) users.

---

## What’s in this package

- **Parallel Sidecar** — Run multiple isolated chat tabs (each tab is its own session). No need to fork the Control UI.
- **Troubleshooting guide** — Fixes for Control UI, login, models, and Kimi-K2.5 issues (`docs/CLAWDBOT_TROUBLESHOOTING.md`).

---

## Install (one command)

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/vidarbrekke/openclaw/v0.1.1/install-openclaw-parallel-sidecar.sh | bash
```

When you use `curl ... | bash`, the script runs non-interactively (no prompt). To enable the HTTP endpoint, run the installer again in a terminal (e.g. `bash install-openclaw-parallel-sidecar.sh`) and answer **y**, or edit `~/.openclaw/openclaw.json` yourself.

**Windows:**  
Open PowerShell in the folder with the installer and run:

```powershell
.\install-openclaw-parallel-sidecar.ps1
```

Or use Git Bash and run the same `curl | bash` line above; it will call the PowerShell script for you.

---

## During install: the one question

The installer will ask:

**“Enable OpenClaw gateway HTTP chat endpoint? (required for sidecar; gateway will be restarted) [y/N]”**

- **Say Yes (y)** if you want the sidecar to work without any extra config.  
  The script will turn on the HTTP chat endpoint in your OpenClaw config. You must **restart the gateway** yourself (e.g. Ctrl+C then `openclaw gateway`) for the change to take effect.
- **Say No (N)** if you prefer to change config or restart the gateway yourself.

---

## After install: run the sidecar

1. **Start the gateway** (if it’s not already running):
   ```bash
   openclaw gateway
   ```
   If you answered **Yes** to the question above, restart the gateway (Ctrl+C if it’s in the foreground, then run `openclaw gateway` again) so the HTTP endpoint is enabled.

2. **Set the gateway URL** (in the same terminal or in your shell profile):
   ```bash
   export OPENCLAW_GATEWAY_URL="http://127.0.0.1:18789"
   ```
   If your gateway uses a token:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN="your-token-here"
   ```

3. **Start the sidecar:**
   ```bash
   cd ~/.openclaw/sidecar/parallel-chat
   npm start
   ```
   On Windows:
   ```powershell
   cd $env:USERPROFILE\.openclaw\sidecar\parallel-chat
   npm start
   ```

4. **Open your browser** at:  
   **http://127.0.0.1:3005/new**  
   Each new tab (or each time you open that URL) is a separate, isolated chat session.

---

## Requirements

- **OpenClaw** installed and configured.
- **Node.js 18+** and **npm** (for the sidecar).
- Gateway HTTP chat endpoint **enabled** (the installer can do this for you when you answer **Yes** to the question).

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

- **Sidecar says “Failed to load models” or chat doesn’t work**  
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
