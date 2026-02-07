---
name: url-text-scraper
description: >
  Extracts clean readable text from one or more URLs using a self-managed Python virtual environment and optional boilerplate removal.
---

# url-text-scraper

## What this skill is for
This skill provides a deterministic way to:
- fetch a public URL
- extract readable text (ignoring scripts/styles and markup)
- optionally process many URLs and produce a zip of `.txt` files

It manages its own Python virtual environment inside this skill directory and installs dependencies on demand.

## Hard rules
- Never install Python packages globally.
- Never require the user to manually activate a venv.
- Always run using the venv python located at: `./.venv/bin/python`
- Always allow redirects (shorteners often require it).
- Always send a desktop browser User-Agent header.
- Use HTTP retries for transient errors (429/5xx).
- For batch runs, never abort the whole job on a single URL failure — write a `failures.txt`.
- When done, exit normally (no persistent shell state required).

## Dependencies (auto-installed into the skill venv)
- requests
- beautifulsoup4
- lxml

## Files
- `scripts/ensure_venv.sh` : creates/updates venv and installs deps; prints venv python path
- `scripts/scrape_url.py` : scrape one URL to stdout or file
- `scripts/scrape_urls_file.py` : scrape many URLs from a file into an output directory and optional zip

## How the agent should use this skill

### A) Single URL → text file
1) Ensure venv exists and deps are installed:
   - Run: `scripts/ensure_venv.sh`
   - Capture the printed python path as `$PY` (it will be `.../.venv/bin/python`)
2) Extract text:
   - Run: `$PY scripts/scrape_url.py "<URL>" --out "<OUTPUT_TXT>"`
3) Return the output file path (and paste the text if requested).

### B) Many URLs (file) → output dir + zip
Input file format:
- One URL per line, OR
- Tab/space-separated lines where the last field is treated as the URL

Steps:
1) Run: `scripts/ensure_venv.sh` (capture `$PY`)
2) Run:
   - `$PY scripts/scrape_urls_file.py "<URLS_FILE>" --outdir "<OUTDIR>" --strip-common --zip "<ZIP_PATH>"`
3) If any URLs fail, a `failures.txt` is created in the output dir and included in the zip.
4) Return the zip path.

## Notes on "closing the venv"
No shell activation is used. Commands run the venv python directly, so the process ends cleanly after each run.

## Optional: Summarization (only when explicitly requested)

This skill does NOT summarize by default.

Summarization should ONLY be performed when the user or prompt explicitly asks
for a summary.

### How the agent should summarize extracted text

1) First extract text using this skill (scrape step).
2) If and only if a summary is requested:
   - Run: `$PY scripts/summarize_text.py "<INPUT_TXT>" --out "<SUMMARY_TXT>"`
3) Return the summary file or paste the summary text.

### Rules
- Never summarize automatically.
- Never summarize unless explicitly requested.
- Scraping and summarization are separate concerns.
