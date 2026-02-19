# Patches for OpenClaw / pi-ai

These patches fix issues in the globally installed OpenClaw stack. Re-apply after any `npm install -g openclaw` or upgrade.

## pi-ai-orphan-tool-result.patch

**Problem:** When context pruning/compaction trims the transcript, the gateway can send a `tool_result` whose matching `tool_use` was in an assistant message that got dropped. The API rejects: *"Each tool_result block must have a corresponding tool_use block in the previous message."*

**Fix:** In `@mariozechner/pi-ai` `transform-messages.js`, skip pushing any `tool_result` unless the previous message in the array is an assistant that contains a `toolCall` with that id. Orphan tool_results are dropped so the request stays valid.

**Apply (macOS Homebrew global openclaw):**

```bash
cd /opt/homebrew/lib/node_modules/openclaw/node_modules/@mariozechner/pi-ai
patch -p1 < /Users/vidarbrekke/Dev/CursorApps/clawd/docs/patches/pi-ai-orphan-tool-result.patch
```

If the file was already patched, patch will say "Ignore this patch?". To re-apply from scratch, restore the original file first (reinstall the package or undo the patch), then run the command again.

**Restart the gateway** after applying so the change is loaded.
