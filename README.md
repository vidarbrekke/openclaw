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
curl -fsSL https://raw.githubusercontent.com/vidarbrekke/openclaw/main/install-openclaw-parallel-sidecar.sh | bash
```

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
  The script will turn on the HTTP chat endpoint in your OpenClaw config and then run `openclaw gateway stop` and `openclaw gateway` so the change takes effect.
- **Say No (N)** if you prefer to change config or restart the gateway yourself.

You don’t need to do anything else for this step; if you say yes, the script does it for you.

---

## After install: run the sidecar

1. **Start the gateway** (if it’s not already running):
   ```bash
   openclaw gateway
   ```
   If you answered **Yes** to the question above, the script already ran `openclaw gateway stop` and then `openclaw gateway` for you.

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
