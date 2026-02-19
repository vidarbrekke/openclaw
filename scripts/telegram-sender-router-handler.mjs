/**
 * Telegram Sender Router Hook (hardened)
 * Routes by sender ID with strict parsing and fail-safe defaults:
 * - Vidar (5309173712) -> telegram-vidar-proxy (spawn to main workspace)
 * - Everyone else -> telegram-isolated
 */

import fs from "node:fs";

const VIDAR_TELEGRAM_ID = "5309173712";
const LOG_PATH = "/root/.openclaw/logs/telegram-sender-router.log";
const SEEN_IDS_PATH = "/root/.openclaw/var/ops-state/telegram-router-seen-ids.json";
const DEDUPE_WINDOW_SECONDS = 6 * 60 * 60;

function appendLog(line) {
  try {
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch (_) {}
}

function loadSeenMessageIds() {
  try {
    const raw = fs.readFileSync(SEEN_IDS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch (_) {}
  return {};
}

function saveSeenMessageIds(seen) {
  try {
    const parent = SEEN_IDS_PATH.split("/").slice(0, -1).join("/");
    fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(SEEN_IDS_PATH, JSON.stringify(seen), "utf8");
  } catch (_) {}
}

function pruneSeenIds(seen, nowSeconds) {
  for (const [key, ts] of Object.entries(seen)) {
    if (typeof ts !== "number" || nowSeconds - ts > DEDUPE_WINDOW_SECONDS) {
      delete seen[key];
    }
  }
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
  const nowSeconds = Math.floor(Date.now() / 1000);
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

  let agentId = senderId === VIDAR_TELEGRAM_ID ? "telegram-vidar-proxy" : "telegram-isolated";
  let reason = "normal_route";
  let dedupeState = "n/a";
  let duplicateMessage = false;

  // Hard gate: proxy routing requires a message id, otherwise idempotency cannot be guaranteed.
  if (agentId === "telegram-vidar-proxy" && !messageId) {
    agentId = "telegram-isolated";
    reason = "missing_message_id_for_proxy";
  }

  if (messageId) {
    const seen = loadSeenMessageIds();
    pruneSeenIds(seen, nowSeconds);
    const dedupeKey = `${senderId}:${messageId}`;
    duplicateMessage = Boolean(seen[dedupeKey]);
    seen[dedupeKey] = nowSeconds;
    saveSeenMessageIds(seen);
    dedupeState = duplicateMessage ? "duplicate" : "first_seen";
    if (duplicateMessage) {
      reason = "duplicate_message_id";
    }
  } else {
    dedupeState = "no_message_id";
  }

  const sessionKey = messageId
    ? `agent:${agentId}:telegram:${senderId}:msg:${messageId}`
    : `agent:${agentId}:telegram:${senderId}`;
  logger.info(`telegram-sender-router: routing sender ${senderId} -> ${agentId}`);
  appendLog(
    `[${new Date().toISOString()}] channel=telegram sender=${senderId} messageId=${messageId || "none"} action=route agentId=${agentId} sessionKey=${sessionKey} dedupe=${dedupeState} duplicate=${duplicateMessage ? "1" : "0"} reason=${reason}`
  );

  return { ok: true, agentId, sessionKey };
}

