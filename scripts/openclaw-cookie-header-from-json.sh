#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  openclaw-cookie-header-from-json.sh --input cookies.json [options]
  openclaw-cookie-header-from-json.sh --stdin [options]

Input:
  JSON from: openclaw browser --json cookies [--target-id <id>] --browser-profile openclaw

Options:
  --input FILE_PATH      Read JSON from file
  --stdin                Read JSON from stdin
  --domain DOMAIN        Keep cookies matching this domain suffix (e.g. sharepoint.com)
  --raw                  Print only cookie header value (no COOKIE_HEADER= prefix)
  -h, --help             Show this help

Output:
  COOKIE_HEADER=<name1>=<value1>; <name2>=<value2>; ...
EOF
}

INPUT_FILE=""
USE_STDIN="0"
DOMAIN_FILTER=""
RAW="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input) INPUT_FILE="${2:-}"; shift 2 ;;
    --stdin) USE_STDIN="1"; shift ;;
    --domain) DOMAIN_FILTER="${2:-}"; shift 2 ;;
    --raw) RAW="1"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ "$USE_STDIN" != "1" && -z "$INPUT_FILE" ]]; then
  echo "Missing --input or --stdin" >&2
  usage
  exit 2
fi

if [[ "$USE_STDIN" == "1" && -n "$INPUT_FILE" ]]; then
  echo "Use either --input or --stdin, not both" >&2
  exit 2
fi

NODE_SCRIPT='
const fs = require("fs");

// With node -e, argv is: [node, arg1, arg2, ...] (no script name entry)
const inputMode = process.argv[1];
const inputFile = process.argv[2];
const domainFilter = (process.argv[3] || "").toLowerCase().trim();
const raw = process.argv[4] === "1";

let text = "";
if (inputMode === "stdin") {
  text = fs.readFileSync(0, "utf8");
} else {
  text = fs.readFileSync(inputFile, "utf8");
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch (err) {
  console.error("Invalid JSON input:", err.message);
  process.exit(1);
}

let cookies = [];
if (Array.isArray(parsed)) {
  cookies = parsed;
} else if (parsed && Array.isArray(parsed.cookies)) {
  cookies = parsed.cookies;
} else if (parsed && parsed.result && Array.isArray(parsed.result.cookies)) {
  cookies = parsed.result.cookies;
} else if (parsed && parsed.data && Array.isArray(parsed.data.cookies)) {
  cookies = parsed.data.cookies;
}

if (!Array.isArray(cookies) || cookies.length === 0) {
  console.error("No cookies array found in input JSON.");
  process.exit(1);
}

function domainMatches(cookieDomain, wanted) {
  if (!wanted) return true;
  const d = String(cookieDomain || "").toLowerCase().replace(/^\./, "");
  const w = wanted.replace(/^\./, "");
  return d === w || d.endsWith("." + w);
}

const seen = new Set();
const pairs = [];
for (const c of cookies) {
  if (!c || typeof c !== "object") continue;
  const name = c.name;
  const value = c.value;
  if (!name || value === undefined || value === null) continue;
  if (!domainMatches(c.domain, domainFilter)) continue;
  if (seen.has(name)) continue;
  seen.add(name);
  pairs.push(`${name}=${value}`);
}

if (!pairs.length) {
  console.error("No cookies left after filtering.");
  process.exit(1);
}

const header = pairs.join("; ");
if (raw) {
  process.stdout.write(header);
} else {
  process.stdout.write(`COOKIE_HEADER=${header}\n`);
}
'

if [[ "$USE_STDIN" == "1" ]]; then
  node -e "$NODE_SCRIPT" "stdin" "" "$DOMAIN_FILTER" "$RAW"
else
  node -e "$NODE_SCRIPT" "file" "$INPUT_FILE" "$DOMAIN_FILTER" "$RAW"
fi
