#!/bin/bash
# Sandnes Garn Swatch Automation - Safe Runner v1.1.0
# 
# SAFETY FIRST: This script ALWAYS:
# 1. Runs smoke tests before any execution
# 2. Creates timestamped backups
# 3. Validates environment
# 4. Requires explicit confirmation for dangerous operations
#
# Usage: ./run-swatch.sh [wholesale|prod] [OPTIONS]
#
# NEVER modify this script directly. Changes go through git workflow:
#   branch → test → review → merge → tag

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
SITE="${1:-wholesale}"
DRY_RUN=""
SKIP_AUTH=""
VERBOSE=""
FORCE=""
DESCRIPTION=""

# ============================================================================
# PARSE ARGUMENTS
# ============================================================================

show_help() {
    cat << EOF
Sandnes Garn Swatch Automation - Safe Runner

Usage: $0 [SITE] [OPTIONS]

SITE:
    wholesale    Process wholesale site (default)
    prod         Process production site

OPTIONS:
    --dry-run         Download and process only, no uploads
    --skip-auth       Use existing cookies (faster, assumes fresh auth)
    --verbose, -v     Show detailed progress for each SKU
    --force           Skip smoke tests (EMERGENCY ONLY)
    --description     Add description to backup (e.g., "batch-2")
    --help            Show this help message

EXAMPLES:
    $0 wholesale --dry-run           # Test wholesale pipeline
    $0 prod --verbose                # Production with detailed output
    $0 prod --skip-auth --verbose    # Fast production run
    $0 wholesale --description "fresh-auth"  # Tagged backup

SAFETY:
    Smoke tests MUST pass before production runs.
    If tests fail, fix issues or use --force (emergency only).

For rollback: ./rollback.sh [version]
EOF
    exit 0
}

# Parse all arguments
for arg in "$@"; do
    case $arg in
        --help|-h) show_help ;;
        --dry-run) DRY_RUN="--dry-run" ;;
        --skip-auth) SKIP_AUTH="--skip-auth" ;;
        --verbose|-v) VERBOSE="--verbose" ;;
        --force) FORCE="true" ;;
        --description)
            DESCRIPTION="${2:-}"
            shift
            ;;
        --description=*)
            DESCRIPTION="${arg#*=}"
            ;;
    esac
done

# Validate site
if [[ ! "$SITE" =~ ^(wholesale|prod)$ ]]; then
    echo -e "${RED}✗ Error: Unknown site '$SITE'${NC}"
    echo "  Valid sites: wholesale, prod"
    echo "  Usage: $0 [wholesale|prod] [options]"
    exit 1
fi

# ============================================================================
# HEADER
# ============================================================================

echo "═══════════════════════════════════════════════════════════"
echo "  Sandnes Garn Swatch Automation v1.1.0"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}Site:${NC}        $SITE"
echo -e "${BLUE}Dry Run:${NC}     ${DRY_RUN:-no}"
echo -e "${BLUE}Skip Auth:${NC}   ${SKIP_AUTH:-no}"
echo -e "${BLUE}Verbose:${NC}     ${VERBOSE:-no}"
if [ -n "$DESCRIPTION" ]; then
    echo -e "${BLUE}Backup Tag:${NC}  $DESCRIPTION"
fi
echo ""

# ============================================================================
# LOAD ENVIRONMENT
# ============================================================================

cd "${SCRIPT_DIR}"

if [ ! -f .env ]; then
    echo -e "${RED}✗ Error: No .env file found${NC}"
    echo "  Create from template: cp .env.example .env"
    echo "  Then edit with your credentials"
    exit 1
fi

set -a
source .env
set +a

echo -e "${GREEN}✓${NC} Environment loaded"

# ============================================================================
# STEP 1: BACKUP (ALWAYS)
# ============================================================================

echo ""
echo "───────────────────────────────────────────────────────────"
echo "STEP 1: Creating backup"
echo "───────────────────────────────────────────────────────────"

if [ -x "${SCRIPT_DIR}/scripts/backup-state.sh" ]; then
    BACKUP_OUTPUT=$("${SCRIPT_DIR}/scripts/backup-state.sh" "$DESCRIPTION" 2>&1)
    BACKUP_DIR=$(echo "$BACKUP_OUTPUT" | tail -1)
    
    if [ -d "$BACKUP_DIR" ]; then
        echo -e "${GREEN}✓${NC} Backup created: $(basename "$BACKUP_DIR")"
    else
        echo -e "${YELLOW}⚠${NC} Backup may have failed - continuing anyway"
    fi
