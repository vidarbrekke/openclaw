#!/usr/bin/env bash
set -euo pipefail

# Swatch Automation for Wholesale Site
# Processes all missing swatches from CSV

WORKSPACE="/Users/vidarbrekke/Dev/CursorApps/clawd"
cd "$WORKSPACE"
source .env

CSV_FILE="missing_swatches_wholesale.csv"
LOG_FILE="/tmp/openclaw/swatch-automation-$(date +%Y%m%d-%H%M%S).log"
COOKIE_HEADER_FILE="/tmp/openclaw/jobs/cookie-header-fresh.txt"

mkdir -p /tmp/openclaw/downloads /tmp/openclaw/jobs

# Product mapping function (WooCommerce → SharePoint)
get_sharepoint_folder() {
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

# Subfolder mapping function
get_subfolder() {
  case "$1" in
    "Tynn Silk Mohair") echo "Nøstebilder" ;;
    "Alpakka Følgetråd") echo "Nøstebilder (skein pictures)" ;;
    "Double Sunday") echo "Nøstebilder (skein pictures)" ;;
    *) echo "" ;;
  esac
}

log() {
  echo "[$(date +'%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "🚀 Starting swatch automation for wholesale site"
log "CSV: $CSV_FILE"
log "Cookie header: $COOKIE_HEADER_FILE"

# Verify cookie header exists
if [[ ! -f "$COOKIE_HEADER_FILE" ]]; then
  log "❌ ERROR: Cookie header file not found at $COOKIE_HEADER_FILE"
  log "Run: openclaw browser --json cookies ... | scripts/openclaw-cookie-header-from-json.sh --stdin --domain sharepoint.com --raw > $COOKIE_HEADER_FILE"
  exit 1
fi

COOKIE_HEADER=$(cat "$COOKIE_HEADER_FILE")
log "✅ Cookie header loaded (${#COOKIE_HEADER} bytes)"

# Statistics
TOTAL=0
SUCCESS=0
SKIP=0
FAIL=0

# Skip header line and process CSV
tail -n +3 "$CSV_FILE" | while IFS=, read -r product_id product_name variation_id sku attribute variant_value candidate_id candidate_file; do
  TOTAL=$((TOTAL + 1))
  
  # Remove quotes from product_name
  product_name=$(echo "$product_name" | tr -d '"')
  variant_value=$(echo "$variant_value" | tr -d '"')
  
  # Skip if missing required fields
  if [[ -z "$variation_id" || -z "$sku" ]]; then
    log "⏭️  SKIP: Missing variation_id or SKU for product '$product_name'"
    SKIP=$((SKIP + 1))
    continue
  fi
  
  # Map product to SharePoint folder
  SHAREPOINT_FOLDER=$(get_sharepoint_folder "$product_name")
  if [[ -z "$SHAREPOINT_FOLDER" ]]; then
    log "⏭️  SKIP: Unknown product mapping for '$product_name' (SKU: $sku)"
    SKIP=$((SKIP + 1))
    continue
  fi
  
  # Get subfolder
  SUBFOLDER=$(get_subfolder "$SHAREPOINT_FOLDER")
  
  # Extract color name from variant_value (e.g., "3591 Chocolate Plum" → "Chocolate-plum")
  # Remove leading digits, replace spaces with hyphens, lowercase second word onwards
  COLOR_PART=$(echo "$variant_value" | sed -E 's/^[0-9]+ //')
  FIRST_WORD=$(echo "$COLOR_PART" | awk '{print $1}')
  REST=$(echo "$COLOR_PART" | cut -d' ' -f2- 2>/dev/null | tr '[:upper:]' '[:lower:]' | sed 's/ /-/g')
  if [[ "$FIRST_WORD" == "$COLOR_PART" ]]; then
    COLOR_NAME="$FIRST_WORD"
  else
    COLOR_NAME="${FIRST_WORD}-${REST}"
  fi
  
  # Construct filename
  FILENAME="${sku}_${COLOR_NAME}_300dpi_Close-up.jpg"
  
  # Construct SharePoint URL
  BASE_URL="https://sandnesgarn.sharepoint.com/sites/SandnesGarn/Forhandler%20Arkiv/Nettside%20forhandler%20arkiv/Bildearkiv%20%28picture%20archive%29/Garn%20%28yarn%29"
  
  if [[ -n "$SUBFOLDER" ]]; then
    ENCODED_SUBFOLDER=$(echo "$SUBFOLDER" | sed 's/ /%20/g' | sed 's/(/%28/g' | sed 's/)/%29/g')
    SHAREPOINT_URL="${BASE_URL}/$(echo "$SHAREPOINT_FOLDER" | sed 's/ /%20/g')/${ENCODED_SUBFOLDER}/${FILENAME}"
  else
    SHAREPOINT_URL="${BASE_URL}/$(echo "$SHAREPOINT_FOLDER" | sed 's/ /%20/g')/${FILENAME}"
  fi
  
  log "📥 Processing SKU $sku ($variant_value)"
  log "   URL: $SHAREPOINT_URL"
  
  # Download
  OUTPUT_FILE="/tmp/openclaw/downloads/${sku}_original.jpg"
  JOB_OUTPUT=$("$WORKSPACE/scripts/openclaw-download-job.sh" \
    --url "$SHAREPOINT_URL" \
    --output "$OUTPUT_FILE" \
    --cookie-header "$COOKIE_HEADER" \
    --job-name "download-$sku")
  
  JOB_ID=$(echo "$JOB_OUTPUT" | grep "JOB_ID=" | cut -d= -f2)
  
  # Poll for completion (max 30 seconds)
  for i in {1..10}; do
    sleep 3
    STATUS_OUTPUT=$("$WORKSPACE/scripts/openclaw-download-job-status.sh" --job-id "$JOB_ID")
    STATUS=$(echo "$STATUS_OUTPUT" | grep "STATUS=" | cut -d= -f2)
    
    if [[ "$STATUS" == "succeeded" ]]; then
      SIZE=$(echo "$STATUS_OUTPUT" | grep "SIZE_BYTES=" | awk '{print $2}')
      log "   ✅ Downloaded: $SIZE bytes"
      break
    elif [[ "$STATUS" == "failed" ]]; then
      EXIT_CODE=$(echo "$STATUS_OUTPUT" | grep "EXIT_CODE=" | cut -d= -f2)
      log "   ❌ FAIL: Download failed (exit code: $EXIT_CODE)"
      FAIL=$((FAIL + 1))
      continue 2
    fi
  done
  
  if [[ "$STATUS" != "succeeded" ]]; then
    log "   ❌ FAIL: Download timeout"
    FAIL=$((FAIL + 1))
    continue
  fi
  
  # Process image
  PROCESSED_FILE="/tmp/openclaw/downloads/${sku}_${COLOR_NAME}_swatch.webp"
  if ! magick "$OUTPUT_FILE" -resize 80x -quality 90 "$PROCESSED_FILE" 2>>"$LOG_FILE"; then
    log "   ❌ FAIL: Image processing failed"
    FAIL=$((FAIL + 1))
    rm -f "$OUTPUT_FILE"
    continue
  fi
  
  log "   ✅ Processed to WebP: $(ls -lh "$PROCESSED_FILE" | awk '{print $5}')"
  rm -f "$OUTPUT_FILE"
  
  # Upload to WordPress
  BASENAME=$(basename "$PROCESSED_FILE")
  
  if ! scp -i "$WHOLESALE_SSH_KEY_PATH" "$PROCESSED_FILE" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST:/tmp/" 2>>"$LOG_FILE"; then
    log "   ❌ FAIL: SCP upload failed"
    FAIL=$((FAIL + 1))
    rm -f "$PROCESSED_FILE"
    continue
  fi
  
  ATTACHMENT_ID=$(ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
    "cd $WHOLESALE_WP_ROOT && wp media import /tmp/$BASENAME --title='SKU $sku' --porcelain 2>/dev/null && rm /tmp/$BASENAME")
  
  if [[ -z "$ATTACHMENT_ID" ]]; then
    log "   ❌ FAIL: WordPress import failed"
    FAIL=$((FAIL + 1))
    rm -f "$PROCESSED_FILE"
    continue
  fi
  
  log "   ✅ Uploaded to WordPress: attachment ID $ATTACHMENT_ID"
  rm -f "$PROCESSED_FILE"
  SUCCESS=$((SUCCESS + 1))
done

log ""
log "📊 SUMMARY"
log "Total processed: $TOTAL"
log "Successful: $SUCCESS"
log "Skipped: $SKIP"
log "Failed: $FAIL"
log ""
log "Full log: $LOG_FILE"
