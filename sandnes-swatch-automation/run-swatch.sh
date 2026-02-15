#!/bin/bash
# Sandnes Garn Swatch Automation - Safe Runner
# ALWAYS runs smoke tests before production
# ALWAYS creates backups before making changes

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
SITE="${1:-wholesale}"
DRY_RUN=""
SKIP_AUTH=""
FORCE=""

# Parse args
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN="--dry-run" ;;
    --skip-auth) SKIP_AUTH="--skip-auth" ;;
    --force) FORCE="true" ;;
    --help)
      echo "Usage: $0 [wholesale|prod] [OPTIONS]"
      echo ""
      echo "OPTIONS:"
      echo "  --dry-run     Download only, no uploads"
      echo "  --skip-auth   Use existing cookies (faster)"
      echo "  --force       Skip smoke tests (emergency only)"
      echo "  --help        Show this help"
      echo ""
      echo "EXAMPLES:"
      echo "  $0 wholesale --dry-run       # Test wholesale"
      echo "  $0 prod --skip-auth           # Production with existing auth"
      echo "  $0 prod --force              # Skip tests (emergency)"
      exit 0
      ;;
  esac
done

echo "═══════════════════════════════════════════════════════════"
echo "Sandnes Garn Swatch Automation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Load environment
cd "${SCRIPT_DIR}"
if [ -f .env ]; then
  set -a
  source .env
  set +a
  echo "✅ Environment loaded"
else
  echo -e "${RED}❌ No .env file found${NC}"
  exit 1
fi

# Step 1: Backup (always)
echo ""
echo "Step 1: Creating backup..."
"${SCRIPT_DIR}/scripts/backup-state.sh"

# Step 2: Smoke tests (unless forced)
if [ -z "$FORCE" ]; then
  echo ""
  echo "Step 2: Running smoke tests..."
  if node "${SCRIPT_DIR}/test/smoke.js"; then
    echo -e "${GREEN}✅ Smoke tests passed${NC}"
  else
    echo -e "${RED}❌ Smoke tests failed${NC}"
    echo ""
    echo "To skip tests (emergency only): $0 ${SITE} --force"
    exit 1
  fi
else
  echo ""
  echo -e "${YELLOW}⚠️  WARNING: Skipping smoke tests (--force)${NC}"
  echo ""
  read -p "Are you sure? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Step 3: Run automation
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "Step 3: Running swatch automation"
echo "Site: ${SITE}"
echo "Dry run: ${DRY_RUN:-no}"
echo "Skip auth: ${SKIP_AUTH:-no}"
echo "═══════════════════════════════════════════════════════════"
echo ""

cd "${SCRIPT_DIR}"
node "${SCRIPT_DIR}/src/automate-swatch-final.js" ${SITE} ${DRY_RUN} ${SKIP_AUTH}

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}✅ Automation completed successfully${NC}"
else
  echo -e "${RED}❌ Automation failed with exit code ${EXIT_CODE}${NC}"
  echo "Backup available in: ${SCRIPT_DIR}/backups/"
fi

exit $EXIT_CODE