else
    echo -e "${YELLOW}⚠${NC} Backup script not found - continuing without backup"
fi

# ============================================================================
# STEP 2: SMOKE TESTS (UNLESS FORCED)
# ============================================================================

echo ""
echo "───────────────────────────────────────────────────────────"
echo "STEP 2: Running smoke tests"
echo "───────────────────────────────────────────────────────────"

if [ -z "$FORCE" ]; then
    if npm test 2>&1; then
        echo ""
        echo -e "${GREEN}✓ All smoke tests passed${NC}"
    else
        TEST_EXIT=$?
        echo ""
        echo -e "${RED}✗ Smoke tests failed${NC}"
        echo ""
        echo "Common fixes:"
        echo "  1. Run fresh authentication (omit --skip-auth)"
        echo "  2. Check ImageMagick is installed: magick -version"
        echo "  3. Verify .env file has all required variables"
        echo ""
        echo "To bypass tests (emergency only): $0 $SITE --force"
        exit 1
    fi
else
    echo ""
    echo -e "${YELLOW}⚠ WARNING: Skipping smoke tests (--force)${NC}"
    echo ""
    read -p "Are you sure you want to skip safety checks? [y/N] " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 1
    fi
fi

# ============================================================================
# STEP 3: VALIDATE CSV
# ============================================================================

echo ""
echo "───────────────────────────────────────────────────────────"
echo "STEP 3: Validating data files"
echo "───────────────────────────────────────────────────────────"

CSV_FILE="${SCRIPT_DIR}/data/missing_swatches_${SITE}.csv"

if [ ! -f "$CSV_FILE" ]; then
    echo -e "${RED}✗ CSV file not found: ${CSV_FILE}${NC}"
    echo ""
    echo "To generate from WordPress:"
    
    if [ "$SITE" = "wholesale" ]; then
        echo "  ssh -i \"$WHOLESALE_SSH_KEY_PATH\" \"$WHOLESALE_SSH_USER@$WHOLESALE_SSH_HOST\" \\"
        echo "    \"cd $WHOLESALE_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv\" \\"
        echo "    > data/missing_swatches_wholesale.csv"
    else
        echo "  ssh -i \"$PROD_SSH_KEY_PATH\" \"$PROD_SSH_USER@$PROD_SSH_HOST\" \\"
        echo "    \"cd $PROD_WP_ROOT && wp mk-attr swatch_missing_candidates --format=csv\" \\"
        echo "    > data/missing_swatches_prod.csv"
    fi
    exit 1
fi

# Count lines (excluding header)
CSV_LINES=$(tail -n +2 "$CSV_FILE" | wc -l | tr -d ' ')
if [ "$CSV_LINES" -eq 0 ]; then
    echo -e "${YELLOW}⚠ CSV file is empty (no SKUs to process)${NC}"
    exit 0
fi

echo -e "${GREEN}✓${NC} CSV validated: ${CSV_LINES} SKUs to process"

# ============================================================================
# STEP 4: RUN AUTOMATION
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "STEP 4: Running swatch automation"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Show warning for production
if [ "$SITE" = "prod" ] && [ -z "$DRY_RUN" ]; then
    echo -e "${YELLOW}⚠ PRODUCTION RUN: This will modify live WooCommerce${NC}"
    echo ""
fi

# Run the automation
node "${SCRIPT_DIR}/src/automate-swatch-final.js" ${SITE} ${DRY_RUN} ${SKIP_AUTH} ${VERBOSE}

EXIT_CODE=$?

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "═══════════════════════════════════════════════════════════"

if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✓ Automation completed successfully${NC}"
elif [ $DRY_RUN ]; then
    echo -e "${GREEN}✓ Dry run completed${NC}"
    echo "  Review output above before running without --dry-run"
else
    echo -e "${YELLOW}⚠ Automation completed with warnings${NC}"
fi

if [ -d "$BACKUP_DIR" ]; then
    echo ""
    echo "Backup available: $BACKUP_DIR"
fi

echo "═══════════════════════════════════════════════════════════"
echo ""

# Provide helpful next steps
if [ -n "$DRY_RUN" ] && [ $EXIT_CODE -eq 0 ]; then
    echo "Next steps:"
    echo "  Review the dry-run output above"
    echo "  If satisfied, run without --dry-run:"
    echo "    $0 $SITE ${SKIP_AUTH} ${VERBOSE}"
fi

exit $EXIT_CODE