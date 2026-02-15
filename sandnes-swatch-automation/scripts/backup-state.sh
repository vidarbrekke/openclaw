#!/bin/bash
# Backup state before every run
# Creates timestamped backup of critical files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backups/$(date +%Y%m%d_%H%M%S)"

echo "═══════════════════════════════════════════════════════════"
echo "Creating backup: ${BACKUP_DIR}"
echo "═══════════════════════════════════════════════════════════"

mkdir -p "${BACKUP_DIR}"

# Backup critical files
cp "${SCRIPT_DIR}/src/automate-swatch-final.js" "${BACKUP_DIR}/" 2>/dev/null || true
cp "${SCRIPT_DIR}/data/missing_swatches_wholesale.csv" "${BACKUP_DIR}/" 2>/dev/null || true
cp "${SCRIPT_DIR}/data/missing_swatches_prod.csv" "${BACKUP_DIR}/" 2>/dev/null || true
cp "${SCRIPT_DIR}/.env" "${BACKUP_DIR}/" 2>/dev/null || true

# Record git state if available
if [ -d "${SCRIPT_DIR}/.git" ]; then
  git -C "${SCRIPT_DIR}" log --oneline -1 > "${BACKUP_DIR}/git-commit.txt" 2>/dev/null || true
  git -C "${SCRIPT_DIR}" status --short > "${BACKUP_DIR}/git-status.txt" 2>/dev/null || true
fi

# Record current cookies
cp /tmp/openclaw/jobs/cookie-header.txt "${BACKUP_DIR}/" 2>/dev/null || true

echo "✅ Backup complete: ${BACKUP_DIR}"
echo ""

# Cleanup old backups (keep last 20)
if [ -d "${SCRIPT_DIR}/backups" ]; then
  cd "${SCRIPT_DIR}/backups"
  ls -t | tail -n +21 | xargs -r rm -rf
fi
