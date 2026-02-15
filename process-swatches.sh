#!/usr/bin/env bash
set -euo pipefail

# Swatch Automation - Process all missing swatches
WORKSPACE="/Users/vidarbrekke/Dev/CursorApps/clawd"
cd "$WORKSPACE"
source .env

CSV_FILE="${1:-missing_swatches_wholesale.csv}"
LOG_FILE="/tmp/openclaw/swatch-$(date +%Y%m%d-%H%M%S).log"
COOKIE_FILE="/tmp/openclaw/jobs/cookie-header-fresh.txt"

mkdir -p /tmp/openclaw/downloads /tmp/openclaw/jobs

log() { echo "[$(date +'%H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Product and subfolder mapping
get_sp_folder() {
  case "$1" in
    "Sandnes Garn Tynn Silk Mohair") echo "Tynn Silk Mohair" ;;
    "Alpakka Følgetråd (lace weight)") echo "Alpakka Følgetråd" ;;
    "Børstet (Brushed) Alpakka") echo "Børstet Alpakka" ;;
    "Double Sunday") echo "Double Sunday" ;;
    "Peer Gynt") echo "Peer Gynt" ;;
    "Sandnes Garn | SUNDAY") echo "Double Sunday" ;;
    "Sandnes Garn x PetiteKnit DOUBLE SUNDAY") echo "Double Sunday (PetiteKnit)" ;;
    "Tynn Line") echo "Line" ;;
    *) echo "" ;;
  esac
}

get_subfolder() {
  case "$1" in
    "Tynn Silk Mohair") echo "Nøstebilder" ;;
    "Alpakka Følgetråd") echo "Nøstebilder (skein pictures)" ;;
    "Double Sunday") echo "Nøstebilder (skein pictures)" ;;
    *) echo "" ;;
  esac
}

# Verify prerequisites
[[ -f "$COOKIE_FILE" ]] || { log "❌ Cookie file missing"; exit 1; }
[[ -f "$CSV_FILE" ]] || { log "❌ CSV file missing"; exit 1; }

COOKIE=$(cat "$COOKIE_FILE")
log "🚀 Starting automation"
log "CSV: $CSV_FILE ($(wc -l < "$CSV_FILE") lines)"

SUCCESS=0
SKIP=0
FAIL=0

# Read CSV into array (skip first 2 header lines)
mapfile -t ROWS < <(tail -n +3 "$CSV_FILE")

log "📊 Processing ${#ROWS[@]} rows"
echo ""

for ROW in "${ROWS[@]}"; do
  IFS=, read -r pid pname vid sku attr vval cid cfile <<< "$ROW"
  
  # Clean quotes
  pname=$(echo "$pname" | tr -d '"')
  vval=$(echo "$vval" | tr -d '"')
  
  # Skip invalid rows
  if [[ -z "$vid" || -z "$sku" ]]; then
    log "⏭️  SKU $sku: Missing vid/sku"
    SKIP=$((SKIP+1))
    continue
  fi
  
  # Get SharePoint folder
  SP_FOLDER=$(get_sp_folder "$pname")
  if [[ -z "$SP_FOLDER" ]]; then
    log "⏭️  SKU $sku: Unknown product '$pname'"
    SKIP=$((SKIP+1))
    continue
  fi
  
  # Get subfolder
  SUBFOLDER=$(get_subfolder "$SP_FOLDER")
  
  # Extract color name (First-word-lowercase-rest)
  COLOR_RAW=$(echo "$vval" | sed -E 's/^[0-9]+ //')
  FIRST=$(echo "$COLOR_RAW" | awk '{print $1}')
  REST=$(echo "$COLOR_RAW" | cut -d' ' -f2- 2>/dev/null | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')
  if [[ "$FIRST" == "$COLOR_RAW" ]]; then
    COLOR="$FIRST"
  else
    COLOR="${FIRST}-${REST}"
  fi
  
  # Build filename
  FNAME="${sku}_${COLOR}_300dpi_Close-up.jpg"
  
  # Build URL
  BASE="https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29"
  SP_ENC=$(echo "$SP_FOLDER" | sed 's/ /%20/g')
  
  if [[ -n "$SUBFOLDER" ]]; then
    SUB_ENC=$(echo "$SUBFOLDER" | sed 's/ /%20/g; s/(/%28/g; s/)/%29/g')
    URL="${BASE}/${SP_ENC}/${SUB_ENC}/${FNAME}"
  else
    URL="${BASE}/${SP_ENC}/${FNAME}"
  fi
  
  log "📥 $sku ($vval)"
  
  # Download
  OUT_ORIG="/tmp/openclaw/downloads/${sku}_orig.jpg"
  JOB_OUT=$("$WORKSPACE/scripts/openclaw-download-job.sh" \
    --url "$URL" \
    --output "$OUT_ORIG" \
    --cookie-header "$COOKIE" \
    --job-name "dl-$sku" 2>&1)
  
  JOB_ID=$(echo "$JOB_OUT" | grep "JOB_ID=" | cut -d= -f2)
  
  # Poll (max 30s)
  DL_STATUS=""
  for i in {1..10}; do
    sleep 3
    ST=$("$WORKSPACE/scripts/openclaw-download-job-status.sh" --job-id "$JOB_ID" 2>/dev/null || echo "STATUS=unknown")
    DL_STATUS=$(echo "$ST" | grep "STATUS=" | cut -d= -f2)
    
    if [[ "$DL_STATUS" == "succeeded" ]]; then
      SIZE=$(echo "$ST" | grep "SIZE_BYTES=" | awk '{print $2}')
      log "   ✅ DL: $SIZE bytes"
      break
    elif [[ "$DL_STATUS" == "failed" ]]; then
      log "   ❌ DL failed"
      FAIL=$((FAIL+1))
      break
    fi
  done
  
  [[ "$DL_STATUS" != "succeeded" ]] && { FAIL=$((FAIL+1)); continue; }
  
  # Process
  OUT_WEB="/tmp/openclaw/downloads/${sku}_swatch.webp"
  if ! magick "$OUT_ORIG" -resize 80x -quality 90 "$OUT_WEB" 2>>"$LOG_FILE"; then
    log "   ❌ magick failed"
    FAIL=$((FAIL+1))
    rm -f "$OUT_ORIG"
    continue
  fi
  log "   ✅ WebP: $(ls -lh "$OUT_WEB" | awk '{print $5}')"
  rm -f "$OUT_ORIG"
  
  # Upload
  BN=$(basename "$OUT_WEB")
  if ! scp -q -i "$WHOLESALE_SSH_KEY_PATH" "$OUT_WEB" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST:/tmp/" 2>>"$LOG_FILE"; then
    log "   ❌ SCP failed"
    FAIL=$((FAIL+1))
    rm -f "$OUT_WEB"
    continue
  fi
  
  AID=$(ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
    "cd $WHOLESALE_WP_ROOT && wp media import /tmp/$BN --title='SKU $sku' --porcelain 2>/dev/null && rm -f /tmp/$BN" 2>>"$LOG_FILE")
  
  if [[ -z "$AID" ]]; then
    log "   ❌ WP import failed"
    FAIL=$((FAIL+1))
    rm -f "$OUT_WEB"
    continue
  fi
  
  log "   ✅ WP: ID $AID"
  rm -f "$OUT_WEB"
  SUCCESS=$((SUCCESS+1))
done

log ""
log "📊 Done: $SUCCESS success, $SKIP skip, $FAIL fail"
log "Log: $LOG_FILE"
