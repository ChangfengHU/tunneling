#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-$HOME/.tunneling-agent/agent.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REGISTRY="${REGISTRY:-registry.cn-hangzhou.aliyuncs.com}"
NAMESPACE="${NAMESPACE:-vyibc}"
IMAGE_NAME="${IMAGE_NAME:-tunneling-agent}"
TAG="${TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-tunneling-agent}"

AGENT_SERVER_WS="${AGENT_SERVER_WS:-ws://152.32.214.95/connect}"
ROUTE_SYNC_URL="${ROUTE_SYNC_URL:-http://152.32.214.95/_tunnel/agent/routes}"
AGENT_ADMIN_PORT="${AGENT_ADMIN_PORT:-17001}"
AGENT_CONFIG_DIR="${AGENT_CONFIG_DIR:-$HOME/.tunneling-agent}"

TUNNEL_ID="${TUNNEL_ID:-}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
TUNNEL_TOKEN="${TUNNEL_TOKEN:-$AGENT_TOKEN}"

if [[ -z "${TUNNEL_ID}" ]]; then
  echo "ERROR: TUNNEL_ID is required"
  exit 1
fi
if [[ -z "${AGENT_TOKEN}" ]]; then
  echo "ERROR: AGENT_TOKEN is required"
  exit 1
fi
if [[ -z "${TUNNEL_TOKEN}" ]]; then
  echo "ERROR: TUNNEL_TOKEN is required"
  exit 1
fi

IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

if [[ -n "${DOCKER_USERNAME:-}" && -n "${DOCKER_PASSWORD:-}" ]]; then
  echo "==> docker login ${REGISTRY}"
  echo "${DOCKER_PASSWORD}" | docker login "${REGISTRY}" --username "${DOCKER_USERNAME}" --password-stdin
fi

echo "==> pull ${IMAGE}"
docker pull "${IMAGE}"

echo "==> recreate container ${CONTAINER_NAME}"
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
mkdir -p "${AGENT_CONFIG_DIR}"

extra_host_args=()
if [[ "$(uname -s)" == "Linux" ]]; then
  extra_host_args+=(--add-host=host.docker.internal:host-gateway)
fi

run_args=(
  -d
  --name "${CONTAINER_NAME}"
  --restart always
  -p "${AGENT_ADMIN_PORT}:17001"
  -v "${AGENT_CONFIG_DIR}:/data"
)
if [[ ${#extra_host_args[@]} -gt 0 ]]; then
  run_args+=("${extra_host_args[@]}")
fi
run_args+=(
  "${IMAGE}"
  -server "${AGENT_SERVER_WS}"
  -token "${AGENT_TOKEN}"
  -route-sync-url "${ROUTE_SYNC_URL}"
  -tunnel-id "${TUNNEL_ID}"
  -tunnel-token "${TUNNEL_TOKEN}"
  -admin-addr "0.0.0.0:17001"
  -config "/data/config.json"
)

docker run "${run_args[@]}"

echo "==> container status"
docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo "==> probe"
sleep 2
curl -fsS "http://127.0.0.1:${AGENT_ADMIN_PORT}/api/status" | head -c 500
echo

echo "DONE: agent is running"
echo "NOTE: if local app runs on host, map route target to host.docker.internal:<port> (not 127.0.0.1)."
