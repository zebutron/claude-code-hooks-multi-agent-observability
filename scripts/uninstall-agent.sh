#!/bin/bash
# Uninstall CRABHUD LaunchAgent

PLIST_NAME="com.zeb.crabhud"
PLIST_DST="$HOME/Library/LaunchAgents/${PLIST_NAME}.plist"

launchctl bootout "gui/$(id -u)/${PLIST_NAME}" 2>/dev/null || true
rm -f "$PLIST_DST"
bash "$(dirname "$0")/crabhud-stop.sh" 2>/dev/null || true

echo "✅ CRABHUD LaunchAgent removed."
