#!/usr/bin/env bash
# allocate-domain.sh - register a public domain for a local service
# Usage: ./allocate-domain.sh <project_name> [port] [user_id] [base_domain] [api_url]

set -euo pipefail

API_URL="${5:-https://domain.vyibc.com}"
PROJECT_NAME="${1:-}"
PORT="${2:-3000}"
USER_ID="${3:-user}"
BASE_DOMAIN="${4:-vyibc.com}"
SUBDOMAIN="${SUBDOMAIN:-}"
ADMIN_KEY="${ADMIN_KEY:-}"
MACHINE_DIR="${HOME}/.tunneling"
MACHINE_STATE_FILE="${MACHINE_DIR}/machine_state.json"

if [[ -z "${PROJECT_NAME}" ]]; then
  echo "❌ project_name is required" >&2
  echo "Usage: $0 <project_name> [port] [user_id] [base_domain] [api_url]" >&2
  exit 1
fi

if ! [[ "${PORT}" =~ ^[0-9]+$ ]]; then
  echo "❌ port must be numeric: ${PORT}" >&2
  exit 1
fi

read_machine_field() {
  local key="$1"
  [[ -f "${MACHINE_STATE_FILE}" ]] || return 0
  python3 - "${MACHINE_STATE_FILE}" "${key}" <<'PY'
import json
import sys

path, key = sys.argv[1], sys.argv[2]
try:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    value = data.get(key, "")
    print(value if isinstance(value, str) else "")
except Exception:
    print("")
PY
}

write_machine_state() {
  local tunnel_id="$1"
  local tunnel_token="$2"
  mkdir -p "${MACHINE_DIR}"
  python3 - "${MACHINE_STATE_FILE}" "${USER_ID}" "${tunnel_id}" "${tunnel_token}" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone

path, user_id, tunnel_id, tunnel_token = sys.argv[1:5]
payload = {
    "user_id": user_id,
    "tunnel_id": tunnel_id,
    "tunnel_token": tunnel_token,
    "agent_config": os.path.expanduser("~/.tunneling/machine-agent/config.json"),
    "agent_admin_addr": "127.0.0.1:17000",
    "updated_at": datetime.now(timezone.utc).isoformat(),
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)
PY
}

build_payload() {
  local tunnel_id="${1:-}"
  local tunnel_token="${2:-}"
  python3 - "${USER_ID}" "${PROJECT_NAME}" "${PORT}" "${BASE_DOMAIN}" "${SUBDOMAIN}" "${tunnel_id}" "${tunnel_token}" <<'PY'
import json
import sys

user_id, project, port, base_domain, subdomain, tunnel_id, tunnel_token = sys.argv[1:8]
payload = {
    "user_id": user_id,
    "project": project,
    "target": f"127.0.0.1:{port}",
    "base_domain": base_domain,
}
if subdomain:
    payload["subdomain"] = subdomain
if tunnel_id and tunnel_token:
    payload["tunnel_id"] = tunnel_id
    payload["tunnel_token"] = tunnel_token
print(json.dumps(payload, ensure_ascii=False))
PY
}

register_once() {
  local payload="$1"
  local body_file
  local http_code

  body_file="$(mktemp)"
  if [[ -n "${ADMIN_KEY}" ]]; then
    http_code="$(curl -sS -o "${body_file}" -w "%{http_code}" -X POST "${API_URL}/api/sessions/register" \
      -H 'Content-Type: application/json' \
      -H "Authorization: Bearer ${ADMIN_KEY}" \
      -d "${payload}")"
  else
    http_code="$(curl -sS -o "${body_file}" -w "%{http_code}" -X POST "${API_URL}/api/sessions/register" \
      -H 'Content-Type: application/json' \
      -d "${payload}")"
  fi

  cat "${body_file}"
  rm -f "${body_file}"
  if [[ "${http_code}" =~ ^2 ]]; then
    return 0
  fi
  return 1
}

print_field() {
  local json_payload="$1"
  local field="$2"
  python3 - "${json_payload}" "${field}" <<'PY'
import json
import sys

payload, field = sys.argv[1], sys.argv[2]
data = json.loads(payload)

parts = field.split(".")
cur = data
for part in parts:
    if isinstance(cur, dict):
        cur = cur.get(part)
    else:
        cur = None
        break

if cur is None:
    print("")
elif isinstance(cur, bool):
    print("true" if cur else "false")
else:
    print(cur)
PY
}

echo "📋 domain registration"
echo "  project: ${PROJECT_NAME}"
echo "  target: 127.0.0.1:${PORT}"
echo "  user_id: ${USER_ID}"
echo "  base_domain: ${BASE_DOMAIN}"
echo "  subdomain: ${SUBDOMAIN:-<default>}"

existing_tunnel_id="$(read_machine_field tunnel_id)"
existing_tunnel_token="$(read_machine_field tunnel_token)"

payload="$(build_payload "${existing_tunnel_id}" "${existing_tunnel_token}")"
response="$(register_once "${payload}")" || true

if [[ -z "${response}" ]]; then
  echo "❌ empty response from registration API" >&2
  exit 1
fi

retry_without_existing="false"
if ! print_field "${response}" "public_url" >/dev/null 2>&1; then
  retry_without_existing="true"
elif [[ -n "$(print_field "${response}" "error")" ]]; then
  case "$(print_field "${response}" "error")" in
    *invalid\ tunnel_id*|*invalid\ tunnel*|*tunnel*not\ found*)
      retry_without_existing="true"
      ;;
  esac
fi

if [[ "${retry_without_existing}" == "true" ]]; then
  payload="$(build_payload "" "")"
  response="$(register_once "${payload}")" || true
fi

error_message="$(print_field "${response}" "error" || true)"
if [[ -n "${error_message}" ]]; then
  echo "❌ API error: ${error_message}" >&2
  echo "${response}" >&2
  exit 1
fi

public_url="$(print_field "${response}" "public_url")"
hostname="$(print_field "${response}" "route.hostname")"
tunnel_id="$(print_field "${response}" "tunnel.id")"
tunnel_token="$(print_field "${response}" "tunnel.token")"
agent_command="$(print_field "${response}" "agent_command")"

if [[ -z "${public_url}" || -z "${tunnel_id}" || -z "${tunnel_token}" ]]; then
  echo "❌ registration response missing required fields" >&2
  echo "${response}" >&2
  exit 1
fi

write_machine_state "${tunnel_id}" "${tunnel_token}"

echo ""
echo "✅ 域名分配成功"
echo ""
echo "🌐 公网地址: ${public_url}"
echo "🎯 本地目标: 127.0.0.1:${PORT}"
echo "🧷 Hostname: ${hostname}"
echo "🪪 Tunnel ID: ${tunnel_id}"
echo "📄 凭证文件: ${MACHINE_STATE_FILE}"
echo ""
echo "后续你只需要："
echo "1. 确保本地服务监听 ${PORT}"
echo "2. 启动本地 Agent"
echo "3. 再访问 ${public_url}"
echo ""
if [[ -n "${agent_command}" ]]; then
  echo "Agent Command:"
  echo "${agent_command}"
  echo ""
fi
echo "说明：域名注册本身不要求服务已启动；如果服务或 Agent 尚未运行，公网访问通常会返回 502/404。"
echo ""
echo "📋 JSON:"
echo "${response}" | python3 -m json.tool
