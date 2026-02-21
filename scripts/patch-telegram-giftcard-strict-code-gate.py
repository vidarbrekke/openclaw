#!/usr/bin/env python3
from pathlib import Path
import shutil
import time

PATH = Path("/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md")

NEW_SECTION = """## Telegram Gift Card Handling (Hard Rule - strict code gate)

For Telegram gift-card balance checks, NEVER run lookup unless a real code is present.

Valid code pattern:
- [A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}

Required behavior:
1. Extract a code from the CURRENT user message only.
2. If no valid code is found, ask exactly one short question: "Please send the full gift card code (format XXXX-XXXX-XXXX-XXXX)."
3. If a valid code is found, call exactly one sessions_spawn with agentId local-ops and this task text:
   Run this command and return only the balance line or error: node /root/openclaw-stock-home/.openclaw/workspace/repositories/mcp-motherknitter/build/cli.js giftcard_lookup --code <EXTRACTED_CODE> --site production
4. NEVER call sessions_spawn with placeholders, blanks, or literals like CODE, <CODE>, giftcard, unknown, or example values.
5. After sessions_spawn, do not call subagents, sessions_history, sessions_send, session_status, memory_search, memory_get, process, or exec.
6. The subagent completion is the only balance response. Do not send follow-up lines.

Decision rule:
- valid code present -> spawn once with extracted code
- no valid code -> ask for code, no tools
"""


def main() -> None:
    text = PATH.read_text()
    start = text.find("## Telegram Gift Card Handling")
    if start == -1:
        raise SystemExit("Telegram section missing")
    end = text.find("\n## ", start + 1)
    if end == -1:
        end = len(text)

    backup = PATH.with_name(f"AGENTS.md.bak.strict_code_{int(time.time())}")
    shutil.copy2(PATH, backup)
    updated = text[:start] + NEW_SECTION + text[end:]
    PATH.write_text(updated)
    print(f"patched {PATH}")
    print(f"backup  {backup}")


if __name__ == "__main__":
    main()
