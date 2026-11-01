#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$ROOT/data/run"
stopped=0
failed=0

stop_one() {
  local name="$1" expected_cwd="$2" marker="$3" pid cwd cmd
  [[ -f "$RUN/$name.pid" ]] || return 0
  pid="$(cat "$RUN/$name.pid" 2>/dev/null || true)"
  if [[ ! "$pid" =~ ^[0-9]+$ || ! -r "/proc/$pid/cmdline" ]]; then
    rm -f "$RUN/$name.pid"
    printf '%s is not running (removed a stale PID file).\n' "$name"
    return 0
  fi
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
  if [[ "$cwd" != "$expected_cwd" || "$cmd" != *"$marker"* ]]; then
    printf 'Refusing to stop PID %s: it no longer matches this ChoirLineup %s process.\n' "$pid" "$name" >&2
    rm -f "$RUN/$name.pid"
    return 1
  fi
  if ! kill -TERM -- "-$pid" 2>/dev/null; then
    printf 'Could not signal the tracked %s process group %s.\n' "$name" "$pid" >&2
    return 1
  fi
  for _ in {1..80}; do
    kill -0 -- "-$pid" 2>/dev/null || break
    sleep 0.1
  done
  # Force-stop only while the tracked PID still identifies the expected
  # working directory and command; this guards against a reused PID.
  if kill -0 "$pid" 2>/dev/null; then
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    if [[ "$cwd" == "$expected_cwd" && "$cmd" == *"$marker"* ]]; then
      kill -KILL -- "-$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$RUN/$name.pid"
  printf 'Stopped ChoirLineup %s (PID %s).\n' "$name" "$pid"
  stopped=1
}

stop_one backend "$ROOT" manage.py || failed=1
if [[ -f "$RUN/frontend.pid" ]]; then
  FRONT_PID="$(cat "$RUN/frontend.pid" 2>/dev/null || true)"
  FRONT_CMD=""
  if [[ "$FRONT_PID" =~ ^[0-9]+$ && -r "/proc/$FRONT_PID/cmdline" ]]; then FRONT_CMD="$(tr '\0' ' ' < "/proc/$FRONT_PID/cmdline" 2>/dev/null || true)"; fi
  if [[ "$FRONT_CMD" == *"run dev"* ]]; then stop_one frontend "$ROOT/frontend" 'run dev' || failed=1
  else stop_one frontend "$ROOT/frontend" preview || failed=1
  fi
fi
(( stopped )) || echo 'No ChoirLineup launcher processes were running.'
(( failed == 0 )) || exit 1
