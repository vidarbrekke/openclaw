# Round-Robin Model Rotation

Rotates the model on every turn (GUI, cron, background). Per-session index.

**Install:** `bash skills/round-robin/install.sh`  
**Use:** Open `http://127.0.0.1:3010/new`, then type `/round-robin` in chat to enable rotation.  
**Stale sessions:** `~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh` — marks proxy-only sessions older than 3h as deleted. Add to cron: `0 */3 * * * ~/.openclaw/skills/round-robin/cleanup-proxy-sessions.sh`  
**Details:** See `SKILL.md` (agent instructions).
