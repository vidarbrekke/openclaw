# Ollama / Qwen2.5-Coder Tool Call Format Investigation

## Summary

When using **qwen2.5-coder:14b** (or similar) via OpenClaw with Ollama, tool calls appear as **raw JSON in the assistant reply** instead of being executed as tools. Example:

```json
{
  "name": "gateway",
  "arguments": {
    "action": "config.get"
  }
}
```

## Root Cause

### 1. Model support

- **Qwen2.5-Coder**: No explicit tool-calling support in Ollama; focused on code generation.
- **Qwen3 / qwen3-coder**: Native tool-calling support, designed for agent workflows.

When qwen2.5-coder receives tools, it can *imitate* tool calls in its text output, but Ollama does not parse those into structured `tool_calls`.

### 2. Format mismatch

- **Qwen raw output format** (node-llama-cpp `QwenChatWrapper`):
  ```
  <tool_call>
  {"name": "gateway", "arguments": {"action": "config.get"}}
  </tool_call>
  ```

- **OpenClaw / pi-ai expectation**: OpenAI-style `choice.delta.tool_calls` with `id`, `function.name`, `function.arguments`.

- **Ollama /v1/chat/completions**: Supports `tools` and `tool_choice`, but only models with native tool calling (e.g. qwen3) produce proper `tool_calls`. For qwen2.5-coder, tool-like output stays in `content`.

### 3. OpenClaw behavior

- Uses `openai-completions` provider (pi-ai).
- Only reads `choice.delta.tool_calls`; no parsing of `<tool_call>...</tool_call>` or JSON in content.
- Content is shown as-is, so tool-call JSON appears in the reply.
- Ollama models use `params: { streaming: false }` to avoid corrupted responses.

## Options

### A. Switch to qwen3-coder (recommended)

- Use `qwen3-coder` or `qwen3-coder-next`, which have native tool-calling support in Ollama.
- No code changes needed; Ollama will emit proper `tool_calls`.

### B. Parse Qwen-style tool calls in content

- Add a post-processor that:
  - Detects `<tool_call>...</tool_call>` or `{"name":"...","arguments":...}` in assistant content.
  - Converts them to the format OpenClaw expects.
- Requires changes in OpenClaw or pi-ai (e.g. provider-specific handling for Ollama/Qwen).

### C. Use Ollama native API instead of /v1

- Ollama’s `/api/chat` may handle tool calls differently.
- OpenClaw currently uses the OpenAI-compatible `/v1/chat/completions` endpoint.
- Switching would require a dedicated Ollama provider, not just a baseUrl override.

### D. Support both tool use and plain chat

- Ensure the local model:
  - Uses tools only when appropriate.
  - Produces normal conversational replies for requests like “turn these numbers into CSV” or “change model” without emitting tool-call JSON.

## Relevant Paths and Code

| Component      | Location |
|----------------|----------|
| OpenClaw config | `~/.openclaw/openclaw.json` |
| Ollama params   | `params: { streaming: false }` in model-selection (model build) |
| pi-ai provider  | `openclaw/node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js` |
| Tool call parsing | Lines ~193–228 in openai-completions.js |
| Qwen format     | `node-llama-cpp/dist/chatWrappers/QwenChatWrapper.js` |

## References

- [Ollama Tool Calling](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama OpenAI Compatibility](https://docs.ollama.com/openai)
- [qwen2.5-coder](https://ollama.com/library/qwen2.5-coder) – no explicit tool support
- [qwen3-coder](https://ollama.com/library/qwen3-coder) – native tool calling
