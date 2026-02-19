---
name: vision-default
description: >
  Use the vision/OCR model (qwen-vl) for image reading, OCR, screenshot analysis, and document-in-image tasks.
  Use when the user shares an image, asks to read/extract text from an image, perform OCR, analyze a screenshot,
  describe a picture, or when the task involves vision or multimodal image input.
---

# Vision / OCR default model

For any **vision or OCR task**, use the dedicated vision model so image understanding and text extraction are reliable.

## When this applies

- User sends or references an image (screenshot, photo, diagram, document scan).
- User asks to read text from an image, perform OCR, or extract text from a picture.
- User asks to describe, analyze, or answer questions about image content.
- Task involves multimodal input (image + text) or “what’s in this image?” style questions.

## Required action

**Before** handling the vision/OCR request:

1. Switch the session to the vision model: **`/model qwen-vl`**
   - Alias `qwen-vl` maps to `openrouter/qwen/qwen-2.5-vl-7b-instruct` (OpenRouter).
2. Then process the image (read, describe, OCR, or answer the user’s question).

If the user has already sent an image in the same message, switch first, then respond to the image.

## After the task

- **Switch back to the default model:** After you have finished replying to the vision/OCR request, run **`/model default`** so the next user message uses the default model again (e.g. for normal chat or coding).
- Exception: if the user’s very next message is clearly another image or vision question, you may stay on `qwen-vl` for that turn, then switch back to default after that reply.

## Notes

- `qwen-vl` is the default for vision/OCR in this workspace; no need to ask which model to use for images.
- If `/model qwen-vl` fails (e.g. alias missing), report that the vision model is unavailable and suggest checking `agents.defaults.models` in `~/.openclaw/openclaw.json` for `openrouter/qwen/qwen-2.5-vl-7b-instruct` with alias `qwen-vl`.
