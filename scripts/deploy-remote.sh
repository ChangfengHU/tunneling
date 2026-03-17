#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-152.32.214.95}"
REMOTE_DIR="${REMOTE_DIR:-/opt/tunneling}"
SSH_PASSWORD="${SSH_PASSWORD:-}"

TMP_DIR="${TMP_DIR:-/tmp/tunneling-release}"
SSH_OPTS=(-o StrictHostKeyChecking=no)

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing command: $1" >&2
    exit 1
  fi
}

ssh_cmd() {
  if [[ -n "${SSH_PASSWORD}" ]]; then
    SSHPASS="${SSH_PASSWORD}" sshpass -e ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  else
    ssh "${SSH_OPTS[@]}" "${REMOTE_USER}@${REMOTE_HOST}" "$@"
  fi
}

rsync_cmd() {
  if [[ -n "${SSH_PASSWORD}" ]]; then
    SSHPASS="${SSH_PASSWORD}" rsync --rsh="sshpass -e ssh ${SSH_OPTS[*]}" "$@"
  else
    rsync -e "ssh ${SSH_OPTS[*]}" "$@"
  fi
}

need_cmd go
need_cmd rsync
need_cmd ssh

mkdir -p "${TMP_DIR}"

echo "==> sync public installer from local source"
"${ROOT_DIR}/scripts/sync-public-install.sh"

echo "==> build linux binaries locally"
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "${TMP_DIR}/control" "${ROOT_DIR}/cmd/control"
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o "${TMP_DIR}/server" "${ROOT_DIR}/cmd/server"

echo "==> sync workspace to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
rsync_cmd -az --delete \
  --exclude '.git' \
  --exclude '.claude' \
  --exclude '.local' \
  --exclude 'console/node_modules' \
  --exclude 'console/.next' \
  --exclude '.next' \
  --exclude 'control.env' \
  --exclude 'console.env' \
  "${ROOT_DIR}/" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "==> upload service binaries"
rsync_cmd -az "${TMP_DIR}/control" "${TMP_DIR}/server" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/bin/"

echo "==> restart remote services and rebuild console image"
ssh_cmd "set -euo pipefail
cd '${REMOTE_DIR}'
chmod +x '${REMOTE_DIR}/bin/control' '${REMOTE_DIR}/bin/server'
test -f '${REMOTE_DIR}/control.env'
test -f '${REMOTE_DIR}/console.env'
systemctl daemon-reload
systemctl restart tunneling-control.service
systemctl restart tunneling-server.service
set -a
source '${REMOTE_DIR}/console.env'
set +a
echo \"\$DOCKER_PASSWORD\" | docker login \"\$REGISTRY\" --username \"\$DOCKER_USERNAME\" --password-stdin >/dev/null 2>&1
docker build -f '${REMOTE_DIR}/console/Dockerfile' -t \"\$REGISTRY/\$NAMESPACE/\$IMAGE_NAME:\$TAG\" '${REMOTE_DIR}/console'
docker rm -f tunneling-console >/dev/null 2>&1 || true
docker run -d --name tunneling-console --restart always --network host \
  -e NODE_ENV=production \
  -e PORT=\"\$PORT\" \
  -e CONTROL_API_BASE=\"\$CONTROL_API_BASE\" \
  \"\$REGISTRY/\$NAMESPACE/\$IMAGE_NAME:\$TAG\" >/dev/null
sleep 3
echo '--- control ---'
systemctl --no-pager --full status tunneling-control.service | sed -n '1,12p'
echo '--- server ---'
systemctl --no-pager --full status tunneling-server.service | sed -n '1,12p'
echo '--- control health ---'
curl -fsS http://127.0.0.1:18100/healthz
echo
echo '--- gateway health ---'
curl -fsS http://127.0.0.1/healthz
echo
echo '--- console health ---'
curl -I -sS http://127.0.0.1:\${PORT} | sed -n '1,8p'"

echo "DONE: deployed to ${REMOTE_HOST}"
