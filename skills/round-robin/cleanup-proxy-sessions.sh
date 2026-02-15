#!/usr/bin/env bash
# Clean up stale OpenClaw sessions. Safe for non-interactive cron.
# Marks as deleted (renames .jsonl → .jsonl.deleted.TIMESTAMP), removes from sessions.json.
#
# Modes:
#   ALL=0  (default) — Only proxy sessions (agent:main:proxy:*)
#   ALL=1             — All non-critical sessions (proxy, webchat, openai, etc.)
#
# Protected sessions (never deleted): agent:main:main
#   - Heartbeat uses agent:main:main
#   - Telegram DMs use agent:main:main
#   - Cron jobs with sessionTarget:main use agent:main:main
#   - Telegram credentials live in openclaw.json, NOT in the session
#
# Agents: processes all agents/*/sessions/sessions.json (main, default_api, etc.)
# Other agents (e.g. default_api) have no heartbeat/Telegram — all their sessions are safe to clean.
#
# Two eval modes:
#   SMART=1 — Ollama evaluates whether sessions look abandoned (zero external tokens)
#   SMART=0 — (default) pure time-based staleness
#
# Cron (proxy-only, every 3h):
#   0 */3 * * * OPENCLAW_DIR=$HOME/.openclaw $HOME/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh
#
# Cron (all non-critical, every 6h):
#   0 */6 * * * OPENCLAW_DIR=$HOME/.openclaw ALL=1 STALE_MS=21600000 $HOME/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh
#
# Env:
#   STALE_MS        age threshold in ms       (default 10800000 = 3h)
#   SESSION_PREFIX  key prefix to target      (default agent:main:proxy:) — used only when ALL=0
#   PROTECTED_KEYS  comma-separated keys to never delete (default agent:main:main)
#   ALL             1 = clean all non-protected stale sessions, 0 = proxy-only
#   SMART           1 for Ollama-assisted eval (default 0)
#   OLLAMA_URL      Ollama API base            (default http://127.0.0.1:11434)
#   OLLAMA_MODEL    model for smart eval       (default local)
#   DRY_RUN         1 to preview without acting (default 0)

set -e

export OPENCLAW_DIR="${OPENCLAW_DIR:-$HOME/.openclaw}"
export SESSION_PREFIX="${SESSION_PREFIX:-agent:main:proxy:}"
export PROTECTED_KEYS="${PROTECTED_KEYS:-agent:main:main}"
export ALL="${ALL:-0}"
export STALE_MS="${STALE_MS:-10800000}"
export SMART="${SMART:-0}"
export DRY_RUN="${DRY_RUN:-0}"
export OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11434}"
export OLLAMA_MODEL="${OLLAMA_MODEL:-}"

# If OLLAMA_MODEL isn't set, pick the most recently updated Ollama model.
# Use || true so failure (Ollama down) doesn't abort the script with set -e.
if [ -z "$OLLAMA_MODEL" ]; then
  OLLAMA_MODEL="$(
    node -e '
      const http = require("http");
      const { URL } = require("url");
      const base = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
      const parsed = new URL(base);
      const req = http.request({
        hostname: parsed.hostname,
        port: parsed.port,
        path: "/api/tags",
        method: "GET",
        timeout: 5000
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString());
            const models = body.models || [];
            if (models.length === 0) process.exit(1);
            models.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
            if (!models[0].name) process.exit(1);
            console.log(models[0].name);
          } catch (_) { process.exit(1); }
        });
      });
      req.on("error", () => process.exit(1));
      req.on("timeout", () => { req.destroy(); process.exit(1); });
      req.end();
    ' 2>/dev/null
  )" || true
fi

# If still empty, fall back to time-based mode silently.
if [ -z "$OLLAMA_MODEL" ]; then
  SMART="0"
fi

exec node -e '
const fs = require("fs");
const http = require("http");
const { URL } = require("url");

const path = require("path");
const { OPENCLAW_DIR, SESSION_PREFIX, PROTECTED_KEYS, ALL, STALE_MS, SMART, DRY_RUN, OLLAMA_URL, OLLAMA_MODEL } = process.env;
const staleMs     = parseInt(STALE_MS, 10);
const smart       = SMART === "1";
const dryRun      = DRY_RUN === "1";
const cleanAll    = ALL === "1";
const now         = Date.now();

