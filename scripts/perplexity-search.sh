#!/usr/bin/env bash
set -euo pipefail

CONFIG="/root/openclaw-stock-home/.openclaw/workspace/config/mcporter.json"
RECENCY=""
CONTEXT_SIZE="high"
MODEL=""

usage() {
  cat >&2 <<'EOF'
Usage:
  perplexity-search [--recency day|week|month|year] [--context low|medium|high] [--model <model>] "your question"

Examples:
  perplexity-search "latest ECB decision"
  perplexity-search --recency week --context high "compare gemini-2.5-flash-lite vs gemini-2.5-flash pricing"
  perplexity-search --model sonar-pro "summarize Nvidia earnings call"
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --recency)
      RECENCY="${2:-}"
      shift 2
      ;;
    --context)
      CONTEXT_SIZE="${2:-}"
      shift 2
      ;;
    --model)
      MODEL="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      exit 2
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -lt 1 ]; then
  usage
  exit 2
fi

case "$CONTEXT_SIZE" in
  low|medium|high) ;;
  *)
    echo "Invalid --context value: $CONTEXT_SIZE (expected low|medium|high)" >&2
    exit 2
    ;;
esac

if [ -n "$RECENCY" ]; then
  case "$RECENCY" in
    day|week|month|year) ;;
    *)
      echo "Invalid --recency value: $RECENCY (expected day|week|month|year)" >&2
      exit 2
      ;;
  esac
fi

QUERY="$*"

ESCAPED_QUERY="$(python3 -c 'import json,sys; print(json.dumps(" ".join(sys.argv[1:])))' "$QUERY")"

CMD=(mcporter --config "$CONFIG" call perplexity.perplexity_ask "messages: [{\"role\":\"user\",\"content\":${ESCAPED_QUERY}}]" "search_context_size: ${CONTEXT_SIZE}")

if [ -n "$RECENCY" ]; then
  CMD+=("search_recency_filter: ${RECENCY}")
fi

if [ -n "$MODEL" ]; then
  CMD+=("model: ${MODEL}")
fi

exec "${CMD[@]}"
