#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${ROOT_DIR}/console/public/releases/latest/download"

mkdir -p "${OUT_DIR}"

build_agent() {
  local goos="$1"
  local goarch="$2"
  local ext="${3:-}"
  local out="${OUT_DIR}/agent-${goos}-${goarch}${ext}"

  echo "building: ${out}"
  GOOS="${goos}" GOARCH="${goarch}" CGO_ENABLED=0 \
    go build -o "${out}" "${ROOT_DIR}/cmd/agent"
  chmod 0755 "${out}" || true
}

build_agent darwin amd64
build_agent darwin arm64
build_agent linux amd64
build_agent windows amd64 .exe

echo "synced agents: ${OUT_DIR}"
