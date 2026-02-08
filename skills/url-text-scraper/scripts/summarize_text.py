#!/usr/bin/env python3
import argparse
from pathlib import Path

def main():
    ap = argparse.ArgumentParser(description="Summarize a text file (optional step).")
    ap.add_argument("input_txt", help="Path to text file to summarize")
    ap.add_argument("--out", help="Write summary to this file (otherwise stdout)")
    ap.add_argument("--max-lines", type=int, default=10, help="Max lines in summary")
    args = ap.parse_args()

    text = Path(args.input_txt).read_text(encoding="utf-8")

    # Very simple extractive summary heuristic (safe default)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    summary = "\n".join(lines[: args.max_lines])

    if args.out:
        Path(args.out).write_text(summary, encoding="utf-8")
    else:
        print(summary)

if __name__ == "__main__":
    main()
