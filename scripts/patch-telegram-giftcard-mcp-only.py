#!/usr/bin/env python3
"""
Patch main workspace AGENTS.md on the server: switch Telegram gift-card to MCP-only.

Run on the Linode: python3 patch-telegram-giftcard-mcp-only.py

Replaces the "Telegram Gift Card Handling" section (sessions_spawn path) with
MCP-only instructions so the user gets a single reply (no subagent auto-announce
+ model second message).
"""
import re
import sys

PATH = "/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md"

NEW_SECTION = """## Telegram Gift Card Handling (Hard Rule — MCP only)

When the user sends a gift-card code (e.g. after /new) on Telegram:

1. If no code was provided, ask for it once.
2. To get the balance, use **only** mcporter (do **not** use sessions_spawn for this):
   - Run: `mcporter call motherknitter.giftcard_lookup code=CODE site:production` (replace CODE with the user's code). Use exec to run this.
   - Get the result and reply **once** with the balance.
3. Do **not** use sessions_spawn for gift-card balance — that path causes duplicate replies (auto-announce plus a second message). One path only: mcporter, one reply.
"""


def main():
    try:
        with open(PATH) as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Not found: {PATH} (run this script on the Linode)", file=sys.stderr)
        sys.exit(1)

    # Match from "##/### Telegram Gift Card" (any variant) to the next heading.
    pattern = re.compile(
        r"(\n#{2,3}\s+Telegram\s+Gift\s+Card[^\n]*\n.*?)(?=\n#{2,6}\s|\Z)",
        re.DOTALL,
    )
    match = pattern.search(content)
    if not match:
        print("Telegram Gift Card section not found in AGENTS.md", file=sys.stderr)
        sys.exit(1)

    new_content = content[: match.start(1)] + "\n" + NEW_SECTION.strip() + "\n" + content[match.end(1) :]
    if new_content == content:
        print("No change (section already replaced?)", file=sys.stderr)
        sys.exit(0)

    with open(PATH, "w") as f:
        f.write(new_content)
    print("Patched AGENTS.md: Telegram gift-card is now MCP-only (mcporter), one reply.")


if __name__ == "__main__":
    main()
