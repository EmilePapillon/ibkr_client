#!/usr/bin/env bash
set -euo pipefail

# Start/stop/status for the frontend static server and Flask backend as user daemons.
# Usage: ./start.sh [start|stop|restart|status] [frontend_port] [backend_port]
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

CMD="${1:-start}"
FRONTEND_PORT="${2:-8000}"
BACKEND_PORT="${3:-5000}"

LOG_DIR="${LOG_DIR:-$ROOT_DIR/logs}"
RUN_DIR="${RUN_DIR:-$ROOT_DIR/run}"
mkdir -p "$LOG_DIR" "$RUN_DIR"

FRONTEND_LOG="${LOG_DIR}/frontend.log"
BACKEND_LOG="${LOG_DIR}/backend.log"
FRONTEND_PID="${RUN_DIR}/frontend.pid"
BACKEND_PID="${RUN_DIR}/backend.pid"

FRONTEND_ORIGINS="http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}"

cleanup_pidfiles() {
  rm -f "$FRONTEND_PID" "$BACKEND_PID"
}
trap cleanup_pidfiles ERR INT TERM

stop_if_running() {
  local pidfile="$1"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid=$(cat "$pidfile")
    if kill -0 "$pid" 2>/dev/null; then
      echo "Stopping process $pid (from $(basename "$pidfile"))"
      kill "$pid" || true
    fi
    rm -f "$pidfile"
  fi
}

start_services() {
  stop_if_running "$FRONTEND_PID"
  stop_if_running "$BACKEND_PID"

  echo "Starting frontend on port ${FRONTEND_PORT}..."
  nohup python3 -m http.server "${FRONTEND_PORT}" >"$FRONTEND_LOG" 2>&1 &
  echo $! >"$FRONTEND_PID"

  echo "Starting backend on port ${BACKEND_PORT} with origins ${FRONTEND_ORIGINS}..."
  nohup env FRONTEND_ORIGINS="${FRONTEND_ORIGINS}" PORT="${BACKEND_PORT}" python3 backend/app.py >"$BACKEND_LOG" 2>&1 &
  echo $! >"$BACKEND_PID"

  echo "Frontend PID: $(cat "$FRONTEND_PID")"
  echo "Backend PID:  $(cat "$BACKEND_PID")"
  echo "Logs: ${FRONTEND_LOG}, ${BACKEND_LOG}"
}

status() {
  for pidfile in "$FRONTEND_PID" "$BACKEND_PID"; do
    local name pid
    name=$(basename "$pidfile")
    if [[ -f "$pidfile" ]]; then
      pid=$(cat "$pidfile")
      if kill -0 "$pid" 2>/dev/null; then
        echo "$name running as PID $pid"
      else
        echo "$name pidfile present but process not running"
      fi
    else
      echo "$name not running"
    fi
  done
}

case "$CMD" in
  start) start_services ;;
  restart) start_services ;;
  stop)
    stop_if_running "$FRONTEND_PID"
    stop_if_running "$BACKEND_PID"
    ;;
  status) status ;;
  *)
    echo "Usage: $0 [start|stop|restart|status] [frontend_port] [backend_port]"
    exit 1
    ;;
esac
