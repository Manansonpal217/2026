#!/usr/bin/env bash
# Run backend, web (admin panel), and desktop app in parallel

set -e
cd "$(dirname "$0")/.."

# Free ports 3000 and 3001 if already in use (e.g. from previous run)
free_port() {
  local port=$1
  local pid
  pid=$(lsof -ti:"$port" 2>/dev/null) || true
  if [ -n "$pid" ]; then
    echo "Killing process on port $port (PID $pid)..."
    kill -9 $pid 2>/dev/null || true
    sleep 1
  fi
}
free_port 3000
free_port 3001

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $(jobs -p) 2>/dev/null || true
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting TrackSync development environment..."
echo "  - Backend:     http://localhost:3001"
echo "  - Admin panel: http://localhost:3000"
echo "  - Desktop:    Electron app"
echo ""
echo "Press Ctrl+C to stop all"
echo "----------------------------------------"

pnpm run dev:backend &
pnpm run dev:web &
pnpm run dev:desktop &

wait
