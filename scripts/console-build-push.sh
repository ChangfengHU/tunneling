#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REGISTRY="${REGISTRY:-registry.cn-hangzhou.aliyuncs.com}"
NAMESPACE="${NAMESPACE:-vyibc}"
IMAGE_NAME="${IMAGE_NAME:-tunneling-console}"
TAG="${TAG:-latest}"

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

echo "==> build image ${IMAGE}"
docker build -f "${ROOT_DIR}/console/Dockerfile" -t "${IMAGE}" "${ROOT_DIR}/console"

echo "==> push image ${IMAGE}"
docker push "${IMAGE}"

echo "DONE: ${IMAGE}"

