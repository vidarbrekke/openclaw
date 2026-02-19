/**
 * Telegram Sender Router Hook (hardened)
 * Routes by sender ID with strict parsing and fail-safe defaults:
 * - Vidar (5309173712) -> telegram-vidar-proxy (spawn to main workspace)
 * - Everyone else -> telegram-isolated
 */

import fs from "node:fs";

const VIDAR_TELEGRAM_ID = "5309173712";
const LOG_PATH = "/root/.openclaw/logs/telegram-sender-router.log";

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch (_) {}
}

function normalizeSenderId(data) {
  const candidates = [
    data?.metadata?.telegramUserId,
    data?.metadata?.senderId,
    data?.metadata?.sender,
    data?.from,
    data?.sender,
  ];

  for (const value of candidates) {
    if (value === null || value === undefined) continue;
    const asString = String(value).trim();
    if (/^\d{5,20}$/.test(asString)) return asString;
  }
  return null;
}

export default async function handler(context) {
  const { data, logger } = context;

  const channelId = data?.channelId || data?.channel;
  if (channelId !== "telegram") return { ok: true };

  const senderId = normalizeSenderId(data);
  const messageIdRaw =
    data?.metadata?.messageId ||
    data?.metadata?.telegramMessageId ||
    data?.messageId ||
    data?.id;
  const messageId = messageIdRaw ? String(messageIdRaw).trim() : null;
  if (!senderId) {
    const fallbackAgentId = "telegram-isolated";
    const fallbackSessionKey = `agent:${fallbackAgentId}:telegram:unknown`;
    logger.warn(
      "telegram-sender-router: sender id missing/invalid, using fail-safe isolated route"
    );
    appendLog(
      `[${new Date().toISOString()}] channel=telegram sender=unknown messageId=${messageId || "none"} action=route agentId=${fallbackAgentId} sessionKey=${fallbackSessionKey} reason=invalid_sender`
    );
    return {
      ok: true,
      agentId: fallbackAgentId,
      sessionKey: fallbackSessionKey,
    };
  }

  const agentId = senderId === VIDAR_TELEGRAM_ID ? "telegram-vidar-proxy" : "telegram-isolated";
  const sessionKey =
    agentId === "telegram-vidar-proxy" && messageId
      ? `agent:${agentId}:telegram:${senderId}:msg:${messageId}`
      : `agent:${agentId}:telegram:${senderId}`;
  logger.info(`telegram-sender-router: routing sender ${senderId} -> ${agentId}`);
  appendLog(
    `[${new Date().toISOString()}] channel=telegram sender=${senderId} messageId=${messageId || "none"} action=route agentId=${agentId} sessionKey=${sessionKey}`
  );

  return { ok: true, agentId, sessionKey };
}

