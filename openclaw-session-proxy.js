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
import { URL, pathToFileURL } from "url";
import crypto from "crypto";
import { Transform } from "stream";

// Dynamic import: try multiple locations for the round-robin module.
// Order: local dev (skills/round-robin/) → repo root (compat) → global install (~/.openclaw/modules/)
let rr = null;
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const home = process.env.HOME || process.env.USERPROFILE || "";
const rrPaths = [
  path.join(__dirname, "skills", "round-robin", "model-round-robin.js"),
  path.join(__dirname, "model-round-robin.js"),
  path.join(home, ".openclaw", "modules", "model-round-robin.js"),
];
for (const p of rrPaths) {
  try {
    if (fs.existsSync(p)) {
      rr = await import(pathToFileURL(p).href);
      break;
    }
  } catch (_) {}
}
const { createRoundRobinState, transformChatBody, processRoundRobinCommands, isRoundRobinEnabled, TURNS_PER_MODEL = 2 } = rr || {};

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:18789";
const PROXY_PORT = Number(process.env.PROXY_PORT || 3010);
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

const roundRobinModels = process.env.ROUND_ROBIN_MODELS;
const roundRobinAvailable = !!(rr && createRoundRobinState);
const roundRobinState = roundRobinAvailable ? createRoundRobinState(roundRobinModels) : null;

// Per-session: roundRobinEnabled + index (default true when feature is on)
function getSessionRoundRobin(sk) {
  return getRotationState(sk);
}
function setSessionRoundRobin(sk, s) {
  SESSION_ROTATION_STATE.set(sk, s);
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || "/";
  
  // Debug: round-robin status
  if (reqUrl === "/round-robin/status") {
    const models = roundRobinState?.getModels?.() ?? [];
    const sessions = {};
    for (const [key, value] of SESSION_ROTATION_STATE.entries()) {
      sessions[key] = {
        roundRobinEnabled: value.roundRobinEnabled !== false,
        index: value.index ?? 0,
        lastAppliedModel: value.lastAppliedModel ?? null,
      };
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify(
        {
          enabled: isRoundRobinEnabled(roundRobinModels),
          models,
          sessions,
        },
        null,
        2
      )
    );
    return;
  }
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

  const useRoundRobin = roundRobinAvailable && isRoundRobinEnabled(roundRobinModels) && isChatCompletions(req.method, targetPath);
  if (useRoundRobin) {
    delete proxyHeaders["content-length"];
    delete proxyHeaders["transfer-encoding"];
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

  if (useRoundRobin) {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      let parsed;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        parsed = {};
      }
      const sk = sessionKey || "default";
      const getSession = () => getSessionRoundRobin(sk);
      const setSession = (s) => setSessionRoundRobin(sk, s);
      const { applyRoundRobin } = processRoundRobinCommands(parsed, getSession, setSession);
      const modifiedBody = Buffer.from(JSON.stringify(parsed));
      // Per-session rotation index and turns-used (each model runs TURNS_PER_MODEL turns before advancing)
      const sessionState = getSession();
      const perSessionState = {
        index: sessionState.index ?? 0,
        turnsUsed: sessionState.turnsUsed ?? 0,
        getModels: roundRobinState.getModels,
      };
      const { body, model } = transformChatBody(perSessionState, modifiedBody, { applyRoundRobin });
      setSession({ ...sessionState, index: perSessionState.index, turnsUsed: perSessionState.turnsUsed });
      proxyReq.setHeader("Content-Length", body.length);
      proxyReq.write(body);
      proxyReq.end();
      if (applyRoundRobin && model) console.log(`[proxy] round-robin [${sk}] -> ${model}`);
      else if (!applyRoundRobin) console.log(`[proxy] bypass (explicit model)`);
    });
  } else {
    req.pipe(proxyReq);
  }
});

// --- Round-robin via sessions.json model override ---
// The gateway reads modelOverride/providerOverride from sessions.json on every run.
// We write the next round-robin model there before forwarding the chat.send frame.
// This works for WebSocket chat (Control UI), cron jobs, hooks — anything using that session.
const SESSIONS_JSON_PATH = path.join(home, ".openclaw", "agents", "main", "sessions", "sessions.json");
const SESSION_ROTATION_STATE = new Map();
const SESSION_UPDATED_AT = new Map();
let sessionsWriteInFlight = false;

