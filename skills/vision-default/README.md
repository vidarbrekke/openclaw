# vision-default

OpenClaw skill: use **qwen-vl** (`openrouter/qwen/qwen-2.5-vl-7b-instruct`) for vision and OCR tasks by default.

## What it does

- Instructs the agent to run `/model qwen-vl` before handling image/OCR/screenshot tasks.
- Applies when the user shares an image, asks for OCR, or asks to describe/analyze image content.

## Install (OpenClaw)

So OpenClaw loads this skill from the repo:

- **Option A:** If your OpenClaw workspace is this repo (`clawd`), skills under `skills/` may already be discovered (workspace-relative).
- **Option B:** Symlink into OpenClaw’s skill dir:
  ```bash
  mkdir -p ~/.openclaw/skills
  ln -sf "$(pwd)/skills/vision-default" ~/.openclaw/skills/vision-default
  ```
- **Option C:** Copy the `vision-default` folder into `~/.openclaw/skills/`.

Restart the gateway after adding the skill.

## Prerequisite

In `~/.openclaw/openclaw.json`, the vision model must be in the model list with alias `qwen-vl`, for example:

```json
"openrouter/qwen/qwen-2.5-vl-7b-instruct": {
  "alias": "qwen-vl"
}
```
