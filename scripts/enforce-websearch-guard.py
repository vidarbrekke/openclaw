#!/usr/bin/env python3
"""
Enforce runtime guards on OpenClaw JS bundles:
  1. web_search: max 5 calls / max 2 duplicate per session window
  2. web_fetch: max 5 calls / max 2 duplicate URL per session window
  3. read: max 2 identical ENOENT reads per run

Runs as ExecStartPre on gateway start and periodically via ops-maintenance.
Sends sanitised Telegram alerts on failure (no internal paths leaked).
"""
from pathlib import Path
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone

_OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME") or os.environ.get("HOME", "/root/openclaw-stock-home")
if not _OPENCLAW_HOME.endswith("openclaw-stock-home") and _OPENCLAW_HOME == "/root":
    _OPENCLAW_HOME = "/root/openclaw-stock-home"
CONFIG_PATH = os.path.join(_OPENCLAW_HOME, ".openclaw", "openclaw.json")
LOG_PATH = os.path.join(_OPENCLAW_HOME, ".openclaw", "logs", "websearch-guard.log")

DIST_DIR = Path("/usr/lib/node_modules/openclaw/dist")
FILES = sorted(DIST_DIR.glob("*.js")) if DIST_DIR.exists() else []

WEB_PATTERN = re.compile(
    r'const params = args;\n\s*const query = readStringParam\(params, "query", \{ required: true \}\);'
)
EXEC_PATTERN = re.compile(
    r'const params = args;\n\s*const command = readStringParam\(params, "command", \{ required: true \}\);'
)
WEB_FETCH_PATTERN = re.compile(
    r'const params = args;\n\s*const url = readStringParam\(params, ["\']url["\'], \{ required: true \}\);'
)
WEB_INJECT = """const params = args;
\t\t\tconst query = readStringParam(params, "query", { required: true });
\t\t\tconst guardStore = globalThis.__openclawWebSearchGuard ?? (globalThis.__openclawWebSearchGuard = new Map);
\t\t\tconst guardSessionKey = options?.agentSessionKey || "__global__";
\t\t\tconst guardWindowMs = 600000;
\t\t\tconst now = Date.now();
\t\t\tlet guardState = guardStore.get(guardSessionKey);
\t\t\tif (!guardState || now - (guardState.lastTs || 0) > guardWindowMs) guardState = {
\t\t\t\ttotal: 0,
\t\t\t\tqueries: {},
\t\t\t\tlastTs: now
\t\t\t};
\t\t\tconst normalizedQuery = query.trim().toLowerCase();
\t\t\tguardState.total += 1;
\t\t\tguardState.queries[normalizedQuery] = (guardState.queries[normalizedQuery] || 0) + 1;
\t\t\tguardState.lastTs = now;
\t\t\tguardStore.set(guardSessionKey, guardState);
\t\t\tif (guardState.total > 5) return jsonResult({
\t\t\t\terror: "web_search_limit_exceeded",
\t\t\t\tmessage: "web_search limit reached (max 5 per session window). Stop searching and answer with available information.",
\t\t\t\tlimit: 5,
\t\t\t\ttotalCalls: guardState.total,
\t\t\t\twindowMs: guardWindowMs
\t\t\t});
\t\t\tif (guardState.queries[normalizedQuery] > 2) return jsonResult({
\t\t\t\terror: "web_search_duplicate_query_limit_exceeded",
\t\t\t\tmessage: "Duplicate web_search query limit reached (max 2 for same normalized query per session window).",
\t\t\t\tlimit: 2,
\t\t\t\tquery,
\t\t\t\tqueryCalls: guardState.queries[normalizedQuery],
\t\t\t\twindowMs: guardWindowMs
\t\t\t});"""
WEB_FETCH_INJECT = """const params = args;
\t\t\tconst url = readStringParam(params, "url", { required: true });
\t\t\tconst fetchGuardStore = globalThis.__openclawWebFetchGuard ?? (globalThis.__openclawWebFetchGuard = new Map);
\t\t\tconst fetchGuardSessionKey = options?.agentSessionKey || "__global__";
\t\t\tconst fetchGuardWindowMs = 600000;
\t\t\tconst now = Date.now();
\t\t\tlet fetchGuardState = fetchGuardStore.get(fetchGuardSessionKey);
\t\t\tif (!fetchGuardState || now - (fetchGuardState.lastTs || 0) > fetchGuardWindowMs) fetchGuardState = {
\t\t\t\ttotal: 0,
\t\t\t\turls: {},
\t\t\t\tlastTs: now
\t\t\t};
\t\t\tconst normalizedUrl = (url && typeof url === "string" ? url.trim() : "").toLowerCase();
\t\t\tfetchGuardState.total += 1;
\t\t\tfetchGuardState.urls[normalizedUrl] = (fetchGuardState.urls[normalizedUrl] || 0) + 1;
\t\t\tfetchGuardState.lastTs = now;
\t\t\tfetchGuardStore.set(fetchGuardSessionKey, fetchGuardState);
\t\t\tif (fetchGuardState.total > 5) return jsonResult({
\t\t\t\terror: "web_fetch_limit_exceeded",
\t\t\t\tmessage: "web_fetch limit reached (max 5 per session window). Use local git/read for repo comparison; avoid repeated URL fetches.",
\t\t\t\tlimit: 5,
\t\t\t\ttotalCalls: fetchGuardState.total,
\t\t\t\twindowMs: fetchGuardWindowMs
\t\t\t});
\t\t\tif (fetchGuardState.urls[normalizedUrl] > 2) return jsonResult({
\t\t\t\terror: "web_fetch_duplicate_url_limit_exceeded",
\t\t\t\tmessage: "Duplicate web_fetch URL limit reached (max 2 for same URL per session window).",
\t\t\t\tlimit: 2,
\t\t\t\turl: normalizedUrl.slice(0, 200),
\t\t\t\turlCalls: fetchGuardState.urls[normalizedUrl],
\t\t\t\twindowMs: fetchGuardWindowMs
\t\t\t});"""
EXEC_INJECT = """const params = args;
\t\t\tconst command = readStringParam(params, "command", { required: true });
\t\t\tconst commandLower = command.trim().toLowerCase();
\t\t\tconst forbiddenPatterns = [
\t\t\t\t/\\bopenclaw\\s+gateway\\s+(restart|stop)\\b/,
\t\t\t\t/\\bsystemctl\\s+--user\\s+(restart|stop)\\s+openclaw-gateway(\\.service)?\\b/,
\t\t\t\t/\\bsystemctl\\s+(restart|stop)\\s+openclaw-gateway(\\.service)?\\b/
\t\t\t];
\t\t\tif (forbiddenPatterns.some((pattern) => pattern.test(commandLower))) return jsonResult({
\t\t\t\terror: "exec_command_blocked",
\t\t\t\tmessage: "Service-control commands are blocked from chat/agent exec. Use manual operator SSH for gateway lifecycle operations.",
\t\t\t\tcode: "SERVICE_CONTROL_BLOCKED"
\t\t\t});"""

