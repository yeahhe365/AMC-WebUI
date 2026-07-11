#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/switch-backend.sh <vertex|aistudio|byok>

Profiles are read from:
  .env.vertex.local
  .env.aistudio.local
  .env.byok.local

Create one from the matching committed example, then fill in its private values:
  cp .env.vertex.example .env.vertex.local
  cp .env.aistudio.example .env.aistudio.local
  cp .env.byok.example .env.byok.local

The command validates the selected profile and recreates the Docker Compose
containers without rebuilding images.
EOF
}

mode="${1:-}"
case "${mode}" in
  vertex|aistudio|byok) ;;
  *)
    usage >&2
    exit 2
    ;;
esac

for dependency in docker curl awk; do
  if ! command -v "${dependency}" >/dev/null 2>&1; then
    echo "Missing required command: ${dependency}" >&2
    exit 2
  fi
done
if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is not available." >&2
  exit 2
fi

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
profile="${project_root}/.env.${mode}.local"

if [[ ! -f "${profile}" ]]; then
  echo "Missing backend profile: ${profile}" >&2
  echo "Run: cp .env.${mode}.example .env.${mode}.local" >&2
  exit 2
fi

read_env() {
  local key="$1"
  local value
  value="$(awk -v key="${key}" '
    /^[[:space:]]*#/ { next }
    {
      line = $0
      sub(/^[[:space:]]*/, "", line)
      if (index(line, key "=") == 1) {
        value = substr(line, length(key) + 2)
      }
    }
    END { print value }
  ' "${profile}")"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  if [[ ${#value} -ge 2 ]]; then
    if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]] ||
      [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
      value="${value:1:${#value}-2}"
    fi
  fi
  printf '%s' "${value}"
}

expect_value() {
  local key="$1"
  local expected="$2"
  local actual
  actual="$(read_env "${key}")"
  if [[ "${actual}" != "${expected}" ]]; then
    echo "${profile}: expected ${key}=${expected}" >&2
    exit 2
  fi
}

require_value() {
  local key="$1"
  if [[ -z "$(read_env "${key}")" ]]; then
    echo "${profile}: ${key} must not be empty" >&2
    exit 2
  fi
}

resolve_host_path() {
  local value="$1"
  if [[ "${value}" == /* ]]; then
    printf '%s' "${value}"
  else
    printf '%s/%s' "${project_root}" "${value#./}"
  fi
}

expect_value RUNTIME_USE_CUSTOM_API_CONFIG true
expect_value RUNTIME_USE_API_PROXY true
expect_value RUNTIME_API_PROXY_URL /api/gemini
expect_value RUNTIME_ENFORCE_API_CONFIG true
require_value WEB_PORT
require_value GOOGLE_APPLICATION_CREDENTIALS_DIR

case "${mode}" in
  vertex)
    expect_value GEMINI_BACKEND vertex
    expect_value GEMINI_API_KEY ''
    expect_value RUNTIME_BACKEND_FLAVOR vertex
    expect_value RUNTIME_SERVER_MANAGED_API true
    require_value GCP_PROJECT_ID
    require_value GCP_LOCATION
    require_value GOOGLE_APPLICATION_CREDENTIALS

    credentials_dir="$(resolve_host_path "$(read_env GOOGLE_APPLICATION_CREDENTIALS_DIR)")"
    credentials_path="$(read_env GOOGLE_APPLICATION_CREDENTIALS)"
    credentials_file="${credentials_dir}/${credentials_path##*/}"
    if [[ ! -f "${credentials_file}" ]]; then
      echo "${profile}: Service Account file not found: ${credentials_file}" >&2
      exit 2
    fi
    ;;
  aistudio)
    expect_value GEMINI_BACKEND aistudio
    expect_value GOOGLE_APPLICATION_CREDENTIALS_DIR ./docker/empty-secrets
    expect_value GOOGLE_APPLICATION_CREDENTIALS ''
    expect_value RUNTIME_BACKEND_FLAVOR aistudio
    expect_value RUNTIME_SERVER_MANAGED_API true
    require_value GEMINI_API_KEY
    ;;
  byok)
    expect_value GEMINI_BACKEND aistudio
    expect_value GEMINI_API_KEY ''
    expect_value GOOGLE_APPLICATION_CREDENTIALS_DIR ./docker/empty-secrets
    expect_value GOOGLE_APPLICATION_CREDENTIALS ''
    expect_value RUNTIME_BACKEND_FLAVOR aistudio
    expect_value RUNTIME_SERVER_MANAGED_API false
    ;;
esac

cd "${project_root}"
docker compose --env-file "${profile}" config --quiet
docker compose --env-file "${profile}" up -d --force-recreate

web_port="$(read_env WEB_PORT)"
published_port="${web_port##*:}"
health_url="http://127.0.0.1:${published_port}/health"
for ((attempt = 1; attempt <= 60; attempt += 1)); do
  if curl --fail --silent --show-error "${health_url}" >/dev/null 2>&1; then
    break
  fi
  if [[ "${attempt}" -eq 60 ]]; then
    echo "Backend switched, but health check failed: ${health_url}" >&2
    docker compose --env-file "${profile}" logs --tail=40 api web >&2
    exit 1
  fi
  sleep 1
done

echo
echo "Backend switched to ${mode} using ${profile}."
echo "Health check passed: ${health_url}"
echo "Refresh every open AMC WebUI tab; accept the update prompt or hard-reload if needed."
docker compose --env-file "${profile}" ps
