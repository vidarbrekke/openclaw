/**
 * Round-robin model selector for OpenClaw chat completion requests.
 * Models are resolved from: config file > env ROUND_ROBIN_MODELS > defaults.
 * Each model runs for TURNS_PER_MODEL consecutive turns before advancing.
 */

import fs from "fs";

/** Number of consecutive turns each model is used before rotating to the next. */
export const TURNS_PER_MODEL = 2;
import path from "path";

export const DEFAULT_MODELS = [
  "openrouter/qwen/qwen3-coder-plus",
  "openrouter/moonshotai/kimi-k2.5",
  "openrouter/google/gemini-2.5-flash",
  "openrouter/anthropic/claude-haiku-4.5",
  "openrouter/openai/gpt-5.2-codex",
];

/** Default path for editable config. Agent can write here via Skill. */
export function getRoundRobinConfigPath() {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(home, ".openclaw", "round-robin-models.json");
}

/**
 * Load models from config file. Format: {"models": ["id1", "id2", ...]}
 * @returns {string[]|null} Models array or null if file missing/invalid
 */
export function loadModelsFromFile(configPath) {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    const models = parsed?.models;
    if (Array.isArray(models) && models.length > 0) {
      return models.filter((m) => typeof m === "string").map((m) => m.trim()).filter(Boolean);
    }
  } catch (_) {}
  return null;
}

/**
 * Resolve models: config file first, then env, then defaults.
 * @returns {{ models: string[], fromFile: boolean }}
 */
export function resolveModels(env, configPath) {
  const filePath = configPath || getRoundRobinConfigPath();
  const fromFile = loadModelsFromFile(filePath);
  if (fromFile) return { models: fromFile, fromFile: true };
  const fromEnv = env && env.trim() ? env.split(",").map((m) => m.trim()).filter(Boolean) : null;
  if (fromEnv?.length) return { models: fromEnv, fromFile: false };
  return { models: [...DEFAULT_MODELS], fromFile: false };
}

/**
 * Round-robin is opt-in; only sessions where the user typed /round-robin use rotation.
 * Disable explicitly with ROUND_ROBIN_MODELS=off.
 */
export function isRoundRobinEnabled(env) {
  if (env !== undefined && env.trim().toLowerCase() === "off") return false;
  return true;
}

/**
 * @param {string|undefined} env - Comma-separated model IDs from ROUND_ROBIN_MODELS
 * @param {string|undefined} configPath - Override config path (default: ~/.openclaw/round-robin-models.json)
 * @returns {{ getModels: () => string[] }} Shared models list only; index is tracked per-session by the caller
 */
export function createRoundRobinState(env, configPath) {
  return {
    getModels: () => resolveModels(env, configPath).models,
  };
}

const PROMPT_POSTFIX = "\n\nDon't make assumptions. Always take into consideration what you already know. Don't fix code that is not broken.";

const ROUND_ROBIN_CMD = /\/round-robin\b/i;
const MODEL_CMD = /\/model\b/i;

function getMessageText(msg) {
  if (!msg) return "";
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((p) => (p?.type === "text" ? p.text : "")).join("");
  }
  return "";
}

/**
 * Inspect last user message for /round-robin and /model, update session state, optionally strip /round-robin.
 * @param {object} parsed - Parsed request body (mutated: strips /round-robin from last user message)
 * @param {() => { roundRobinEnabled: boolean }} getSession - Get session state
 * @param {(s: { roundRobinEnabled: boolean }) => void} setSession - Set session state
 * @returns {{ applyRoundRobin: boolean }}
 */
export function processRoundRobinCommands(parsed, getSession, setSession) {
  let applyRoundRobin = (getSession() ?? { roundRobinEnabled: false }).roundRobinEnabled;
  if (!Array.isArray(parsed?.messages)) return { applyRoundRobin };

  for (let i = parsed.messages.length - 1; i >= 0; i--) {
    const msg = parsed.messages[i];
    if (msg?.role !== "user") continue;
    const content = getMessageText(msg);
    if (ROUND_ROBIN_CMD.test(content)) {
      setSession({ roundRobinEnabled: true });
      applyRoundRobin = true;
      const stripped = content.replace(ROUND_ROBIN_CMD, "").replace(/\n{2,}/g, "\n").trim();
      parsed.messages[i] = { ...msg, content: stripped || " " };
    } else if (MODEL_CMD.test(content)) {
      setSession({ roundRobinEnabled: false });
      applyRoundRobin = false;
    }
    break;
  }
  return { applyRoundRobin };
}

/**
 * @param {{ index: number, getModels: () => string[] }} state - Mutable state
 * @param {Buffer|string} rawBody - Raw request body
 * @param {{ applyRoundRobin?: boolean }} opts - When false, keep request model; always apply postfix
 * @returns {{ body: Buffer, model?: string }} Transformed body and selected model (if round-robin applied)
 */
export function transformChatBody(state, rawBody, opts = {}) {
  const applyRoundRobin = opts.applyRoundRobin !== false;
  const models = state.getModels?.() ?? state.models ?? [];
  if (!models.length) return { body: Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "") };
  let parsed;
  try {
    parsed = JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody);
  } catch {
    return { body: Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "") };
  }
  if (!parsed || typeof parsed !== "object") return { body: Buffer.from(JSON.stringify(parsed)) };

  let model;
  if (applyRoundRobin) {
    const idx = state.index ?? 0;
    const turnsUsed = state.turnsUsed ?? 0;
    model = models[idx % models.length];
    if (turnsUsed >= TURNS_PER_MODEL - 1) {
      state.index = (idx + 1) % models.length;
      state.turnsUsed = 0;
    } else {
      state.turnsUsed = (turnsUsed + 1) | 0;
    }
  } else {
    model = parsed.model;
  }

  // Append postfix to last user message
  if (Array.isArray(parsed.messages)) {
    for (let i = parsed.messages.length - 1; i >= 0; i--) {
      const msg = parsed.messages[i];
      if (msg?.role === "user" && typeof msg.content === "string") {
        parsed.messages[i] = { ...msg, content: msg.content + PROMPT_POSTFIX };
        break;
      }
    }
  }

  const out = { ...parsed, model };
  return { body: Buffer.from(JSON.stringify(out)), model };
}

