#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="dev"
OPEN_BROWSER=1
HOST="${DJANGO_BIND_HOST:-127.0.0.1}"
API_PORT="${DJANGO_PORT:-8000}"
FRONTEND_PORT="${VITE_PORT:-5173}"

fail() { printf 'ChoirLineup: %s\n' "$*" >&2; exit 1; }
# Read only known simple settings. Never source .env as shell code.
if [[ -f "$ROOT/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"; [[ "$line" =~ ^[[:space:]]*# || ! "$line" =~ = ]] && continue
    key="${line%%=*}"; value="${line#*=}"; key="${key//[[:space:]]/}"
    value="${value#\"}"; value="${value%\"}"; value="${value#\'}"; value="${value%\'}"
    case "$key" in
      DJANGO_BIND_HOST) [[ -n "${DJANGO_BIND_HOST+x}" ]] || HOST="$value" ;;
      DJANGO_PORT) [[ -n "${DJANGO_PORT+x}" ]] || API_PORT="$value" ;;
      VITE_PORT) [[ -n "${VITE_PORT+x}" ]] || FRONTEND_PORT="$value" ;;
      VITE_API_BASE_URL) [[ -n "${VITE_API_BASE_URL+x}" ]] || export VITE_API_BASE_URL="$value" ;;
    esac
  done < "$ROOT/.env"
