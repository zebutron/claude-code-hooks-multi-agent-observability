#!/bin/bash
# CRABHUD — start server + client
# Used by LaunchAgent (auto-start on login) or manual invocation.
# Logs to ~/.local/state/crabhud/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_DIR="${HOME}/.local/state/crabhud"
PID_FILE="${STATE_DIR}/pids"

mkdir -p "$STATE_DIR"

SERVER_PORT=${SERVER_PORT:-4000}
CLIENT_PORT=${CLIENT_PORT:-5173}

# Kill existing if running
if [ -f "$PID_FILE" ]; then
    while IFS= read -r pid; do
        kill "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
    sleep 1
fi

# Also kill anything on our ports
for port in $SERVER_PORT $CLIENT_PORT; do
    lsof -ti ":$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
done

# Start server
cd "$PROJECT_ROOT/apps/server"
bun run src/index.ts > "$STATE_DIR/server.log" 2>&1 &
SERVER_PID=$!

# Wait for server
for i in $(seq 1 15); do
    if curl -sf "http://localhost:$SERVER_PORT/" >/dev/null 2>&1; then break; fi
    sleep 1
done

# Start client (vite)
cd "$PROJECT_ROOT/apps/client"
npx vite --port "$CLIENT_PORT" > "$STATE_DIR/client.log" 2>&1 &
CLIENT_PID=$!

# Save PIDs
echo "$SERVER_PID" > "$PID_FILE"
echo "$CLIENT_PID" >> "$PID_FILE"

echo "CRABHUD running — server:$SERVER_PORT (pid $SERVER_PID) client:$CLIENT_PORT (pid $CLIENT_PID)"

# If running in foreground (not launchd), wait and cleanup on Ctrl+C
if [ -t 0 ]; then
    trap 'kill $SERVER_PID $CLIENT_PID 2>/dev/null; rm -f "$PID_FILE"; echo "Stopped."; exit 0' INT TERM
    wait $SERVER_PID $CLIENT_PID
fi
