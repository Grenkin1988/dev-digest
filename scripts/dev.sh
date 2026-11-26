#!/usr/bin/env bash
#
# DevDigest local bootstrap — bring the whole stack up from zero.
#
#   ./scripts/dev.sh              # full: docker → migrate → seed → server + client
#   ./scripts/dev.sh --no-seed    # skip the demo seed
#   ./scripts/dev.sh --no-client  # run only Postgres + API (no Next.js)
#   ./scripts/dev.sh --db-only    # just Postgres + migrate + seed, then exit
#   ./scripts/dev.sh --kill-stale # stop a dev server left on :3001/:3000 by an earlier run
#
# Idempotent: re-running installs only what's missing, migrations and seed
# both upsert. Ctrl-C stops the dev servers and leaves Postgres running.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONTAINER="devdigest-postgres"
RUN_SEED=1
RUN_CLIENT=1
DB_ONLY=0
KILL_STALE=0

for arg in "$@"; do
  case "$arg" in
    --no-seed)    RUN_SEED=0 ;;
    --no-client)  RUN_CLIENT=0 ;;
    --db-only)    DB_ONLY=1 ;;
    --kill-stale) KILL_STALE=1 ;;
    -h|--help)    sed -n '2,13p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*"; }

IS_WINDOWS=0
case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) IS_WINDOWS=1 ;; esac

API_PORT="$(grep -E '^API_PORT=' server/.env 2>/dev/null | tail -1 | cut -d= -f2 | tr -d '\r" ')"
API_PORT="${API_PORT:-3001}"
WEB_PORT=3000 # fixed by `next dev -p 3000` in client/package.json

# PID of the process listening on TCP port $1 (empty when the port is free).
port_pid() {
  if [ "$IS_WINDOWS" -eq 1 ]; then
    # A listening socket has a 0 remote port; matching that (not "LISTENING")
    # keeps this working on localized Windows.
    netstat -ano -p TCP | awk -v p=":$1" \
      '$1=="TCP" && $3 ~ /:0$/ && substr($2, length($2)-length(p)+1)==p { print $5; exit }'
  else
    lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1
  fi
}

# Stop whatever listens on port $1, including its launcher. On Windows, killing
# the bash subshell leaves the native `pnpm → cmd → tsx watch → node` chain
# running (tsx watch even restarts the server on file changes), so climb from
# the listener through that chain and kill the whole tree with taskkill /T.
kill_port_tree() {
  local pid root
  pid="$(port_pid "$1")"
  [ -n "$pid" ] || return 0
  if [ "$IS_WINDOWS" -eq 1 ]; then
    root="$(powershell.exe -NoProfile -NonInteractive -Command "
      \$id = $pid
      while (\$true) {
        \$p  = Get-CimInstance Win32_Process -Filter \"ProcessId=\$id\"
        \$pp = Get-CimInstance Win32_Process -Filter \"ProcessId=\$(\$p.ParentProcessId)\"
        if (-not \$pp) { break }
        \$launcher = (\$pp.Name -in 'node.exe','pnpm.exe','sh.exe') -or
                     (\$pp.Name -eq 'cmd.exe' -and \$pp.CommandLine -match ' /c ')
        if (-not \$launcher) { break }
        \$id = \$pp.ProcessId
      }
      \$id" | tr -d '\r')"
    taskkill //F //T //PID "${root:-$pid}" >/dev/null 2>&1 || true
  else
    kill "$pid" 2>/dev/null || true
  fi
}

# Fail fast (or, with --kill-stale, clean up) when a port is already taken.
ensure_port_free() {
  local port="$1" what="$2" pid
  pid="$(port_pid "$port")"
  [ -z "$pid" ] && return 0
  if [ "$KILL_STALE" -eq 1 ]; then
    warn "port $port ($what) is held by PID $pid — stopping it (--kill-stale)"
    kill_port_tree "$port"
    for _ in $(seq 1 20); do [ -z "$(port_pid "$port")" ] && return 0; sleep 0.5; done
    echo "port $port is still in use after --kill-stale" >&2; exit 1
  fi
  echo "port $port ($what) is already in use by PID $pid — most likely a dev server left over from an earlier run." >&2
  echo "Re-run with --kill-stale to stop it, or stop it yourself." >&2
  exit 1
}

