# Memory: SQLite + sqlite-vec (default vector stack)

OpenClaw’s default vector memory stack is **SQLite + sqlite-vec** (no PostgreSQL). This doc records how we keep it that way and how to disable PostgreSQL if you tried pgvector.

## Default stack

- **Store:** SQLite at `~/.openclaw/memory/.sqlite` (per-agent; configurable via `agents.defaults.memorySearch.store.path`).
- **Vector acceleration:** When the sqlite-vec extension is available, OpenClaw uses it for vector search (`memorySearch.store.vector.enabled`, default `true`).
- **Embeddings:** Configured under `agents.defaults.memorySearch` (e.g. `provider: "openai"` with Ollama remote, or `provider: "local"` on Linode).

No PostgreSQL or pgvector is required. If you installed Postgres for pgvector and it’s not compatible, you can disable Postgres and rely on this stack.

## Disabling PostgreSQL so it doesn’t start automatically

### On the Linode (Ubuntu/systemd)

PostgreSQL was stopped and disabled so it no longer starts on boot:

```bash
# Already done on the clawd Linode:
sudo systemctl stop postgresql@16-main.service postgresql.service
sudo systemctl disable postgresql@16-main.service postgresql.service
sudo systemctl mask postgresql@16-main.service postgresql.service
```

- **Stop:** services are stopped.
- **Disable:** they won’t start on boot.
- **Mask:** prevents them from being started by other units or by hand (unless unmasked).

To **re-enable** PostgreSQL later:

```bash
sudo systemctl unmask postgresql.service postgresql@16-main.service
sudo systemctl enable postgresql@16-main.service
sudo systemctl start postgresql@16-main.service
```

### On macOS (Homebrew)

If PostgreSQL is managed by Homebrew:

```bash
brew services stop postgresql@16   # or postgresql, depending on version
brew services list                 # confirm "none" for postgres
```

To prevent auto-start after reboot, leave the service stopped (don’t run `brew services start`).

## Ensuring SQLite + sqlite-vec is active

- **Do not** set `memory.backend` to a Postgres-backed value. Omit it (or use the default) so the built-in SQLite indexer is used.
- **Do not** set `memorySearch.store` to a Postgres URL or driver. Omit custom store so the default SQLite path is used.
- Optionally set explicitly:
  - `agents.defaults.memorySearch.store.vector.enabled: true`  
  so vector acceleration (sqlite-vec) is clearly on when the extension is available.

Both the **Mac** and **Linode** OpenClaw configs use the default SQLite store and have `memorySearch.store.vector.enabled: true` set.

## References

- OpenClaw memory concepts: https://docs.openclaw.ai/concepts/memory  
- SQLite vector acceleration (sqlite-vec): same page, section “SQLite vector acceleration (sqlite-vec)”.
