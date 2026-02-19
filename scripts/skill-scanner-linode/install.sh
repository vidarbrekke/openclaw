#!/usr/bin/env bash
# Install skill-scanner on Linode: venv, scripts, cron. Run as root on the server.
# Usage: scp this dir to Linode, then: sudo bash install.sh
set -euo pipefail

INSTALL_ROOT="${INSTALL_ROOT:-/opt/skill-scanner}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="${OPENCLAW_SKILLS_DIR:-/root/.openclaw/skills}"
STATE_DIR="/root/.openclaw/var/skill-scanner-state"
LOG_FILE="/var/log/skill-scanner.log"

echo "Installing skill-scanner under $INSTALL_ROOT..."

# Python 3.10+ and venv
if ! command -v python3 >/dev/null 2>&1; then
  echo "Installing python3..."
  apt-get update -qq && apt-get install -y -qq python3 python3-venv python3-pip
fi
# Ensure venv is available (Debian/Ubuntu: python3.12-venv or python3-venv)
if ! python3 -c "import venv" 2>/dev/null; then
  echo "Installing python3-venv..."
  apt-get update -qq && apt-get install -y -qq python3-venv || apt-get install -y -qq python3.12-venv
fi
PYTHON=$(command -v python3)
"$PYTHON" -c "import sys; exit(0 if sys.version_info >= (3, 10) else 1)" || {
  echo "Python 3.10+ required. Install it and re-run."
  exit 1
}

mkdir -p "$INSTALL_ROOT"
cd "$INSTALL_ROOT"
"$PYTHON" -m venv venv
./venv/bin/pip install -U pip
./venv/bin/pip install cisco-ai-skill-scanner

# Scripts
mkdir -p bin
cp "$SCRIPT_DIR/scan-new-skills.sh" bin/
cp "$SCRIPT_DIR/upgrade-scanner.sh" bin/
chmod +x bin/scan-new-skills.sh bin/upgrade-scanner.sh

# Env used by scripts
export OPENCLAW_SKILLS_DIR="$SKILLS_DIR"
export SKILL_SCANNER_STATE_DIR="$STATE_DIR"
export SKILL_SCANNER_LOG="$LOG_FILE"
export SKILL_SCANNER_CMD="$INSTALL_ROOT/venv/bin/skill-scanner"
export SKILL_SCANNER_PIP="$INSTALL_ROOT/venv/bin/pip"

mkdir -p "$STATE_DIR"
touch "$LOG_FILE" 2>/dev/null || true

# Cron: every hour = scan new/changed skills; weekly = upgrade scanner
# Scripts use defaults for /opt/skill-scanner and /root/.openclaw paths
CRON_SCAN="0 * * * * root $INSTALL_ROOT/bin/scan-new-skills.sh"
CRON_UPGRADE="0 3 * * 0 root $INSTALL_ROOT/bin/upgrade-scanner.sh"

if [ -w /etc/crontab ]; then
  if ! grep -q "scan-new-skills.sh" /etc/crontab 2>/dev/null; then
    echo "$CRON_SCAN" >> /etc/crontab
    echo "Added cron: every hour scan new/changed skills"
  else
    echo "Cron for scan already present"
  fi
  if ! grep -q "upgrade-scanner.sh" /etc/crontab 2>/dev/null; then
    echo "$CRON_UPGRADE" >> /etc/crontab
    echo "Added cron: weekly Sunday 03:00 upgrade skill-scanner"
  else
    echo "Cron for upgrade already present"
  fi
else
  echo "Cannot write /etc/crontab. Add these lines as root:"
  echo "  $CRON_SCAN"
  echo "  $CRON_UPGRADE"
  echo "Or use crontab -e and add (without 'root'):"
  echo "  0 * * * * $INSTALL_ROOT/bin/scan-new-skills.sh"
  echo "  0 3 * * 0 $INSTALL_ROOT/bin/upgrade-scanner.sh"
fi

echo "Done. Log: $LOG_FILE. State: $STATE_DIR."
echo "Test: $INSTALL_ROOT/venv/bin/skill-scanner scan $SKILLS_DIR/motherknitter --use-behavioral"