const protectedSet = new Set((PROTECTED_KEYS || "agent:main:main").split(",").map((k) => k.trim()).filter(Boolean));

// Discover all agents/*/sessions/sessions.json
const agentsDir = path.join(OPENCLAW_DIR || path.join(process.env.HOME, ".openclaw"), "agents");
const sessionFiles = [];
try {
  const agents = fs.readdirSync(agentsDir, { withFileTypes: true });
  for (const a of agents) {
    if (!a.isDirectory()) continue;
    const p = path.join(agentsDir, a.name, "sessions", "sessions.json");
    if (fs.existsSync(p)) sessionFiles.push(p);
  }
} catch (_) {}
if (sessionFiles.length === 0) process.exit(0);

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtAge(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? h + "h" + m + "m" : m + "m";
}

function collectCandidates(data) {
  const list = [];
  for (const key of Object.keys(data)) {
    if (protectedSet.has(key)) continue;
    if (!cleanAll && !key.startsWith(SESSION_PREFIX)) continue;
    const entry = data[key];
    const updatedAt = entry?.updatedAt;
    if (updatedAt == null || (now - updatedAt) < staleMs) continue;
    list.push({ key, entry, ageMs: now - updatedAt });
  }
  return list;
}

function readLastMessages(filePath, n) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return "(no transcript)";
    const lines = fs.readFileSync(filePath, "utf8").trim().split("\n");
    const msgs = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        const msg = obj.message || obj;
        if (msg.role !== "user") continue;
        const c = msg.content;
        let text = "";
        if (Array.isArray(c)) {
          for (const part of c) { if (part.type === "text" && part.text) { text = part.text; break; } }
        } else if (typeof c === "string") {
          text = c;
        }
        if (text) msgs.push(text.replace(/\[.*?\]/g, "").trim().slice(0, 200));
      } catch (_) {}
    }
    const last = msgs.slice(-n);
    return last.length > 0 ? last.join(" | ").slice(0, 500) : "(empty)";
  } catch (_) { return "(unreadable)"; }
}

