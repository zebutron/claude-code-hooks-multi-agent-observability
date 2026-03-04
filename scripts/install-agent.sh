#!/bin/bash
# Install CRABHUD LaunchAgent — run once per machine.
# After this, CRABHUD auto-starts on login.

set -euo pipefail

PLIST_NAME="com.zeb.crabhud"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_SRC="$SCRIPT_DIR/${PLIST_NAME}.plist"
PLIST_DST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"
STATE_DIR="$HOME/.local/state/crabhud"

mkdir -p "$STATE_DIR"
mkdir -p "$HOME/Library/LaunchAgents"

# Unload if already loaded
launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true

# Copy plist (symlinks don't work reliably with launchd)
cp "$PLIST_SRC" "$PLIST_DST"

# Load
launchctl bootstrap "gui/$(id -u)" "$PLIST_DST"

echo "✅ CRABHUD LaunchAgent installed and started."
echo "   Server: http://localhost:4000"
echo "   Client: http://localhost:5173"
echo "   Logs:   $STATE_DIR/"
echo ""
echo "To stop:   launchctl bootout gui/$(id -u)/${PLIST_NAME}"
echo "To start:  launchctl bootstrap gui/$(id -u) $PLIST_DST"
echo "To remove: bash $SCRIPT_DIR/uninstall-agent.sh"
