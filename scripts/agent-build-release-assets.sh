#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="${DIST_DIR:-${ROOT_DIR}/dist}"

mkdir -p "${DIST_DIR}"

build_one() {
  local goos="$1"
  local goarch="$2"
  local out="$3"
  echo "==> build ${out}"
  CGO_ENABLED=0 GOOS="${goos}" GOARCH="${goarch}" go build -trimpath -ldflags="-s -w" -o "${DIST_DIR}/${out}" ./cmd/agent
}

cd "${ROOT_DIR}"

build_one darwin arm64 agent-darwin-arm64
build_one darwin amd64 agent-darwin-amd64
build_one linux amd64 agent-linux-amd64
build_one windows amd64 agent-windows-amd64.exe

if command -v sha256sum >/dev/null 2>&1; then
  (cd "${DIST_DIR}" && sha256sum agent-* > agent-checksums.txt)
elif command -v shasum >/dev/null 2>&1; then
  (cd "${DIST_DIR}" && shasum -a 256 agent-* > agent-checksums.txt)
else
  echo "WARN: sha256sum/shasum not found, skip checksums"
fi

echo "done: ${DIST_DIR}"