// ── Ollama smart evaluation (single batch call, zero external tokens) ───────
async function smartEval(candidates) {
  const summaries = candidates.map((c, i) =>
    (i + 1) + ". key=" + c.key + " age=" + fmtAge(c.ageMs) +
    " messages=\"" + readLastMessages(c.entry?.sessionFile, 10) + "\""
  ).join("\n");

  const scopeNote = cleanAll ? "disposable sessions (proxy, webchat, etc.)" : "proxy sessions";
  const prompt =
    "You are a session cleanup evaluator. Decide which " + scopeNote + " to DELETE (abandoned/stale) or KEEP (active/important).\n\n" +
    "Sessions:\n" + summaries + "\n\n" +
    "Rules:\n" +
    "- Sessions >6h with no meaningful content: DELETE\n" +
    "- Sessions with only greetings/test messages: DELETE\n" +
    "- Sessions with ongoing work discussion: KEEP (even if old)\n" +
    "- When in doubt: DELETE\n\n" +
    "Respond with ONLY a JSON array: [{\"index\":1,\"action\":\"delete\"},{\"index\":2,\"action\":\"keep\"}]";

  return new Promise((resolve) => {
    const parsed = new URL(OLLAMA_URL);
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0 }
    });
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: "/api/generate",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      timeout: 60000
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try {
          const resp = JSON.parse(Buffer.concat(chunks).toString()).response || "";
          const m = resp.match(/\[[\s\S]*\]/);
          let decisions = null;
          // Strategy 1: parse as valid JSON array of objects
          if (m) { try { decisions = JSON.parse(m[0]); } catch (_) {} }
          // Strategy 2: extract {index:N, action:"..."} objects
          if (!decisions) {
            const objMatches = resp.match(/\{[^}]+\}/g);
            if (objMatches) {
              decisions = [];
              for (const om of objMatches) {
                try {
                  const obj = JSON.parse(om);
                  if (obj.index && obj.action) decisions.push(obj);
                } catch (_) {
                  const fixed = om.replace(/\u0027/g, "\"").replace(/(\w+)\s*:/g, "\"$1\":");
                  try { const obj = JSON.parse(fixed); if (obj.index && obj.action) decisions.push(obj); } catch (_) {}
                }
              }
              if (decisions.length === 0) decisions = null;
            }
          }
          // Strategy 3: parse "index":N,"action":"..." pairs from flat broken array
          if (!decisions) {
            const pairRe = /"?index"?\s*:\s*(\d+)\s*,\s*"?action"?\s*:\s*"(delete|keep)"/gi;
            let pm; decisions = [];
            while ((pm = pairRe.exec(resp)) !== null) {
              decisions.push({ index: parseInt(pm[1], 10), action: pm[2].toLowerCase() });
            }
            if (decisions.length === 0) decisions = null;
          }
          if (!decisions && dryRun) {
            console.log("[smart] Could not parse Ollama response:", resp.slice(0, 300));
          }
          resolve(decisions);
        } catch (e) {
          if (dryRun) console.log("[smart] HTTP parse error:", e.message);
          resolve(null);
        }
      });
    });
    req.on("error", (e) => { if (dryRun) console.log("[smart] HTTP error:", e.message); resolve(null); });
    req.on("timeout", () => { if (dryRun) console.log("[smart] Timeout (60s)"); req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ── Delete a single session ─────────────────────────────────────────────────
function deleteSession(key, entry, data) {
  const sf = entry?.sessionFile;
  if (sf && typeof sf === "string") {
    try {
      if (fs.existsSync(sf) && !sf.includes(".deleted.")) {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        if (!dryRun) fs.renameSync(sf, sf + ".deleted." + ts);
      }
    } catch (_) {}
  }
  if (!dryRun) delete data[key];
}

// ── Main ────────────────────────────────────────────────────────────────────
async function processFile(SESSIONS_JSON) {
  let data;
  try { data = JSON.parse(fs.readFileSync(SESSIONS_JSON, "utf8")); }
  catch (_) { return { deleted: 0, kept: 0 }; }

  const candidates = collectCandidates(data);
  if (candidates.length === 0) return { deleted: 0, kept: 0 };

  let toDelete = [];
  let kept = 0;

  if (smart) {
    const decisions = await smartEval(candidates);
    if (decisions && Array.isArray(decisions) && decisions.length > 0) {
      const keepSet = new Set();
      for (const d of decisions) {
        const idx = (d.index || 0) - 1;
        if (idx < 0 || idx >= candidates.length) continue;
        if (d.action === "keep") keepSet.add(idx);
      }
      for (let i = 0; i < candidates.length; i++) {
        if (keepSet.has(i)) {
          kept++;
          if (dryRun) console.log("[dry-run] KEEP  " + candidates[i].key + " (age: " + fmtAge(candidates[i].ageMs) + ")");
        } else {
          toDelete.push(candidates[i]);
          if (dryRun) console.log("[dry-run] DELETE " + candidates[i].key + " (age: " + fmtAge(candidates[i].ageMs) + ")");
        }
      }
    } else {
      toDelete = candidates;
      if (dryRun) {
        console.log("[dry-run] Ollama unavailable — falling back to time-based");
        for (const c of toDelete) console.log("[dry-run] DELETE " + c.key + " (age: " + fmtAge(c.ageMs) + ")");
      }
    }
  } else {
    toDelete = candidates;
    if (dryRun) {
      for (const c of toDelete) console.log("[dry-run] DELETE " + c.key + " (age: " + fmtAge(c.ageMs) + ")");
    }
  }

  for (const c of toDelete) deleteSession(c.key, c.entry, data);

  if (!dryRun && toDelete.length > 0) {
    fs.writeFileSync(SESSIONS_JSON, JSON.stringify(data, null, 2), "utf8");
  }

  return { deleted: toDelete.length, kept };
}

async function main() {
  let totalDeleted = 0;
  let totalKept = 0;

  for (const SESSIONS_JSON of sessionFiles) {
    const { deleted, kept } = await processFile(SESSIONS_JSON);
    totalDeleted += deleted;
    totalKept += kept;
  }

  const mode = smart ? "smart (ollama)" : "time-based";
  if (totalDeleted > 0 || totalKept > 0) {
    console.log("cleanup-proxy-sessions [" + mode + "]: deleted " + totalDeleted + ", kept " + totalKept);
  }
}

main().catch((e) => { console.error("cleanup error:", e.message); process.exit(1); });
'
