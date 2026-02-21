#!/usr/bin/env bash
set -euo pipefail

API_PORT="${API_PORT:-5051}"
WEB_PORT="${WEB_PORT:-3000}"

pick_web_port() {
  local port="$1"
  while lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "${port}"
}

RESOLVED_WEB_PORT="$(pick_web_port "${WEB_PORT}")"
if [ "${RESOLVED_WEB_PORT}" != "${WEB_PORT}" ]; then
  echo "[dev] Web port ${WEB_PORT} dolu. ${RESOLVED_WEB_PORT} kullanilacak."
fi

is_api_healthy() {
  curl -sS -m 2 "http://127.0.0.1:${API_PORT}/api/health" >/dev/null 2>&1
}

cleanup_stale_api_listener() {
  local pids
  pids="$(lsof -tiTCP:"${API_PORT}" -sTCP:LISTEN || true)"
  if [ -n "${pids}" ]; then
    echo "[dev] API port ${API_PORT} dolu ama sagliksiz. Eski process sonlandiriliyor."
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 1
  fi
}

if lsof -nP -iTCP:"${API_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  if is_api_healthy; then
    echo "[dev] API port ${API_PORT} zaten dolu ve saglikli. Sadece web baslatiliyor."
    PORT="${RESOLVED_WEB_PORT}" npm run start:web
  else
    cleanup_stale_api_listener
    echo "[dev] API + web birlikte baslatiliyor."
    API_PORT="${API_PORT}" PORT="${RESOLVED_WEB_PORT}" npm run start:all
  fi
else
  echo "[dev] API + web birlikte baslatiliyor."
  API_PORT="${API_PORT}" PORT="${RESOLVED_WEB_PORT}" npm run start:all
fi
