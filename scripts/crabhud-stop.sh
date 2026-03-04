#!/bin/bash
# CRABHUD — stop server + client

STATE_DIR="${HOME}/.local/state/crabhud"
PID_FILE="${STATE_DIR}/pids"

if [ ! -f "$PID_FILE" ]; then
    echo "CRABHUD not running (no PID file)"
    exit 0
fi

while IFS= read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null
        echo "Stopped pid $pid"
    fi
done < "$PID_FILE"

rm -f "$PID_FILE"
echo "CRABHUD stopped."
