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
const home = process.env.HOME || process.env.USERPROFILE || "";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:18789";
const PROXY_PORT = Number(process.env.PROXY_PORT || 3010);
const TOOL_GATE_ENABLED = process.env.TOOL_GATE_ENABLED !== "0";
const TOOL_GATE_MAX_RETRIES = Math.max(0, Number(process.env.TOOL_GATE_MAX_RETRIES || 1));
const TOOL_GATE_ESCALATE_MODEL = process.env.TOOL_GATE_ESCALATE_MODEL || "";
// Use gateway canonical format (agent:main:proxy:uuid) so chat "final" events match Control UI sessionKey
const SESSION_PREFIX = process.env.SESSION_PREFIX || "agent:main:proxy:";

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

// Fail fast if legacy round-robin artifacts remain (retired in favor of router model).
function checkNoLegacyRoundRobin() {
  if (!home) return;
  const openclawDir = path.join(home, ".openclaw");
  const legacy = [
    { path: path.join(openclawDir, "skills", "round-robin"), kind: "dir" },
    { path: path.join(openclawDir, "modules", "model-round-robin.js"), kind: "file" },
    { path: path.join(openclawDir, "round-robin-models.json"), kind: "file" },
  ];
  const found = [];
  for (const { path: legacyPath, kind } of legacy) {
    try {
      if (kind === "dir" && fs.existsSync(legacyPath) && fs.statSync(legacyPath).isDirectory()) found.push(legacyPath);
      else if (kind === "file" && fs.existsSync(legacyPath) && fs.statSync(legacyPath).isFile()) found.push(legacyPath);
    } catch (_) {}
  }
  if (found.length === 0) return;
  console.error(`[proxy] Legacy round-robin artifacts found (round-robin has been retired in favor of the router model).`);
  console.error(`[proxy] Remove these and restart the proxy:`);
  found.forEach((p) => console.error(`  - ${p}`));
  console.error(`[proxy] Example: rm -rf ~/.openclaw/skills/round-robin ~/.openclaw/modules/model-round-robin.js ~/.openclaw/round-robin-models.json`);
  process.exit(1);
}
checkNoLegacyRoundRobin();

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
  if (method === "POST" && path.includes("/v1/chat/completions")) return true;
  if (method === "POST" && path.includes("/chat")) return true;
  return false;
}

function isChatCompletions(method, path) {
  return method === "POST" && path.includes("/v1/chat/completions");
}

function isToolRequiredRequest(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!Array.isArray(payload.tools) || payload.tools.length === 0) return false;
  if (payload.tool_choice === "none") return false;
  return true;
}

function hasValidToolCall(responseJson) {
  const msg = responseJson?.choices?.[0]?.message;
  return Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
}

function buildToolRetryPrompt(payload) {
  const toolSchemas = Array.isArray(payload?.tools) ? payload.tools : [];
  return [
    "Invalid previous output: tool call required but missing.",
    "You MUST output ONLY a valid tool call object that matches one of the provided tool schemas.",
    "Do not output prose. Do not describe the command. Emit only the tool call.",
    `Available tools schema: ${JSON.stringify(toolSchemas)}`,
  ].join("\n");
}

function performGatewayJsonRequest(proxyOptions, payloadObj) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(JSON.stringify(payloadObj));
    const options = {
      ...proxyOptions,
      headers: {
        ...proxyOptions.headers,
        "content-type": "application/json",
        "content-length": String(body.length),
      },
    };
    const req2 = gatewayProtocol.request(options, (res2) => {
      const chunks = [];
      res2.on("data", (c) => chunks.push(c));
      res2.on("end", () => {
        const raw = Buffer.concat(chunks);
        let json = null;
        try {
          json = JSON.parse(raw.toString("utf8"));
        } catch {
          json = null;
        }
        resolve({ statusCode: res2.statusCode || 502, headers: res2.headers || {}, raw, json });
      });
    });
    req2.on("error", reject);
    req2.write(body);
    req2.end();
  });
}

function getMessageText(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part?.type === "text" && typeof part.text === "string") return part.text;
        return "";
      })
      .join(" ")
      .trim();
  }
  return "";
}

function getLastUserMessageText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === "user") return getMessageText(msg);
  }
  return "";
}

