# ollama-memory-embeddings

Installable OpenClaw skill to use **Ollama as the embeddings server** for
memory search (OpenAI-compatible `/v1/embeddings`).

> **Embeddings only** — chat/completions routing is not affected.

## Features

- Interactive embedding model selection:
  - `embeddinggemma` (default — closest to OpenClaw built-in)
  - `nomic-embed-text` (strong quality, efficient)
  - `all-minilm` (smallest/fastest)
  - `mxbai-embed-large` (highest quality, larger)
- Optional import of a local embedding GGUF into Ollama (`ollama create`)
  - Detects: embeddinggemma, nomic-embed, all-minilm, mxbai-embed GGUFs
- Model name normalization (handles `:latest` tag automatically)
- Surgical OpenClaw config update (`agents.defaults.memorySearch`)
- Post-write config sanity check
- Smart gateway restart (detects available restart method)
- Two-step verification: model existence + endpoint response
- Non-interactive mode for automation (GGUF import is opt-in)

## Install

```bash
bash ~/.openclaw/skills/ollama-memory-embeddings/install.sh
```

From repo:

```bash
bash skills/ollama-memory-embeddings/install.sh
```

## Non-interactive example

```bash
bash ~/.openclaw/skills/ollama-memory-embeddings/install.sh \
  --non-interactive \
  --model embeddinggemma \
  --import-local-gguf yes   # explicit opt-in; "auto" = "no" in non-interactive
```

## Verify

```bash
~/.openclaw/skills/ollama-memory-embeddings/verify.sh
~/.openclaw/skills/ollama-memory-embeddings/verify.sh --verbose   # dump raw response on failure
```