READ_OLD = """\tif (toolName === "read") {\n\t\tconst record = args && typeof args === "object" ? args : {};\n\t\tif (!(typeof record.path === "string" ? record.path : typeof record.file_path === "string" ? record.file_path : "").trim()) {\n\t\t\tconst argsPreview = typeof args === "string" ? args.slice(0, 200) : void 0;\n\t\t\tctx.log.warn(`read tool called without path: toolCallId=${toolCallId} argsType=${typeof args}${argsPreview ? ` argsPreview=${argsPreview}` : ""}`);\n\t\t}\n\t}\n"""
READ_NEW = """\tif (toolName === "read") {\n\t\tconst record = args && typeof args === "object" ? args : {};\n\t\tconst readPath = (typeof record.path === "string" ? record.path : typeof record.file_path === "string" ? record.file_path : "").trim();\n\t\tif (!readPath) {\n\t\t\tconst argsPreview = typeof args === "string" ? args.slice(0, 200) : void 0;\n\t\t\tctx.log.warn(`read tool called without path: toolCallId=${toolCallId} argsType=${typeof args}${argsPreview ? ` argsPreview=${argsPreview}` : ""}`);\n\t\t} else {\n\t\t\tconst dateMem = /\\/memory\\/\\d{4}-\\d{2}-\\d{2}\\.md$/.test(readPath);\n\t\t\tif (dateMem) {\n\t\t\t\tconst memSweepStore = globalThis.__openclawMemorySweepGuard ?? (globalThis.__openclawMemorySweepGuard = new Map);\n\t\t\t\tconst memSweepRun = ctx.params.sessionId || ctx.params.runId || "unknown";\n\t\t\t\tconst memSweepCount = (memSweepStore.get(memSweepRun) || 0) + 1;\n\t\t\t\tmemSweepStore.set(memSweepRun, memSweepCount);\n\t\t\t\tif (memSweepCount > 20) {\n\t\t\t\t\tthrow new Error(`memory_date_sweep_limit_exceeded: run=${memSweepRun} count=${memSweepCount}`);\n\t\t\t\t}\n\t\t\t}\n\t\t\tconst readGuardStore = globalThis.__openclawReadPathGuard ?? (globalThis.__openclawReadPathGuard = new Map);\n\t\t\tconst readGuardRun = ctx.params.sessionId || ctx.params.runId || "unknown";\n\t\t\tconst readGuardKey = `${readGuardRun}::${readPath}`;\n\t\t\tconst readGuardCount = (readGuardStore.get(readGuardKey) || 0) + 1;\n\t\t\treadGuardStore.set(readGuardKey, readGuardCount);\n\t\t\tif (readGuardCount > 2) {\n\t\t\t\tthrow new Error(`read_path_repeat_limit_exceeded: path=${readPath} count=${readGuardCount}`);\n\t\t\t}\n\t\t}\n\t}\n"""
LEGACY_READ_NEW = """\tif (toolName === "read") {\n\t\tconst record = args && typeof args === "object" ? args : {};\n\t\tconst readPath = (typeof record.path === "string" ? record.path : typeof record.file_path === "string" ? record.file_path : "").trim();\n\t\tif (!readPath) {\n\t\t\tconst argsPreview = typeof args === "string" ? args.slice(0, 200) : void 0;\n\t\t\tctx.log.warn(`read tool called without path: toolCallId=${toolCallId} argsType=${typeof args}${argsPreview ? ` argsPreview=${argsPreview}` : ""}`);\n\t\t} else {\n\t\t\tconst readGuardStore = globalThis.__openclawReadPathGuard ?? (globalThis.__openclawReadPathGuard = new Map);\n\t\t\tconst readGuardRun = ctx.params.sessionId || ctx.params.runId || "unknown";\n\t\t\tconst readGuardKey = `${readGuardRun}::${readPath}`;\n\t\t\tconst readGuardCount = (readGuardStore.get(readGuardKey) || 0) + 1;\n\t\t\treadGuardStore.set(readGuardKey, readGuardCount);\n\t\t\tif (readGuardCount > 2) {\n\t\t\t\tthrow new Error(`read_path_repeat_limit_exceeded: path=${readPath} count=${readGuardCount}`);\n\t\t\t}\n\t\t}\n\t}\n"""


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    line = f"[{ts}] {msg}"
    print(line)
    Path(LOG_PATH).parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def send_telegram_alert(text: str) -> None:
    """Send alert with sanitised content (no internal paths)."""
    try:
        cfg = json.loads(Path(CONFIG_PATH).read_text(encoding="utf-8"))
        tg = cfg.get("channels", {}).get("telegram", {})
        token = tg.get("botToken")
        chat_id = None
        if isinstance(tg.get("allowlist"), list) and tg["allowlist"]:
            chat_id = tg["allowlist"][0]
        if not chat_id:
            chat_id = tg.get("chatId") or tg.get("defaultChatId")
        if not token or not chat_id:
            log("ALERT_SKIPPED missing telegram token/chat_id")
            return
        sanitised = re.sub(r"/usr/lib/node_modules/openclaw/dist/[^\s]+", "<openclaw-bundle>", text)
        sanitised = re.sub(r"/root/\.openclaw/[^\s]+", "<openclaw-config>", sanitised)
        cmd = [
            "curl", "-sS", "-X", "POST",
            f"https://api.telegram.org/bot{token}/sendMessage",
            "-d", f"chat_id={chat_id}",
            "--data-urlencode", f"text={sanitised}",
            "-d", "disable_web_page_preview=true",
        ]
        subprocess.run(cmd, check=False, capture_output=True, text=True)
        log("ALERT_SENT telegram (sanitised)")
    except Exception as exc:
        log(f"ALERT_FAILED {exc}")