fi
while (($#)); do
  case "$1" in
    --built) MODE="built" ;;
    --no-browser) OPEN_BROWSER=0 ;;
    --host) shift; (($#)) || fail 'Expected an address after --host.'; HOST="$1" ;;
    --help|-h) echo 'Usage: scripts/start-linux.sh [--built] [--host ADDRESS] [--no-browser]'; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift
done
[[ "$HOST" =~ ^[A-Za-z0-9:.-]+$ ]] || fail 'Host must be an IP address or hostname (letters, numbers, dots, colons, and hyphens only).'
[[ "$API_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'DJANGO_PORT must be between 1 and 65535.'
[[ "$FRONTEND_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'VITE_PORT must be between 1 and 65535.'
API_PORT=$((10#$API_PORT)); FRONTEND_PORT=$((10#$FRONTEND_PORT))
(( API_PORT > 0 && API_PORT < 65536 )) || fail 'DJANGO_PORT must be between 1 and 65535.'
(( FRONTEND_PORT > 0 && FRONTEND_PORT < 65536 )) || fail 'VITE_PORT must be between 1 and 65535.'
(( API_PORT != FRONTEND_PORT )) || fail 'DJANGO_PORT and VITE_PORT must be different.'
command -v python3 >/dev/null || fail 'Python 3 is required. Install Python 3.11 or newer.'
command -v node >/dev/null || fail 'Node.js is required. Install Node.js 20 or newer.'
command -v npm >/dev/null || fail 'npm is required. Install it with Node.js.'
command -v setsid >/dev/null || fail 'The setsid utility is required to safely track launcher processes.'
python3 -c 'import sys; raise SystemExit(sys.version_info < (3, 11))' || fail 'Python 3.11 or newer is required.'
node -e 'process.exit(Number(process.versions.node.split(".")[0]) < 20 ? 1 : 0)' || fail 'Node.js 20 or newer is required.'
python3 - "$HOST" "$API_PORT" "$FRONTEND_PORT" <<'PY' || fail 'A configured port is already in use; stop the existing service or change DJANGO_PORT/VITE_PORT.'
import socket, sys
host, api_port, frontend_port = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
for port in (api_port, frontend_port):
    addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM, flags=socket.AI_PASSIVE)
    for family, socktype, proto, _, address in addresses:
        sock = socket.socket(family, socktype, proto)
        try:
            sock.bind(address)
        except OSError:
            raise SystemExit(1)
        finally:
            sock.close()
PY

mkdir -p "$ROOT/data/run" "$ROOT/data/logs" "$ROOT/data/backups"
PY="$ROOT/backend/.venv/bin/python"
if [[ ! -x "$PY" ]]; then
  python3 -m venv "$ROOT/backend/.venv" || fail 'Could not create backend/.venv. Check Python venv support and folder permissions.'
fi
req_hash="$(sha256sum "$ROOT/backend/requirements.txt" | cut -d' ' -f1)"
if [[ ! -f "$ROOT/backend/.venv/.choirlineup-requirements" || "$(cat "$ROOT/backend/.venv/.choirlineup-requirements")" != "$req_hash" ]]; then
  "$PY" -m pip install -r "$ROOT/backend/requirements.txt" || fail 'Python dependencies could not be installed. Check the network and backend/requirements.txt.'
  printf '%s\n' "$req_hash" > "$ROOT/backend/.venv/.choirlineup-requirements"
fi
frontend_hash="$(sha256sum "$ROOT/frontend/package.json" "$ROOT/frontend/package-lock.json" | sha256sum | cut -d' ' -f1)"
frontend_stamp="$ROOT/frontend/node_modules/.choirlineup-dependencies"
if [[ ! -d "$ROOT/frontend/node_modules" || ! -f "$frontend_stamp" || "$(cat "$frontend_stamp" 2>/dev/null || true)" != "$frontend_hash" ]]; then
  (cd "$ROOT/frontend" && npm install) || fail 'Frontend dependencies could not be installed. Check the network and frontend/package-lock.json.'
  printf '%s\n' "$frontend_hash" > "$frontend_stamp"
fi
if [[ "$MODE" == "built" ]]; then
  (cd "$ROOT/frontend" && npm run build) || fail 'The frontend production build failed; see the output above.'
fi

RUN="$ROOT/data/run"
is_ours() {
  local pid="$1" expected_cwd="$2" marker="$3" cwd cmd
  [[ "$pid" =~ ^[0-9]+$ && -r "/proc/$pid/cmdline" ]] || return 1
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$expected_cwd" ]] || return 1
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  [[ "$cmd" == *"$marker"* ]]
}
FRONT_MARKER="run dev"; [[ "$MODE" == "built" ]] && FRONT_MARKER="preview"
for spec in "backend:$ROOT:manage.py" "frontend:$ROOT/frontend:$FRONT_MARKER"; do
  name="${spec%%:*}"; rest="${spec#*:}"; cwd="${rest%:*}"; marker="${rest##*:}"
  if [[ -f "$RUN/$name.pid" ]]; then
    old_pid="$(cat "$RUN/$name.pid" 2>/dev/null || true)"
    if is_ours "$old_pid" "$cwd" "$marker"; then
      fail "$name is already running with PID $old_pid. Use scripts/stop-linux.sh first."
    fi
    rm -f "$RUN/$name.pid"
  fi
done

"$PY" "$ROOT/backend/manage.py" migrate --noinput || fail 'Database migrations failed. Your database was not reset; review the error and run the migrate command manually.'
setsid "$PY" "$ROOT/backend/manage.py" runserver "$HOST:$API_PORT" --noreload > "$ROOT/data/logs/backend.log" 2>&1 < /dev/null &
BACK_PID=$!
printf '%s\n' "$BACK_PID" > "$RUN/backend.pid"
if [[ "$MODE" == "dev" ]]; then
  cd "$ROOT/frontend"
  setsid npm run dev -- --host "$HOST" --port "$FRONTEND_PORT" > "$ROOT/data/logs/frontend.log" 2>&1 < /dev/null &
else
  cd "$ROOT/frontend"
  setsid npm run preview -- --host "$HOST" --port "$FRONTEND_PORT" > "$ROOT/data/logs/frontend.log" 2>&1 < /dev/null &
fi
FRONT_PID=$!
printf '%s\n' "$FRONT_PID" > "$RUN/frontend.pid"
cd "$ROOT"
sleep 2
if ! kill -0 "$BACK_PID" 2>/dev/null || ! kill -0 "$FRONT_PID" 2>/dev/null; then
  "$ROOT/scripts/stop-linux.sh" >/dev/null 2>&1 || true
  fail 'A server stopped during startup. Review data/logs/backend.log and data/logs/frontend.log.'
fi
URL_HOST="$HOST"; [[ "$URL_HOST" == *:* ]] && URL_HOST="[$URL_HOST]"
printf 'ChoirLineup is running (%s mode).\nFrontend: http://%s:%s\nAPI:      http://%s:%s/api/\nLogs:     %s/data/logs/\nStop with: scripts/stop-linux.sh\n' "$MODE" "$URL_HOST" "$FRONTEND_PORT" "$URL_HOST" "$API_PORT" "$ROOT"
if (( OPEN_BROWSER )) && command -v xdg-open >/dev/null; then xdg-open "http://$URL_HOST:$FRONTEND_PORT" >/dev/null 2>&1 & fi
if [[ "$MODE" == "built" ]]; then
  echo 'The built frontend is served by Vite preview; Django still uses the development server and is not suitable for production Internet hosting.'
fi
