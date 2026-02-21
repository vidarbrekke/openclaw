# Memory: SQLite + sqlite-vec (default vector stack)

OpenClaw’s default vector memory stack is **SQLite + sqlite-vec** (no PostgreSQL). This doc records how we keep it that way and how to disable PostgreSQL if you tried pgvector.

## Default stack

- **Store:** SQLite at `~/.openclaw/memory/.sqlite` (per-agent; configurable via `agents.defaults.memorySearch.store.path`).
- **Vector acceleration:** When the sqlite-vec extension is available, OpenClaw uses it for vector search (`memorySearch.store.vector.enabled`, default `true`).
- **Embeddings:** Configured under `agents.defaults.memorySearch` (e.g. `provider: "openai"` for remote, or `provider: "local"` with a GGUF model path for local).

No PostgreSQL or pgvector is required.

## Linode: local EmbeddingGemma (GGUF) — default / standard setup

On the Linode we use **local embeddings only**: no remote API, no Ollama server. OpenClaw’s built-in path loads a GGUF embedding model via **node-llama-cpp** (native addon, no separate llama/CPP daemon). That is the standard default local setup.

**Model:** EmbeddingGemma 300M Q8_0 (GGUF), from Hugging Face:  
`hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`

**Config** (under `agents.defaults.memorySearch` in `openclaw.json`):

- `provider: "local"`
- `local.modelPath`: the Hugging Face short form above (OpenClaw downloads/caches the GGUF when needed)

No Ollama or other external service is required. The “CPP” is the native node-llama-cpp binding used by OpenClaw to run the GGUF; sqlite-vec stores the vectors in SQLite.

**Verify:** `HOME=/root/openclaw-stock-home openclaw memory status --deep` should show Provider: local, Model: (embeddinggemma path), Embeddings: ready, Vector: ready. A message like “prebuilt binary for platform linux x64 with Vulkan support is not compatible, falling back to using no GPU” is normal on headless servers; CPU fallback is fine for embedding. If you installed Postgres for pgvector and it’s not compatible, you can disable Postgres and rely on this stack.

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

## Why "no vector store" / FTS-only?

If `openclaw memory index` prints **Provider: none (requested: auto)** and **Skipping memory file sync in FTS-only mode (no embedding provider)**, then no **embedding provider** is active. OpenClaw only does full-text search (FTS) on memory files; no vectors are built and no semantic search.

**Auto-selection** (when `memorySearch.provider` is unset or `"auto"`): OpenClaw tries, in order, Voyage → Gemini → OpenAI → Local. It picks the first one that has a resolvable API key (or, for local, a configured and existing model file). If none are available, you get **Provider: none** → FTS-only.

**To get vector store (semantic search):**

1. **Remote provider** — Set one of `voyage` / `gemini` / `openai` under `agents.defaults.memorySearch` and ensure the matching API key is available (auth profile, `models.providers.*.apiKey`, or env e.g. `OPENAI_API_KEY`, `GEMINI_API_KEY`, `VOYAGE_API_KEY`). Restart or re-run index after changing config.
2. **Local provider** — Set `agents.defaults.memorySearch.provider` to `"local"` and configure `memorySearch.local.modelPath` to a GGUF embedding model that exists on disk (e.g. `hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf`). Local mode uses node-llama-cpp; the model file must be present. Then run `openclaw memory index --force` again.

Check what OpenClaw is using:

```bash
HOME=/root/openclaw-stock-home openclaw memory status --deep
```

That shows provider and vector/embedding availability. You can also inspect `agents.defaults.memorySearch` in `/root/openclaw-stock-home/.openclaw/openclaw.json` (provider, local.modelPath, etc.).

After setting a working provider, run `openclaw memory index --force --verbose` again; you should see a non-none Provider and no "FTS-only" skip.

## Reindexing (CLI and Linode timer)

**Canonical command** (see `openclaw memory index --help`):

- `openclaw memory index` — reindex (incremental/dirty)
- `openclaw memory index --force` — full reindex
- `openclaw memory index --verbose` — with detailed logs
- `openclaw memory index --agent <id>` — scope to one agent

**When does the index update?** The gateway watches memory files for changes (debounced), so edits made through the agent usually trigger a reindex shortly after. The index is not instant but is kept in sync while the gateway runs. A **periodic timer** (e.g. every 2 min) is still useful as a safeguard: it catches edits made while the gateway was down, external file changes (e.g. after a workspace sync), or any missed watch events.

**On the Linode**, scheduled reindex is done by a systemd timer (not managed by clawd deploy scripts). The service runs:

```bash
HOME=/root/openclaw-stock-home npx -y openclaw@latest memory index --force
```

So the timer uses the same CLI: `openclaw memory index --force`. To run reindex manually on the Linode (same as the timer does):

```bash
HOME=/root/openclaw-stock-home openclaw memory index --force --verbose
# Or via npx:
HOME=/root/openclaw-stock-home npx -y openclaw@latest memory index --force --verbose
```

**In chat:** You can ask the agent to run the memory index; it will use `openclaw memory index` (or `--force` / `--verbose` if you ask). The agent needs exec and permission to run the openclaw CLI.

## References

- OpenClaw memory concepts: https://docs.openclaw.ai/concepts/memory  
- SQLite vector acceleration (sqlite-vec): same page, section “SQLite vector acceleration (sqlite-vec)”.
