#!/bin/bash
# Rollback to a previous working version
# Usage: ./rollback.sh [backup-timestamp|v1.0.0]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  echo "Usage: $0 <backup-timestamp|v1.0.0|latest>"
  echo ""
  echo "Available backups:"
  ls -1t "${SCRIPT_DIR}/backups/" 2>/dev/null | head -5 || echo "  (none found)"
  echo ""
  echo "Available tags:"
  git -C "${SCRIPT_DIR}" tag -l 2>/dev/null | tail -5 || echo "  (none found)"
  exit 1
fi

echo "═══════════════════════════════════════════════════════════"
echo "ROLLBACK: Restoring to ${TARGET}"
echo "═══════════════════════════════════════════════════════════"
echo ""

# First, backup current state
echo "Creating safety backup of current state..."
"${SCRIPT_DIR}/scripts/backup-state.sh"

# Determine source
if [ -d "${SCRIPT_DIR}/backups/${TARGET}" ]; then
  SOURCE="${SCRIPT_DIR}/backups/${TARGET}"
  echo "Source: Backup ${TARGET}"
elif git -C "${SCRIPT_DIR}" rev-parse "$TARGET" >/dev/null 2>&1; then
  echo "Source: Git tag ${TARGET}"
  
  # Show what will change
  echo ""
  echo "Changes from current to ${TARGET}:"
  git -C "${SCRIPT_DIR}" diff HEAD "$TARGET" --stat || true
  
  read -p "Continue with rollback? [y/N] " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
  
  git -C "${SCRIPT_DIR}" checkout "$TARGET"
  echo "✅ Checked out ${TARGET}"
  exit 0
else
  echo "❌ Target not found: ${TARGET}"
  echo ""
  echo "Available backups:"
  ls -1t "${SCRIPT_DIR}/backups/" 2>/dev/null | head -5 || echo "  (none)"
  exit 1
fi

# Restore from backup
echo ""
echo "Restoring files from ${TARGET}..."

if [ -f "${SOURCE}/automate-swatch-final.js" ]; then
  cp "${SOURCE}/automate-swatch-final.js" "${SCRIPT_DIR}/src/"
  echo "✅ Restored automate-swatch-final.js"
fi

if [ -f "${SOURCE}/missing_swatches_wholesale.csv" ]; then
  cp "${SOURCE}/missing_swatches_wholesale.csv" "${SCRIPT_DIR}/data/"
  echo "✅ Restored wholesale CSV"
fi

if [ -f "${SOURCE}/missing_swatches_prod.csv" ]; then
  cp "${SOURCE}/missing_swatches_prod.csv" "${SCRIPT_DIR}/data/"
  echo "✅ Restored production CSV"
fi

if [ -f "${SOURCE}/cookie-header.txt" ]; then
  cp "${SOURCE}/cookie-header.txt" /tmp/openclaw/jobs/
  echo "✅ Restored cookies"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ Rollback complete"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "Test with: ./run-swatch.sh wholesale --dry-run"