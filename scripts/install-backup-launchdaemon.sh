#!/bin/bash
# Install the OpenClaw backup LaunchDaemon (system-wide, runs daily at 11:00)
# Requires sudo.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/com.openclaw.backup.plist"
PLIST_DEST="/Library/LaunchDaemons/com.openclaw.backup.plist"

echo "Installing OpenClaw backup LaunchDaemon..."
sudo cp "$PLIST_SRC" "$PLIST_DEST"
sudo chown root:wheel "$PLIST_DEST"
sudo chmod 644 "$PLIST_DEST"

# Unload if already loaded, then load
sudo launchctl unload "$PLIST_DEST" 2>/dev/null || true
sudo launchctl load "$PLIST_DEST"

echo "Done. Backup will run daily at 11:00."
echo "Logs: $HOME/clawd/MoltBackups/Memory/backup.log"
echo "To uninstall: sudo launchctl unload $PLIST_DEST && sudo rm $PLIST_DEST"
