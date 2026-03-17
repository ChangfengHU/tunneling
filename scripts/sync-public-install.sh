#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${ROOT_DIR}/scripts/install-skill.sh"
DST="${ROOT_DIR}/console/public/install-skill.sh"

mkdir -p "$(dirname "${DST}")"
cp "${SRC}" "${DST}"
chmod 0644 "${DST}"

echo "synced: ${DST}"
