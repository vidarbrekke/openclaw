#!/bin/bash
# Enhanced Backup Script for Swatch Automation
# Creates timestamped backup of all critical state before any run
#
# Usage: ./scripts/backup-state.sh [optional-description]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DESCRIPTION="${1:-}"
BACKUP_DIR="${SCRIPT_DIR}/backups/${TIMESTAMP}"

echo "═══════════════════════════════════════════════════════════"
echo "Creating backup: ${TIMESTAMP}"
if [ -n "$DESCRIPTION" ]; then
  echo "Description: ${DESCRIPTION}"
fi
echo "═══════════════════════════════════════════════════════════"

mkdir -p "${BACKUP_DIR}"

# Backup code
echo "Backing up source code..."
cp "${SCRIPT_DIR}/src/automate-swatch-final.js" "${BACKUP_DIR}/" 2>/dev/null || echo "  ⚠️ automate-swatch-final.js not found"

# Backup data files (if they exist)
echo "Backing up data files..."
cp "${SCRIPT_DIR}/data/missing_swatches_wholesale.csv" "${BACKUP_DIR}/" 2>/dev/null || echo "  ⚠️ wholesale CSV not found (will be regenerated)"
cp "${SCRIPT_DIR}/data/missing_swatches_prod.csv" "${BACKUP_DIR}/" 2>/dev/null || echo "  ⚠️ production CSV not found (will be regenerated)"

# Backup cookies (critical for auth)
echo "Backing up authentication state..."
cp /tmp/openclaw/jobs/cookie-header.txt "${BACKUP_DIR}/" 2>/dev/null || echo "  ⚠️ cookies not found (will need fresh auth)"
cp /tmp/openclaw/jobs/cookies.json "${BACKUP_DIR}/" 2>/dev/null || true

# Backup environment (sanitized - no real passwords)
echo "Backing up environment template..."
cp "${SCRIPT_DIR}/.env.example" "${BACKUP_DIR}/" 2>/dev/null || echo "  ⚠️ .env.example not found"
if [ -f "${SCRIPT_DIR}/.env" ]; then
  # Create sanitized version (remove actual values)
  grep -E '^[A-Z_]+=' "${SCRIPT_DIR}/.env" | sed 's/=.*$/=***REDACTED***/' > "${BACKUP_DIR}/.env.keys" 2>/dev/null || true
fi

# Record git state
echo "Recording git state..."
if [ -d "${SCRIPT_DIR}/.git" ]; then
  git -C "${SCRIPT_DIR}" log --oneline -1 > "${BACKUP_DIR}/git-commit.txt" 2>/dev/null || echo "unknown" > "${BACKUP_DIR}/git-commit.txt"
  git -C "${SCRIPT_DIR}" describe --tags --always 2>/dev/null || echo "no tag" > "${BACKUP_DIR}/git-tag.txt"
  git -C "${SCRIPT_DIR}" status --short > "${BACKUP_DIR}/git-status.txt" 2>/dev/null || echo "unknown" > "${BACKUP_DIR}/git-status.txt"
  git -C "${SCRIPT_DIR}" diff HEAD --stat > "${BACKUP_DIR}/git-diff-stat.txt" 2>/dev/null || true
else
  echo "no git repository" > "${BACKUP_DIR}/git-commit.txt"
fi

# Record system info
echo "Recording system info..."
{
  echo "Date: $(date)"
  echo "User: $(whoami)"
  echo "Host: $(hostname)"
  echo "Node: $(node --version 2>/dev/null || echo 'not installed')"
  echo "ImageMagick: $(magick -version 2>/dev/null | head -1 || echo 'not installed')"
} > "${BACKUP_DIR}/system-info.txt"

# Create manifest
echo "Creating manifest..."
{
  echo "Backup: ${TIMESTAMP}"
  echo "Created: $(date -r "${BACKUP_DIR}" 2>/dev/null || stat -f %Sm "${BACKUP_DIR}" 2>/dev/null || echo 'unknown')"
  echo "Description: ${DESCRIPTION:-none}"
  echo ""
  echo "Contents:"
  ls -la "${BACKUP_DIR}/"
} > "${BACKUP_DIR}/MANIFEST.txt"

# Success
FILES_BACKED=$(ls -1 "${BACKUP_DIR}" | wc -l | tr -d ' ')
echo ""
echo "✅ Backup complete: ${BACKUP_DIR}"
echo "   Files backed up: ${FILES_BACKED}"
echo ""

# Cleanup old backups (keep last 30)
if [ -d "${SCRIPT_DIR}/backups" ]; then
  cd "${SCRIPT_DIR}/backups"
  COUNT=$(ls -1t 2>/dev/null | wc -l | tr -d ' ')
  if [ "$COUNT" -gt 30 ]; then
    REMOVE=$((COUNT - 30))
    echo "Cleaning up ${REMOVE} old backup(s)..."
    ls -1t | tail -n "${REMOVE}" | xargs -I {} rm -rf "{}"
  fi
fi

# Return backup directory path for scripts that need it
echo "${BACKUP_DIR}"