# --- prerequisites -----------------------------------------------------------
command -v docker >/dev/null || { echo "docker not found"; exit 1; }
command -v pnpm   >/dev/null || { echo "pnpm not found (npm i -g pnpm)"; exit 1; }

if [ "$DB_ONLY" -eq 0 ]; then
  ensure_port_free "$API_PORT" "API"
  [ "$RUN_CLIENT" -eq 1 ] && ensure_port_free "$WEB_PORT" "web"
fi

# --- env files ---------------------------------------------------------------
for dir in server client; do
  if [ ! -f "$dir/.env" ] && [ -f "$dir/.env.example" ]; then
    cp "$dir/.env.example" "$dir/.env"
    warn "created $dir/.env from .env.example — add your API keys (OPENAI/ANTHROPIC/GITHUB_TOKEN) in server/.env"
  fi
done

# --- Postgres ----------------------------------------------------------------
# The container name is fixed (container_name: devdigest-postgres), so if one is
# already running (possibly under another compose project) we reuse it instead
# of failing on a name conflict. If it exists but is stopped, start it; else
# create it via compose.
state="$(docker inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null || echo "missing")"
case "$state" in
  running) log "Postgres container already running — reusing it" ;;
  exited|created) log "starting existing Postgres container"; docker start "$CONTAINER" >/dev/null ;;
  *)       log "starting Postgres (docker compose up -d)"; docker compose up -d ;;
esac

log "waiting for Postgres to be healthy"
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo "starting")"
  [ "$status" = "healthy" ] && break
  sleep 1
done
[ "${status:-}" = "healthy" ] || { echo "Postgres did not become healthy in time"; exit 1; }
log "Postgres healthy"

# --- install deps (only if missing) ------------------------------------------
install_if_needed() {
  if [ ! -d "$1/node_modules" ]; then
    log "installing deps in $1"
    (cd "$1" && pnpm install)
  fi
}
install_if_needed server
[ "$DB_ONLY" -eq 0 ] && [ "$RUN_CLIENT" -eq 1 ] && install_if_needed client
# reviewer-core's RAW source is imported by the API at runtime (tsconfig alias);
# without its deps the API crashes at boot with ERR_MODULE_NOT_FOUND. It uses npm.
[ -d reviewer-core/node_modules ] || { log "installing deps in reviewer-core"; (cd reviewer-core && npm ci); }

# --- migrate + seed ----------------------------------------------------------
log "applying migrations"
(cd server && pnpm db:migrate)

if [ "$RUN_SEED" -eq 1 ]; then
  log "seeding demo data"
  (cd server && pnpm db:seed)
fi

if [ "$DB_ONLY" -eq 1 ]; then
  log "DB ready. Postgres is running; server/client not started (--db-only)."
  exit 0
fi

# --- dev servers -------------------------------------------------------------
SERVER_PID=""
SERVER_WINPID=""
CLEANED=0
cleanup() {
  [ "$CLEANED" -eq 1 ] && return
  CLEANED=1
  log "shutting down dev servers (Postgres stays up; stop it with: docker compose down)"
  # Windows: kill the API launcher's native tree too (covers a crashed server
  # whose `tsx watch` is still alive but no longer holds the port).
  [ -n "$SERVER_WINPID" ] && taskkill //F //T //PID "$SERVER_WINPID" >/dev/null 2>&1 || true
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
  # The ports were free at start, so whatever holds them now is ours.
  kill_port_tree "$API_PORT"
  [ "$RUN_CLIENT" -eq 1 ] && kill_port_tree "$WEB_PORT"
  return 0
}
trap cleanup EXIT INT TERM

log "starting API on :3001 (server)"
(cd server && pnpm dev) &
SERVER_PID=$!
SERVER_WINPID=""
[ "$IS_WINDOWS" -eq 1 ] && SERVER_WINPID="$(cat "/proc/$SERVER_PID/winpid" 2>/dev/null || true)"

if [ "$RUN_CLIENT" -eq 1 ]; then
  log "starting web on :3000 (client) — Ctrl-C to stop both"
  (cd client && pnpm dev)
else
  log "API running (PID $SERVER_PID) — Ctrl-C to stop"
  wait "$SERVER_PID"
fi
