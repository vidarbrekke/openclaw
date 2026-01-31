# Session Proxy – Test Results

Tests run against a local gateway (127.0.0.1:18789) and the Session Proxy (127.0.0.1:3010).

## Verified

| Test | Result |
|------|--------|
| **Proxy starts** | OK – listens on PROXY_PORT (3010) |
| **`/new` redirect** | OK – 302, `Location: /?session=proxy:uuid`, `Set-Cookie: openclaw_session=...` |
| **Gateway reachable** | OK – GET / and GET /v1/models return 200 |
| **Proxy forwards GET /** | OK – returns real Control UI HTML (`<title>OpenClaw Control</title>`) |
| **Proxy forwards assets** | OK – GET /assets/index-*.js returns 200 |

## Assumptions (not automated)

1. **Control UI uses same origin for WebSocket**  
   If the UI uses `location.origin` or relative URLs for the WebSocket connection, traffic goes through the proxy and session key injection works.  
   If it hardcodes `ws://127.0.0.1:18789`, the proxy would not see WebSocket traffic and session isolation would not work for real-time chat.  
   **Check:** In browser DevTools → Network → WS, confirm the WebSocket target is `127.0.0.1:3010` (proxy), not `127.0.0.1:18789` (gateway).

2. **Gateway respects `x-openclaw-session-key` on WebSocket**  
   The proxy injects the header on the WebSocket upgrade request. Session isolation only works if the gateway uses that header to scope chat/session state.

3. **Cookie/URL session survives navigation**  
   Session is set via `?session=...` and cookie. As long as the user stays on the proxy origin (3010), the cookie should be sent and the session key available for injection.

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
