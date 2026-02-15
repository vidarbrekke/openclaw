#!/usr/bin/env bash
set -euo pipefail

# Complete Swatch Automation - Both Sites
# Downloads once, uploads to both sites

WORKSPACE="/Users/vidarbrekke/Dev/CursorApps/clawd"
cd "$WORKSPACE"

echo "🚀 SWATCH AUTOMATION - BOTH SITES"
echo "=================================="
echo ""
echo "Phase 1: Production (download + process + cache + upload)"
echo "Phase 2: Wholesale (reuse cache + upload)"
echo ""
echo "Press Ctrl+C to cancel..."
sleep 3

# Phase 1: Production
echo ""
echo "📍 PHASE 1: PRODUCTION"
echo "====================="
./run-swatch-production-first.sh prod

PROD_LOG=$(ls -t /tmp/openclaw/swatch-prod-*.log | head -1)
PROD_OK=$(grep "^.*📊 OK=" "$PROD_LOG" | tail -1 | sed 's/.*OK=//' | awk '{print $1}')
PROD_CACHED=$(grep "^.*CACHED=" "$PROD_LOG" | tail -1 | sed 's/.*CACHED=//' | awk '{print $1}')

echo ""
echo "✅ Production complete: $PROD_OK successful uploads"
echo ""

# Apply production swatches
echo "Applying production swatches..."
source .env
PROD_APPLIED=$(ssh -i "$PROD_SSH_KEY_PATH" "$PROD_SSH_USER@$PROD_SSH_HOST" \
  "cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --apply 2>/dev/null" \
  | grep "Success: Applied" | sed 's/.*Applied //' | awk '{print $1}')

echo "✅ Applied $PROD_APPLIED swatches on production"
echo ""
sleep 2

# Phase 2: Wholesale (reuse cached files)
echo ""
echo "📍 PHASE 2: WHOLESALE (using cached files)"
echo "=========================================="
./run-swatch-production-first.sh wholesale

WHOLE_LOG=$(ls -t /tmp/openclaw/swatch-wholesale-*.log | head -1)
WHOLE_OK=$(grep "^.*📊 OK=" "$WHOLE_LOG" | tail -1 | sed 's/.*OK=//' | awk '{print $1}')
WHOLE_CACHED=$(grep "^.*CACHED=" "$WHOLE_LOG" | tail -1 | sed 's/.*CACHED=//' | awk '{print $1}')

echo ""
echo "✅ Wholesale complete: $WHOLE_OK successful uploads ($WHOLE_CACHED from cache)"
echo ""

# Apply wholesale swatches
echo "Applying wholesale swatches..."
WHOLE_APPLIED=$(ssh -i "$WHOLESALE_SSH_KEY_PATH" "$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST" \
  "cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --apply 2>/dev/null" \
  | grep "Success: Applied" | sed 's/.*Applied //' | awk '{print $1}')

echo "✅ Applied $WHOLE_APPLIED swatches on wholesale"
echo ""

# Final summary
echo ""
echo "🎉 COMPLETE - BOTH SITES"
echo "========================"
echo ""
echo "Production:  $PROD_OK uploaded, $PROD_APPLIED assigned"
echo "Wholesale:   $WHOLE_OK uploaded, $WHOLE_APPLIED assigned ($WHOLE_CACHED reused from cache)"
echo ""
echo "Cache: $(ls -1 /tmp/openclaw/swatch-cache 2>/dev/null | wc -l) processed images saved"
echo ""
echo "Logs:"
echo "  Production: $PROD_LOG"
echo "  Wholesale:  $WHOLE_LOG"
