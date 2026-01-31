# Session Proxy – Test Results

Tests run against a local gateway (127.0.0.1:18789) and the Session Proxy (127.0.0.1:3010).

## Verified (automated + Playwright + gateway JS inspection)

| Test | Result |
|------|--------|
| **Proxy starts** | OK – listens on PROXY_PORT (3010) |
| **`/new` redirect** | OK – 302, `Location: /?session=proxy:uuid`, `Set-Cookie: openclaw_session=...` |
| **Gateway reachable** | OK – GET / and GET /v1/models return 200 |
| **Proxy forwards GET /** | OK – returns real Control UI HTML (`<title>OpenClaw Control</title>`) |
| **Proxy forwards assets** | OK – GET /assets/index-*.js returns 200 |
| **Control UI WebSocket URL** | OK – Control UI builds WebSocket URL from `location`: `gatewayUrl:\`\${location.protocol==="https:"?"wss":"ws"}://\${location.host}\`` (in gateway’s index-*.js). So when loaded via proxy (127.0.0.1:3010), WebSocket goes to **ws://127.0.0.1:3010** → through proxy. |
| **Session cookie set** | OK – Playwright: cookie `openclaw_session` present with value `proxy:uuid`, path `/`, sameSite Lax. |
| **Session key in UI** | OK – After loading via proxy, Control UI combobox showed session key `proxy:0f6cb7bc-...` (session is passed through). |

## Assumption (not fully verifiable without gateway token)

- **Gateway respects `x-openclaw-session-key` on WebSocket**  
  The proxy injects the header on the WebSocket upgrade. Session isolation per tab can only be confirmed by using two tabs with different sessions and checking that chat history differs; that requires a working gateway connection (token). The UI already displays the session key, so the gateway/UI receives it.

## How to re-run

```bash
# Terminal 1: gateway (if not already running)
openclaw gateway

# Terminal 2: proxy
cd /path/to/clawd
GATEWAY_URL=http://127.0.0.1:18789 node openclaw-session-proxy.js

# Then:
curl -sI http://127.0.0.1:3010/new
curl -s http://127.0.0.1:3010/?session=proxy:test | head -20
```