function isoDayFromMs(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

function classifyTaskFromMessage(text) {
  const q = (text || "").toLowerCase();
  if (!q) return "unknown";
  if (/(fix|bug|error|exception|traceback|fails|failing|broken|debug)/.test(q)) return "debug";
  if (/(refactor|cleanup|restructure|reorganize)/.test(q)) return "refactor";
  if (/(test|unit test|integration test|tdd|coverage)/.test(q)) return "testing";
  if (/(plan|design|architecture|approach|trade-?off)/.test(q)) return "planning";
  if (/(review|code review|audit)/.test(q)) return "review";
  if (/(implement|build|create|add|feature)/.test(q)) return "implementation";
  if (/(docs|document|readme|explain|write-up)/.test(q)) return "documentation";
  return "general";
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || "/";
  // Handle /new - generate session, inject token, redirect to path-based URL
  // Path /s/:sessionKey gives each tab its own cookie scope (Path=/s/xxx) so tabs don't overwrite each other
  if (reqUrl === "/new" || reqUrl === "/new/") {
    const sessionKey = generateSessionKey();
    const params = new URLSearchParams({ session: sessionKey });
    if (GATEWAY_TOKEN) params.set("token", GATEWAY_TOKEN);
    const targetPath = `/s/${encodeURIComponent(sessionKey)}/?${params.toString()}`;
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
  
  // Inject session key for all requests when we have one (chat, history, API, etc.)
  // Without this, load-history (GET /api/chat/history) gets no session and returns empty;
  // the UI clears streaming content and never refreshes, so the response disappears.
  if (sessionKey) {
    proxyHeaders["x-openclaw-session-key"] = sessionKey;
    if (shouldInjectSessionKey(req.method, targetPath)) {
      console.log(`[proxy] ${req.method} ${targetPath} -> session: ${sessionKey}`);
    }
  }

  const isChatRequest = isChatCompletions(req.method, targetPath);

  const proxyOptions = {
    hostname: gatewayUrl.hostname,
    port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
    path: targetPath,
    method: req.method,
    headers: proxyHeaders,
  };

  if (isChatRequest) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      let parsed = {};
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        parsed = {};
      }
      const requestStartedTs = Date.now();
      const sk = sessionKey || "default";
      const originalModel = typeof parsed?.model === "string" ? parsed.model : "";
      const lastUserMsg = getLastUserMessageText(parsed?.messages || []);
      const userMessagePreview = lastUserMsg.slice(0, ROUTER_MSG_PREVIEW_MAX_CHARS);
      const userMessageChars = lastUserMsg.length;
      const taskType = classifyTaskFromMessage(lastUserMsg);
      let modelSource = "passthrough";
      let selectedModel = originalModel;
      let toolGateRetryCount = 0;
      let toolGateEscalated = false;
      let toolGateEscalateModel = "";
      let toolGateHadValidToolCalls = null;

      const toolGateActive =
        TOOL_GATE_ENABLED &&
        parsed?.stream !== true &&
        isToolRequiredRequest(parsed);

      try {
        let result = await performGatewayJsonRequest(proxyOptions, parsed);
        if (toolGateActive && result.json && !hasValidToolCall(result.json)) {
          let retryPayload = {
            ...parsed,
            messages: [
              ...(Array.isArray(parsed.messages) ? parsed.messages : []),
              { role: "system", content: buildToolRetryPrompt(parsed) },
            ],
          };
          console.log(`[proxy] tool-gate retry: missing tool_calls for session ${sessionKey || "default"}`);
          for (let i = 0; i < TOOL_GATE_MAX_RETRIES; i++) {
            const retried = await performGatewayJsonRequest(proxyOptions, retryPayload);
            result = retried;
            toolGateRetryCount += 1;
            if (result.json && hasValidToolCall(result.json)) break;
          }
          if (
            TOOL_GATE_ESCALATE_MODEL &&
            result.json &&
            !hasValidToolCall(result.json) &&
            parsed.model !== TOOL_GATE_ESCALATE_MODEL
          ) {
            console.log(`[proxy] tool-gate escalate model -> ${TOOL_GATE_ESCALATE_MODEL}`);
            const escalated = { ...retryPayload, model: TOOL_GATE_ESCALATE_MODEL };
            result = await performGatewayJsonRequest(proxyOptions, escalated);
            toolGateEscalated = true;
            toolGateEscalateModel = TOOL_GATE_ESCALATE_MODEL;
            selectedModel = TOOL_GATE_ESCALATE_MODEL;
            modelSource = "tool-gate-escalation";
          }
        }
        if (toolGateActive) {
          toolGateHadValidToolCalls = !!(result.json && hasValidToolCall(result.json));
        }

        appendRouterDecisionLog({
          ts: Date.now(),
          event: "chat_completion",
          sessionKey: sk,
          method: req.method,
          path: targetPath,
          isStreaming: parsed?.stream === true,
          taskType,
          userMessagePreview,
          userMessageChars,
          toolsCount: Array.isArray(parsed?.tools) ? parsed.tools.length : 0,
          toolChoice: parsed?.tool_choice ?? null,
          originalModel,
          selectedModel: selectedModel || parsed?.model || "",
          finalModel: (toolGateEscalated ? TOOL_GATE_ESCALATE_MODEL : parsed?.model) || selectedModel || "",
          modelSource,
          routerModelSelectionApplied: false,
          toolGateActive,
          toolGateRetryCount,
          toolGateEscalated,
          toolGateEscalateModel,
          toolGateHadValidToolCalls,
          responseStatusCode: result.statusCode || 0,
          responseHasToolCalls: !!(result.json && hasValidToolCall(result.json)),
          responseTimeMs: Math.max(0, Date.now() - requestStartedTs),
        });

        const headers = { ...result.headers };
        if (!headers["content-type"]) headers["content-type"] = "application/json";
        headers["content-length"] = String(result.raw.length);
        res.writeHead(result.statusCode, headers);
        res.end(result.raw);
      } catch (err) {
        console.error(`[proxy] Error proxying ${req.method} ${targetPath}:`, err.message);
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "text/plain" });
          res.end(`Proxy error: ${err.message}`);
        }
      }
    });
    return;
  }

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

