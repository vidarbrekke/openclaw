#!/usr/bin/env python3
"""Patch main workspace AGENTS.md: strengthen gift-card no-second-message rule."""
path = "/root/openclaw-stock-home/.openclaw/workspace/AGENTS.md"
with open(path) as f:
    content = f.read()

old = (
    "That announce is the reply. Do not send a second message or apologize."
)
new = (
    "That announce is the reply. Do not send a second message or apologize. "
    "Do not output any 'Balance: X.XX' or balance figure in your own reply—leave your "
    "assistant message empty or only 'Done.' The user must see only the auto-announce."
)

if old not in content:
    raise SystemExit("Target line not found in AGENTS.md")
if new in content:
    raise SystemExit("Patch already applied")

content = content.replace(old, new, 1)
with open(path, "w") as f:
    f.write(content)
print("Patched AGENTS.md: strengthened gift-card no-second-message rule")