failures = []
patched = 0
already = 0

if not FILES:
    log("WARNING: no JS bundles found in dist directory")
    failures.append("NO_BUNDLES_FOUND")

for file_path in FILES:
    p = Path(file_path)
    s = p.read_text(encoding="utf-8", errors="ignore")
    changed = False

    if WEB_PATTERN.search(s) and "web_search_limit_exceeded" not in s:
        s2, c = WEB_PATTERN.subn(WEB_INJECT, s, count=1)
        if c == 1:
            s = s2
            changed = True
        else:
            failures.append(f"WEB_ANCHOR_MULTI: {p.name}")

    if EXEC_PATTERN.search(s) and "exec_command_blocked" not in s:
        s2, c = EXEC_PATTERN.subn(EXEC_INJECT, s, count=1)
        if c == 1:
            s = s2
            changed = True
        else:
            failures.append(f"EXEC_ANCHOR_MULTI: {p.name}")

    if WEB_FETCH_PATTERN.search(s) and "web_fetch_limit_exceeded" not in s:
        s2, c = WEB_FETCH_PATTERN.subn(WEB_FETCH_INJECT, s, count=1)
        if c == 1:
            s = s2
            changed = True
        else:
            failures.append(f"WEB_FETCH_ANCHOR_MULTI: {p.name}")

    if READ_OLD in s and "read_path_repeat_limit_exceeded" not in s:
        s = s.replace(READ_OLD, READ_NEW, 1)
        changed = True
    elif LEGACY_READ_NEW in s and "memory_date_sweep_limit_exceeded" not in s:
        s = s.replace(LEGACY_READ_NEW, READ_NEW, 1)
        changed = True

    if changed:
        p.write_text(s, encoding="utf-8")
        patched += 1
    elif "web_search_limit_exceeded" in s or "web_fetch_limit_exceeded" in s or "read_path_repeat_limit_exceeded" in s or "exec_command_blocked" in s:
        already += 1

summary = f"SUMMARY patched={patched} already={already} failures={len(failures)}"
log(summary)
for item in failures:
    log(item)

if failures:
    send_telegram_alert(
        f"[ops-guard] Runtime guard enforcement issue: "
        f"patched={patched}, already={already}, issues={len(failures)}. "
        f"Check ops-combined-report for details."
    )
    sys.exit(2)

sys.exit(0)
