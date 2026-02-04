/**
 * OpenClaw Session Proxy
 *
 * A thin proxy in front of the OpenClaw gateway that injects x-openclaw-session-key
 * into chat requests and auto-injects the gateway token so users don't have to paste it.
 *
 * Usage:
 *   GATEWAY_URL=http://127.0.0.1:18789 node openclaw-session-proxy.js
 *   Open: http://127.0.0.1:3010/new
 */

import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { URL } from "url";
import crypto from "crypto";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:18789";
const PROXY_PORT = Number(process.env.PROXY_PORT || 3010);
const SESSION_PREFIX = process.env.SESSION_PREFIX || "proxy:";

const gatewayUrl = new URL(GATEWAY_URL);
const gatewayProtocol = gatewayUrl.protocol === "https:" ? https : http;

// Read gateway token from openclaw.json so we can auto-inject it (zero manual steps)
let GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN || "";
if (!GATEWAY_TOKEN) {
  const configPath =
    process.env.OPENCLAW_CONFIG_PATH ||
    path.join(process.env.HOME || process.env.USERPROFILE || "", ".openclaw", "openclaw.json");
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const t = cfg?.gateway?.auth?.token;
    if (typeof t === "string" && t.trim()) GATEWAY_TOKEN = t.trim();
  } catch (_) {}
}

function generateSessionKey() {
  return `${SESSION_PREFIX}${crypto.randomUUID()}`;
}

function extractSessionFromUrl(reqUrl) {
  try {
    const url = new URL(reqUrl, "http://localhost");
    return url.searchParams.get("session");
  } catch {
    return null;
  }
}

function extractSessionFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/openclaw_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function shouldInjectSessionKey(method, path) {
  // Inject session key for chat-related endpoints
  if (method === "POST" && path.includes("/v1/chat/completions")) return true;
  if (method === "POST" && path.includes("/chat")) return true;
  // Add more patterns as needed
  return false;
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || "/";
  
  // Handle /new - generate session, inject token, redirect to path-based URL
  // Path /s/:sessionKey gives each tab its own cookie scope (Path=/s/xxx) so tabs don't overwrite each other
  if (reqUrl === "/new" || reqUrl === "/new/") {
    const sessionKey = generateSessionKey();
    const params = new URLSearchParams({ session: sessionKey });
    if (GATEWAY_TOKEN) params.set("token", GATEWAY_TOKEN);
    const targetPath = `/s/${encodeURIComponent(sessionKey)}?${params.toString()}`;
    const cookiePath = `/s/${encodeURIComponent(sessionKey)}`;
    res.writeHead(302, {
      Location: targetPath,
      "Set-Cookie": `openclaw_session=${encodeURIComponent(sessionKey)}; Path=${cookiePath}; SameSite=Lax`,
    });
    res.end();
    return;
  }

  // Extract session key from path /s/:sessionKey or URL param or cookie
  let sessionKey = null;
  let targetPath = reqUrl;
  const pathMatch = reqUrl.match(/^\/s\/([^/?#]+)(?:\/([^?#]*))?(\?.*)?$/);
  if (pathMatch) {
    sessionKey = decodeURIComponent(pathMatch[1]);
    const subPath = pathMatch[2] || "";
    const query = pathMatch[3] || "";
    targetPath = "/" + subPath + query; // strip /s/:sessionKey; forward / or /path to gateway
  }
  if (!sessionKey) {
    sessionKey = extractSessionFromUrl(reqUrl) || extractSessionFromCookie(req.headers.cookie);
  }
  // When using /s/:sessionKey, set cookie for that path so subrequests (assets, etc.) get it
  if (pathMatch && sessionKey) {
    const cookiePath = `/s/${encodeURIComponent(sessionKey)}`;
    res.setHeader("Set-Cookie", `openclaw_session=${encodeURIComponent(sessionKey)}; Path=${cookiePath}; SameSite=Lax`);
  }

  // Build proxy request options (targetPath may have been rewritten above)
  const proxyHeaders = { ...req.headers };
  
  // Update host header
  proxyHeaders.host = gatewayUrl.host;
  
  // Inject session key for chat requests
  if (sessionKey && shouldInjectSessionKey(req.method, targetPath)) {
    proxyHeaders["x-openclaw-session-key"] = sessionKey;
    console.log(`[proxy] ${req.method} ${targetPath} -> session: ${sessionKey}`);
  }

  const proxyOptions = {
    hostname: gatewayUrl.hostname,
    port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
    path: targetPath,
    method: req.method,
    headers: proxyHeaders,
  };

  const proxyReq = gatewayProtocol.request(proxyOptions, (proxyRes) => {
    const responseHeaders = { ...proxyRes.headers };
    const isHtml = (responseHeaders["content-type"] || "").includes("text/html");

    if (isHtml && pathMatch && sessionKey) {
      // Inject base path so SPA routing stays under /s/:sessionKey (preserves path-scoped cookie)
      const basePath = `/s/${encodeURIComponent(sessionKey)}`;
      delete responseHeaders["content-length"];
      res.writeHead(proxyRes.statusCode, responseHeaders);
      let buf = "";
      proxyRes.on("data", (chunk) => {
        buf += chunk.toString();
      });
      proxyRes.on("end", () => {
        const rewritten = buf.replace(
          /__OPENCLAW_CONTROL_UI_BASE_PATH__\s*=\s*""/g,
          `__OPENCLAW_CONTROL_UI_BASE_PATH__="${basePath}"`
        );
        res.end(rewritten);
      });
      return;
    }
    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] Error proxying ${req.method} ${targetPath}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Proxy error: ${err.message}`);
    }
  });

  req.pipe(proxyReq);
});

// Handle WebSocket upgrade for real-time features
server.on("upgrade", (req, socket, head) => {
  const reqUrl = req.url || "/";
  const sessionFromUrl = extractSessionFromUrl(reqUrl);
  const sessionFromCookie = extractSessionFromCookie(req.headers.cookie);
  const sessionKey = sessionFromUrl || sessionFromCookie;

  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = gatewayUrl.host;
  
  // Inject session key into WebSocket connection
  if (sessionKey) {
    proxyHeaders["x-openclaw-session-key"] = sessionKey;
    console.log(`[proxy] WebSocket upgrade -> session: ${sessionKey}`);
  }

  const proxyOptions = {
    hostname: gatewayUrl.hostname,
    port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
    path: reqUrl,
    method: "GET",
    headers: proxyHeaders,
  };

  const proxyReq = gatewayProtocol.request(proxyOptions);
  
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      Object.entries(proxyRes.headers)
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n") +
      "\r\n\r\n"
    );
    
    if (proxyHead.length > 0) {
      socket.write(proxyHead);
    }
    
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });

  proxyReq.on("error", (err) => {
    console.error(`[proxy] WebSocket error:`, err.message);
    socket.destroy();
  });

  proxyReq.end();
});

server.listen(PROXY_PORT, "127.0.0.1", () => {
  console.log(`OpenClaw Session Proxy`);
  console.log(`  Proxying: ${GATEWAY_URL}`);
  console.log(`  Listening: http://127.0.0.1:${PROXY_PORT}`);
  console.log(`  Gateway token: ${GATEWAY_TOKEN ? "auto-injected (from openclaw.json)" : "not found (paste in Control UI settings)"}`);
  console.log(``);
  console.log(`Open http://127.0.0.1:${PROXY_PORT}/new to start a new session`);
  console.log(`Each tab with /new gets an isolated chat session; settings are global.`);
});
