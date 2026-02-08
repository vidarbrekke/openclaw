---
name: local-ops
description: >
  Ensure housekeeping, orchestration, and background tasks use the model alias
  "local" (zero external tokens). Install to configure sub-agents + a local-ops
  agent that always uses the "local" alias.
---

# Local Ops (Alias = local)

This skill ensures that internal/housekeeping tasks **always** use the model
alias `local`, so you never spend external tokens for background work.

## What it configures

- `agents.defaults.subagents.model = "local"`  
  All sub-agents default to the `local` alias.

- Adds a dedicated agent: `local-ops`  
  - Model: `local`  
  - Workspace: `~/.openclaw/workspace-local-ops`

## Requirements

You must define a model with **alias `local`** in OpenClaw.

Examples:
- `ollama/llama3.2:3b` (local)
- `ollama/qwen2.5:7b` (local)
- Any other local provider/model you run

If `local` is not defined, OpenClaw will warn and fall back to defaults.

## Delegation pattern

Use sub-agents for any internal task:

```
sessions_spawn({
  task: "Summarize gateway logs from the last hour.",
  agentId: "local-ops",
  label: "log-analysis",
  cleanup: "delete"
})
```

## Common internal tasks

- Log analysis
- Cron evaluation
- Session cleanup review
- File indexing
- Health checks

## Install

```
bash ~/.openclaw/skills/local-ops/install.sh
```

## Helper: create `local` alias and allow it

```
~/.openclaw/skills/local-ops/create-local-alias.sh
```

This:
1. Picks the most recently updated Ollama model
2. Runs `openclaw models aliases add local ollama/<model>`
3. Sets `env.OLLAMA_API_KEY` so the local model is allowed for `/model local`
4. Adds the model to `agents.defaults.models` (allowlist)
5. Ensures `models.providers.ollama` exists (provider allowlist)

Override with:
- `OPENCLAW_MODEL=ollama/<model>`
- `OLLAMA_URL=http://127.0.0.1:11434`