function getRotationState(sk) {
  const existing = SESSION_ROTATION_STATE.get(sk) ?? { roundRobinEnabled: true };
  if (!SESSION_ROTATION_STATE.has(sk)) SESSION_ROTATION_STATE.set(sk, existing);
  return existing;
}

function applyRoundRobinModelOverrideToStore(store, sessionKey) {
  if (!roundRobinAvailable || !roundRobinState?.getModels) return null;
  if (!isRoundRobinEnabled(roundRobinModels)) return null;

  const sk = sessionKey || "default";
  const session = getRotationState(sk);
  if (!session.roundRobinEnabled) return null;

  const models = roundRobinState.getModels();
  if (!models.length) return null;

  const idx = session.index ?? 0;
  const turnsUsed = session.turnsUsed ?? 0;
  const fullModel = models[idx % models.length];
  const advance = turnsUsed >= (TURNS_PER_MODEL - 1);
  SESSION_ROTATION_STATE.set(sk, {
    ...session,
    index: advance ? (idx + 1) % models.length : idx,
    turnsUsed: advance ? 0 : turnsUsed + 1,
    lastAppliedModel: fullModel,
  });

  // Parse "provider/org/model" → provider="provider", model="org/model"
  // e.g. "openrouter/google/gemini-2.5-flash" → provider="openrouter", model="google/gemini-2.5-flash"
  const slashIdx = fullModel.indexOf("/");
  const provider = slashIdx > 0 ? fullModel.slice(0, slashIdx) : undefined;
  const model = slashIdx > 0 ? fullModel.slice(slashIdx + 1) : fullModel;

  // Update store entry in-memory (caller handles write)
  const storeKey = Object.keys(store).find((k) => k === sessionKey || k.endsWith(`:${sessionKey}`)) || sessionKey;
  if (!store[storeKey]) {
    store[storeKey] = { sessionId: crypto.randomUUID(), updatedAt: Date.now() };
  }
  store[storeKey].modelOverride = model;
  if (provider) store[storeKey].providerOverride = provider;
  store[storeKey].updatedAt = Date.now();
  console.log(`[proxy] round-robin [${sk}] -> ${fullModel} (via sessions.json)`);
  return fullModel;
}

// --- WebSocket frame helpers ---
// WebSocket frames from the Control UI are JSON-RPC: {"type":"req","id":"...","method":"chat.send","params":{...}}
// We intercept text frames to detect chat.send and apply model override before forwarding.
function consumeWsTextFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 2) {
    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const fin = (byte0 & 0x80) !== 0;
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let headerLen = 2;
    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    } else if (payloadLen === 127) {
      if (buffer.length - offset < 10) break;
      payloadLen = Number(buffer.readBigUInt64BE(offset + 2));
      headerLen = 10;
    }
    const maskLen = masked ? 4 : 0;
    const frameLen = headerLen + maskLen + payloadLen;
    if (buffer.length - offset < frameLen) break;

    const maskOffset = offset + headerLen;
    const payloadOffset = maskOffset + maskLen;
    const payload = Buffer.from(buffer.slice(payloadOffset, payloadOffset + payloadLen));
    if (masked) {
      const maskKey = buffer.slice(maskOffset, maskOffset + 4);
      for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
    }

    // Only parse complete text frames (FIN + opcode 1)
    if (fin && opcode === 1) {
      try {
        const parsed = JSON.parse(payload.toString("utf8"));
        frames.push(parsed);
      } catch {
        // ignore non-JSON payloads
      }
    }
    offset += frameLen;
  }
  return { frames, remainder: buffer.slice(offset) };
}

function shouldRotateForEntry(sessionKey, entry) {
  const sk = sessionKey || "default";
  const state = getRotationState(sk);
  if (!state.roundRobinEnabled) return false;
  const lastApplied = state.lastAppliedModel;
  const currentOverride = entry?.modelOverride;
  // If user pinned a model, don't override it.
  if (currentOverride && currentOverride !== lastApplied) return false;
  return true;
}

