#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/tunneling/console.env}"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

REGISTRY="${REGISTRY:-registry.cn-hangzhou.aliyuncs.com}"
NAMESPACE="${NAMESPACE:-vyibc}"
IMAGE_NAME="${IMAGE_NAME:-tunneling-console}"
TAG="${TAG:-latest}"
CONTAINER_NAME="${CONTAINER_NAME:-tunneling-console}"
PORT="${PORT:-3002}"
CONTROL_API_BASE="${CONTROL_API_BASE:-http://127.0.0.1:18100}"

if [[ -z "${DOCKER_USERNAME:-}" ]]; then
  echo "ERROR: DOCKER_USERNAME is required"
  exit 1
fi
if [[ -z "${DOCKER_PASSWORD:-}" ]]; then
  echo "ERROR: DOCKER_PASSWORD is required"
  exit 1
fi

IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

echo "==> docker login ${REGISTRY}"
echo "${DOCKER_PASSWORD}" | docker login "${REGISTRY}" --username "${DOCKER_USERNAME}" --password-stdin

echo "==> pull ${IMAGE}"
docker pull "${IMAGE}"

echo "==> recreate container ${CONTAINER_NAME}"
docker rm -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true

docker run -d \
  --name "${CONTAINER_NAME}" \
  --restart always \
  --network host \
  -e NODE_ENV=production \
  -e PORT="${PORT}" \
  -e CONTROL_API_BASE="${CONTROL_API_BASE}" \
  "${IMAGE}"

echo "==> container status"
docker ps --filter "name=${CONTAINER_NAME}" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"

echo "==> probe"
sleep 2
curl -fsS "http://127.0.0.1:${PORT}/control/api/tunnels" | head -c 300
echo

echo "DONE: console is running on port ${PORT}"
