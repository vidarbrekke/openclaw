#!/usr/bin/env node
/**
 * Standalone proxy that applies round-robin model selection to chat completions.
 * Use when connecting directly to the gateway (no session proxy).
 *
 * Usage:
 *   ROUND_ROBIN_MODELS="m1,m2,m3,m4,m5" GATEWAY_URL=http://127.0.0.1:18789 node model-round-robin-proxy.js
 *   Connect clients to this proxy (default port 3011) instead of the gateway.
 */

import http from "http";
import https from "https";
import { URL } from "url";
import { createRoundRobinState, transformChatBody, processRoundRobinCommands } from "./model-round-robin.js";

const GATEWAY_URL = process.env.GATEWAY_URL || "http://127.0.0.1:18789";
const PORT = Number(process.env.PORT || 3011);

const gatewayUrl = new URL(GATEWAY_URL);
const gatewayProtocol = gatewayUrl.protocol === "https:" ? https : http;

const roundRobinState = createRoundRobinState(process.env.ROUND_ROBIN_MODELS);

const sessionRoundRobin = new Map();
function getSessionRoundRobin(sk) {
  return sessionRoundRobin.get(sk) ?? { roundRobinEnabled: true };
}
function setSessionRoundRobin(sk, s) {
  sessionRoundRobin.set(sk, s);
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url || "/";
  const isChat = req.method === "POST" && reqUrl.includes("/v1/chat/completions");

  if (isChat) {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const rawBody = Buffer.concat(chunks);
      let parsed;
      try {
        parsed = JSON.parse(rawBody.toString("utf8"));
      } catch {
        parsed = {};
      }
      const sk = req.headers["x-openclaw-session-key"] || "default";
      const getSession = () => getSessionRoundRobin(sk);
      const setSession = (s) => setSessionRoundRobin(sk, s);
      const { applyRoundRobin } = processRoundRobinCommands(parsed, getSession, setSession);
      const modifiedBody = Buffer.from(JSON.stringify(parsed));
      const sessionState = getSession();
      const perSessionState = {
        index: sessionState.index ?? 0,
        getModels: roundRobinState.getModels,
      };
      const { body, model } = transformChatBody(perSessionState, modifiedBody, { applyRoundRobin });
      setSession({ ...sessionState, index: perSessionState.index });
      const headers = { ...req.headers };
      headers.host = gatewayUrl.host;
      headers["content-length"] = body.length;

      const proxyReq = gatewayProtocol.request(
        {
          hostname: gatewayUrl.hostname,
          port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
          path: reqUrl,
          method: req.method,
          headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on("error", (e) => {
        if (!res.headersSent) res.writeHead(502).end(`Proxy error: ${e.message}`);
      });
      proxyReq.write(body);
      proxyReq.end();
      if (applyRoundRobin && model) console.log(`[round-robin] -> ${model}`);
      else if (!applyRoundRobin) console.log(`[round-robin] bypass (explicit model)`);
    });
  } else {
    const proxyReq = gatewayProtocol.request(
      {
        hostname: gatewayUrl.hostname,
        port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
        path: reqUrl,
        method: req.method,
        headers: { ...req.headers, host: gatewayUrl.host },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (e) => {
      if (!res.headersSent) res.writeHead(502).end(`Proxy error: ${e.message}`);
    });
    req.pipe(proxyReq);
  }
});

server.on("upgrade", (req, socket, head) => {
  const proxyReq = gatewayProtocol.request({
    hostname: gatewayUrl.hostname,
    port: gatewayUrl.port || (gatewayUrl.protocol === "https:" ? 443 : 80),
    path: req.url,
    method: "GET",
    headers: { ...req.headers, host: gatewayUrl.host },
  });
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
        Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
        "\r\n\r\n"
    );
    if (proxyHead?.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    proxySocket.on("error", () => socket.destroy());
    socket.on("error", () => proxySocket.destroy());
  });
  proxyReq.on("error", (e) => socket.destroy());
  proxyReq.end();
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Model round-robin proxy`);
  console.log(`  Gateway: ${GATEWAY_URL}`);
  console.log(`  Listening: http://127.0.0.1:${PORT}`);
  const models = roundRobinState.getModels?.() ?? roundRobinState.models ?? [];
  if (models.length) console.log(`  Models: ${models.join(", ")}`);
});
