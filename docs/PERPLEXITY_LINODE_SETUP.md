# Perplexity web search on Linode (clawd cloud)

This mirrors the Mac’s Perplexity-based `web_search` setup on the Linode. **You add the API key on the server**; the key is never copied from the Mac.

## 1. Add Perplexity config to OpenClaw on the Linode

On the Linode, `openclaw.json` must have `tools.web.search` set to use Perplexity. The API key is read from the environment (see step 2), so it is not stored in the config file.

**Option A – Merge with a one-liner (recommended)**

SSH in and run:

```bash
ssh -i ~/.ssh/id_ed25519_linode root@45.79.135.101
```

Then (backup first, then merge):

```bash
cp /root/openclaw-stock-home/.openclaw/openclaw.json /root/openclaw-stock-home/.openclaw/openclaw.json.bak
# Merge in Perplexity web search config (creates tools.web.search.perplexity)
node -e "
const fs = require('fs');
const path = '/root/openclaw-stock-home/.openclaw/openclaw.json';
const cfg = JSON.parse(fs.readFileSync(path, 'utf8'));
cfg.tools = cfg.tools || {};
cfg.tools.web = cfg.tools.web || {};
cfg.tools.web.search = {
  provider: 'perplexity',
  perplexity: {
    baseUrl: 'https://api.perplexity.ai',
    model: 'perplexity/sonar-pro'
  }
};
fs.writeFileSync(path, JSON.stringify(cfg, null, 2));
console.log('Updated tools.web.search to use Perplexity.');
"
```

**Option B – Edit by hand**

Edit `/root/openclaw-stock-home/.openclaw/openclaw.json` and ensure the `tools` section includes:

```json
"tools": {
  "web": {
    "search": {
      "provider": "perplexity",
      "perplexity": {
        "baseUrl": "https://api.perplexity.ai",
        "model": "perplexity/sonar-pro"
      }
    }
  },
  ...existing exec, elevated, etc...
}
```

Do **not** put your real API key in the JSON. The gateway will read it from the environment.

## 2. Set the API key on the Linode

OpenClaw loads env vars from `~/.openclaw/.env` when the gateway runs. On the Linode stock-home that is `/root/openclaw-stock-home/.openclaw/.env`.

Create or edit that file (only on the server):

```bash
# On the Linode
echo 'PERPLEXITY_API_KEY=pplx-your-key-here' >> /root/openclaw-stock-home/.openclaw/.env
# Or edit in place:
nano /root/openclaw-stock-home/.openclaw/.env
```

Add a single line:

```
PERPLEXITY_API_KEY=pplx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Replace with your real key from the [Perplexity API](https://www.perplexity.ai/settings/api) (or use the same key you use on the Mac). Keep this file readable only by root:

```bash
chmod 600 /root/openclaw-stock-home/.openclaw/.env
```

## 3. Restart the gateway

So it picks up the new config and env:

```bash
# If using systemd user service (root):
systemctl --user restart openclaw-gateway.service

# Or if you start the gateway manually, stop it and start again after editing .env and openclaw.json
```

## 4. Verify

In a session that allows `web_search`, ask the agent to search the web. If the gateway fails to start or web_search errors, check:

- `PERPLEXITY_API_KEY` is set in `/root/openclaw-stock-home/.openclaw/.env` (no typos, no extra spaces).
- `tools.web.search.provider` is `"perplexity"` and `tools.web.search.perplexity.baseUrl` is `"https://api.perplexity.ai"` in `/root/openclaw-stock-home/.openclaw/openclaw.json`.
- Gateway logs (e.g. journal if systemd): `journalctl --user -u openclaw-gateway.service -f`

## Reference (Mac vs Linode)

- **Mac:** Key can be in `~/.openclaw/openclaw.json` (e.g. from `openclaw configure --section web`) or in `~/.openclaw/.env` as `PERPLEXITY_API_KEY`.
- **Linode:** Key only in `/root/openclaw-stock-home/.openclaw/.env`; config in `/root/openclaw-stock-home/.openclaw/openclaw.json` uses Perplexity with no `apiKey` field so the gateway uses the env var.

Models (optional to change in config):

- `perplexity/sonar` — fast
- `perplexity/sonar-pro` — default, good balance
- `perplexity/sonar-reasoning-pro` — deep research