function updateRotationFromStore() {
  if (!fs.existsSync(SESSIONS_JSON_PATH)) return;
  if (sessionsWriteInFlight) return;
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(SESSIONS_JSON_PATH, "utf8"));
  } catch {
    return;
  }
  let changed = false;
  for (const [key, entry] of Object.entries(store)) {
    const updatedAt = typeof entry?.updatedAt === "number" ? entry.updatedAt : 0;
    const lastSeen = SESSION_UPDATED_AT.get(key) ?? 0;
    if (updatedAt <= lastSeen) continue;
    SESSION_UPDATED_AT.set(key, updatedAt);
    if (!shouldRotateForEntry(key, entry)) continue;
    const applied = applyRoundRobinModelOverrideToStore(store, key);
    if (applied) changed = true;
  }
  if (!changed) return;
  try {
    sessionsWriteInFlight = true;
    fs.writeFileSync(SESSIONS_JSON_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error(`[proxy] round-robin sessions.json write failed:`, err.message);
  } finally {
    sessionsWriteInFlight = false;
  }
}

function rotateSessionOverride(sessionKey) {
  if (!fs.existsSync(SESSIONS_JSON_PATH)) return;
  if (sessionsWriteInFlight) return;
  let store = {};
  try {
    store = JSON.parse(fs.readFileSync(SESSIONS_JSON_PATH, "utf8"));
  } catch {
    return;
  }
  const entry = store[sessionKey];
  if (!shouldRotateForEntry(sessionKey, entry)) return;
  const applied = applyRoundRobinModelOverrideToStore(store, sessionKey);
  if (!applied) return;
  try {
    sessionsWriteInFlight = true;
    fs.writeFileSync(SESSIONS_JSON_PATH, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error(`[proxy] round-robin sessions.json write failed:`, err.message);
  } finally {
    sessionsWriteInFlight = false;
  }
}

function startSessionsWatcher() {
  try {
    fs.watch(SESSIONS_JSON_PATH, { persistent: true }, () => {
      // Debounce: multiple events can fire; one sync read is fine.
      updateRotationFromStore();
    });
  } catch (err) {
    console.error(`[proxy] sessions.json watch failed:`, err.message);
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
    
    // Inspect client→gateway frames without modifying the stream.
  if (roundRobinAvailable && isRoundRobinEnabled(roundRobinModels)) {
      let wsBuffer = Buffer.alloc(0);
      const inspectStream = new Transform({
        transform(chunk, _enc, cb) {
          wsBuffer = Buffer.concat([wsBuffer, chunk]);
          const { frames, remainder } = consumeWsTextFrames(wsBuffer);
          wsBuffer = remainder;
          for (const parsed of frames) {
            if (parsed?.type === "req" && parsed?.method === "chat.send" && parsed?.params?.sessionKey) {
              const sk = parsed.params.sessionKey;
              const msgText = (parsed.params.message || "").trim();
              const session = getRotationState(sk);
              if (/\/model\b/i.test(msgText)) {
                SESSION_ROTATION_STATE.set(sk, { ...session, roundRobinEnabled: false });
                console.log(`[proxy] round-robin disabled for ${sk} (/model command)`);
              } else if (/\/round-robin\b/i.test(msgText)) {
                SESSION_ROTATION_STATE.set(sk, { ...session, roundRobinEnabled: true });
                console.log(`[proxy] round-robin re-enabled for ${sk}`);
              }
              // Rotate immediately for chat turns
              rotateSessionOverride(sk);
            }
          }
          cb(null, chunk);
        },
      });
      socket.pipe(inspectStream).pipe(proxySocket);
      proxySocket.pipe(socket);
    } else {
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    }
    
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
  if (roundRobinAvailable && roundRobinState?.getModels) {
    const models = roundRobinState.getModels();
    if (models?.length) console.log(`  Round-robin: ${models.length} models (active)`);
  } else {
    console.log(`  Round-robin: not installed (install with skills/round-robin/install.sh)`);
  }
  console.log(``);
  console.log(`Open http://127.0.0.1:${PROXY_PORT}/new to start a new session`);
  console.log(`Each tab with /new gets an isolated chat session; settings are global.`);
  startSessionsWatcher();
});
