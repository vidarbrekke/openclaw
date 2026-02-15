#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="/Users/vidarbrekke/Dev/CursorApps/clawd"
cd "$WORKSPACE"
source .env

CSV="$1"
LOG="/tmp/openclaw/run-$(date +%H%M%S).log"
COOKIE="/tmp/openclaw/jobs/cookie-header-fresh.txt"

[[ -f "$COOKIE" ]] || { echo "❌ No cookies"; exit 1; }
[[ -f "$CSV" ]] || { echo "❌ No CSV"; exit 1; }

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

get_folder() {
  case "$1" in
    "Sandnes Garn Tynn Silk Mohair") echo "Tynn Silk Mohair/Nøstebilder" ;;
    "Alpakka Følgetråd (lace weight)") echo "Alpakka Følgetråd/Nøstebilder (skein pictures)" ;;
    "Børstet (Brushed) Alpakka") echo "Børstet Alpakka" ;;
    "Double Sunday") echo "Double Sunday/Nøstebilder" ;;
    "Peer Gynt") echo "Peer Gynt" ;;
    "Sandnes Garn | SUNDAY") echo "Double Sunday/Nøstebilder" ;;
    "Sandnes Garn x PetiteKnit DOUBLE SUNDAY") echo "Double Sunday (PetiteKnit)" ;;
    "Tynn Line") echo "Line" ;;
    *) echo "" ;;
  esac
}

COOK=$(cat "$COOKIE")
log "Start: $(wc -l < "$CSV") CSV lines"

OK=0
SKIP=0
FAIL=0

# Process CSV line by line (avoiding subshell)
LINE_NUM=0
while IFS= read -r LINE; do
  LINE_NUM=$((LINE_NUM + 1))
  [[ $LINE_NUM -le 2 ]] && continue  # Skip headers
  
  IFS=, read -r pid pname vid sku attr vval cid cfile <<< "$LINE"
  pname=$(echo "$pname" | tr -d '"')
  vval=$(echo "$vval" | tr -d '"')
  
  [[ -z "$vid" || -z "$sku" ]] && { log "⏭️  $sku: no vid/sku"; SKIP=$((SKIP+1)); continue; }
  
  FOLDER=$(get_folder "$pname")
  [[ -z "$FOLDER" ]] && { log "⏭️  $sku: unknown product"; SKIP=$((SKIP+1)); continue; }
  
  # Color name
  C=$(echo "$vval" | sed -E 's/^[0-9]+ //')
  W1=$(echo "$C" | awk '{print $1}')
  REST=$(echo "$C" | cut -d' ' -f2- 2>/dev/null | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')
  [[ "$W1" == "$C" ]] && COLOR="$W1" || COLOR="${W1}-${REST}"
  
  FNAME="${sku}_${COLOR}_300dpi_Close-up.jpg"
  FENC=$(echo "$FOLDER" | sed 's/ /%20/g; s/(/%28/g; s/)/%29/g')
  URL="https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29/${FENC}/${FNAME}"
  
  log "📥 $sku ($COLOR)"
  
  # Download
  O1="/tmp/openclaw/downloads/${sku}.jpg"
  JO=$("$WORKSPACE/scripts/openclaw-download-job.sh" --url "$URL" --output "$O1" --cookie-header "$COOK" --job-name "d$sku" 2>&1)
  JID=$(echo "$JO" | grep "^JOB_ID=" | cut -d= -f2)
  
  # Poll
  for i in {1..10}; do
    sleep 3
    JS=$("$WORKSPACE/scripts/openclaw-download-job-status.sh" --job-id "$JID" 2>/dev/null || echo "STATUS=err")
    ST=$(echo "$JS" | grep "^STATUS=" | cut -d= -f2)
    [[ "$ST" == "succeeded" ]] && break
    [[ "$ST" == "failed" ]] && { log "   ❌ DL fail"; FAIL=$((FAIL+1)); continue 2; }
  done
  
  [[ "$ST" != "succeeded" ]] && { log "   ❌ timeout"; FAIL=$((FAIL+1)); continue; }
  
  SZ=$(echo "$JS" | grep "^SIZE_BYTES=" | awk '{print $2}')
  log "   ✅ DL $SZ"
  
  # Process
  O2="/tmp/openclaw/downloads/${sku}_swatch.webp"
  magick "$O1" -resize 80x -quality 90 "$O2" 2>>"$LOG" || { log "   ❌ magick"; FAIL=$((FAIL+1)); rm -f "$O1"; continue; }
  log "   ✅ WebP $(ls -lh "$O2" | awk '{print $5}')"
  rm -f "$O1"
  
  # Upload
  BN=$(basename "$O2")
  scp -q -i "$WHOLESALE_SSH_KEY_PATH" "$O2" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST:/tmp/" 2>>"$LOG" || { log "   ❌ scp"; FAIL=$((FAIL+1)); rm -f "$O2"; continue; }
  
  AID=$(ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" "cd $WHOLESALE_WP_ROOT && wp media import /tmp/$BN --title='SKU $sku' --porcelain 2>/dev/null && rm -f /tmp/$BN" </dev/null 2>>"$LOG")
  [[ -z "$AID" ]] && { log "   ❌ wp"; FAIL=$((FAIL+1)); rm -f "$O2"; continue; }
  
  log "   ✅ WP $AID"
  rm -f "$O2"
  OK=$((OK+1))
  
done < "$CSV" 3< "$CSV"  # Use FD 3 to protect stdin from SSH

log "📊 OK=$OK SKIP=$SKIP FAIL=$FAIL"
echo ""
echo "Full log: $LOG"