// --- Router decision observability ---
const ROUTER_DECISION_LOG_DIR = path.join(home, ".openclaw", "logs", "router-decisions");
const ROUTER_MSG_PREVIEW_MAX_CHARS = 400;

function appendRouterDecisionLog(entry) {
  const ts = typeof entry?.ts === "number" ? entry.ts : Date.now();
  const day = isoDayFromMs(ts);
  const pathForDay = path.join(ROUTER_DECISION_LOG_DIR, `router-decisions-${day}.jsonl`);
  try {
    if (!fs.existsSync(ROUTER_DECISION_LOG_DIR)) fs.mkdirSync(ROUTER_DECISION_LOG_DIR, { recursive: true });
    fs.appendFileSync(pathForDay, `${JSON.stringify(entry)}\n`, "utf8");
  } catch (err) {
    console.error(`[proxy] router decision log write failed:`, err.message);
  }
}

// Handle WebSocket upgrade for real-time features
server.on("upgrade", (req, socket, head) => {
  const reqUrl = req.url || "/";
  // Strip /s/:sessionKey from path so gateway gets / or /ws, not /s/proxy:xxx/
  let targetPath = reqUrl;
  const pathMatch = reqUrl.match(/^\/s\/([^/?#]+)(?:\/([^?#]*))?(\?.*)?$/);
  let sessionKey = null;
  if (pathMatch) {
    sessionKey = decodeURIComponent(pathMatch[1]);
    const subPath = pathMatch[2] || "";
    const query = pathMatch[3] || "";
    targetPath = "/" + subPath + query;
  }
  if (!sessionKey) {
    sessionKey = extractSessionFromUrl(reqUrl) || extractSessionFromCookie(req.headers.cookie);
  }

  const proxyHeaders = { ...req.headers };
  proxyHeaders.host = gatewayUrl.host;
  
  // Inject session key into WebSocket connection
  if (sessionKey) {
    proxyHeaders["x-openclaw-session-key"] = sessionKey;
    console.log(`[proxy] WebSocket upgrade -> session: ${sessionKey} path: ${targetPath}`);
  }

  const proxyOptions = {
    hostname: gatewayUrl.hostname,
    port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
    path: targetPath,
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
