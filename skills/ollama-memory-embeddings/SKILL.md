---
name: ollama-memory-embeddings
description: >
  Configure OpenClaw memory search to use Ollama as the embeddings server
  (OpenAI-compatible /v1/embeddings) instead of the built-in node-llama-cpp
  local GGUF loading. Includes interactive model selection and optional import
  of an existing local embedding GGUF into Ollama.
---

# Ollama Memory Embeddings

This skill configures OpenClaw memory search to use Ollama as the **embeddings
server** via its OpenAI-compatible `/v1/embeddings` endpoint.

> **Embeddings only.** This skill does not affect chat/completions routing —
> it only changes how memory-search embedding vectors are generated.

## What it does

- Installs this skill under `~/.openclaw/skills/ollama-memory-embeddings`
- Verifies Ollama is installed and reachable
- Lets the user choose an embedding model:
  - `embeddinggemma` (default — closest to OpenClaw built-in)
  - `nomic-embed-text` (strong quality, efficient)
  - `all-minilm` (smallest/fastest)
  - `mxbai-embed-large` (highest quality, larger)
- Optionally imports an existing local embedding GGUF into Ollama via
  `ollama create` (currently detects embeddinggemma, nomic-embed, all-minilm,
  and mxbai-embed GGUFs in known cache directories)
- Normalizes model names (handles `:latest` tag automatically)
- Updates `agents.defaults.memorySearch` in OpenClaw config (surgical — only
  touches keys this skill owns):
  - `provider = "openai"`
  - `model = <selected model>:latest`
  - `remote.baseUrl = "http://127.0.0.1:11434/v1/"`
  - `remote.apiKey = "ollama"` (required by client, ignored by Ollama)
- Performs a post-write config sanity check (reads back and validates JSON)
- Optionally restarts the OpenClaw gateway (with detection of available
  restart methods: `openclaw gateway restart`, systemd, launchd)
- Runs a two-step verification:
  1. Checks model exists in `ollama list`
  2. Calls the embeddings endpoint and validates the response

## Install

```bash
bash ~/.openclaw/skills/ollama-memory-embeddings/install.sh
```

From this repository:

```bash
bash skills/ollama-memory-embeddings/install.sh
```

## Non-interactive usage

```bash
bash ~/.openclaw/skills/ollama-memory-embeddings/install.sh \
  --non-interactive \
  --model embeddinggemma
```

> **Note:** In non-interactive mode, `--import-local-gguf auto` is treated as
> `no` (safe default). Use `--import-local-gguf yes` to explicitly opt in.

Options:

- `--model <id>`: one of `embeddinggemma`, `nomic-embed-text`, `all-minilm`, `mxbai-embed-large`
- `--import-local-gguf <auto|yes|no>`: default `auto` (interactive: prompts; non-interactive: `no`)
- `--import-model-name <name>`: default `embeddinggemma-local`
- `--skip-restart`: do not restart gateway
- `--openclaw-config <path>`: config file path override

## Verify

```bash
~/.openclaw/skills/ollama-memory-embeddings/verify.sh
```

Use `--verbose` to dump raw API response on failure:

```bash
~/.openclaw/skills/ollama-memory-embeddings/verify.sh --verbose
```

## GGUF detection scope

The installer searches for embedding GGUFs matching these patterns in known
cache directories (`~/.node-llama-cpp/models`, `~/.cache/node-llama-cpp/models`,
`~/.cache/openclaw/models`):

- `*embeddinggemma*.gguf`
- `*nomic-embed*.gguf`
- `*all-minilm*.gguf`
- `*mxbai-embed*.gguf`

Other embedding GGUFs are not auto-detected. You can always import manually:

```bash
ollama create my-model -f /path/to/Modelfile
```

## Notes

- This does not modify OpenClaw package code. It only updates user config.
- A timestamped backup of config is written before changes.
- If no local GGUF exists, install proceeds by pulling the selected model from Ollama.
- Model names are normalized with `:latest` tag for consistent Ollama interaction.
