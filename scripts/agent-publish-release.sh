#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="${DIST_DIR:-${ROOT_DIR}/dist}"
GITHUB_REPO="${GITHUB_REPO:-ChangfengHU/tunneling}"
TAG="${TAG:-agent-v0.1.0}"
TITLE="${TITLE:-${TAG}}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

if [[ -z "${GITHUB_TOKEN}" ]]; then
  echo "ERROR: GITHUB_TOKEN is required" >&2
  exit 1
fi

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "ERROR: dist dir not found: ${DIST_DIR}" >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: missing command '$1'" >&2
    exit 1
  fi
}

require_cmd curl
require_cmd python3

api_base="https://api.github.com/repos/${GITHUB_REPO}"
auth_header="Authorization: Bearer ${GITHUB_TOKEN}"

tmp_json="$(mktemp)"
status="$(curl -sS -o "${tmp_json}" -w "%{http_code}" \
  -H "${auth_header}" \
  -H "Accept: application/vnd.github+json" \
  "${api_base}/releases/tags/${TAG}")"

if [[ "${status}" == "200" ]]; then
  release_json="$(cat "${tmp_json}")"
else
  payload="$(python3 - "${TAG}" "${TITLE}" <<'PY'
import json
import sys
tag, title = sys.argv[1], sys.argv[2]
print(json.dumps({
    "tag_name": tag,
    "name": title,
    "draft": False,
    "prerelease": False,
    "generate_release_notes": True,
}))
PY
)"
  create_json="$(mktemp)"
  create_status="$(curl -sS -o "${create_json}" -w "%{http_code}" \
    -X POST \
    -H "${auth_header}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/json" \
    --data "${payload}" \
    "${api_base}/releases")"
  if [[ "${create_status}" != "201" ]]; then
    echo "ERROR: create release failed status=${create_status}" >&2
    cat "${create_json}" >&2
    rm -f "${tmp_json}" "${create_json}"
    exit 1
  fi
  release_json="$(cat "${create_json}")"
  rm -f "${create_json}"
fi
rm -f "${tmp_json}"

upload_url="$(echo "${release_json}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["upload_url"].split("{")[0])')"
release_id="$(echo "${release_json}" | python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])')"

assets_json="$(mktemp)"
assets_status="$(curl -sS -o "${assets_json}" -w "%{http_code}" \
  -H "${auth_header}" \
  -H "Accept: application/vnd.github+json" \
  "${api_base}/releases/${release_id}/assets?per_page=100")"
if [[ "${assets_status}" != "200" ]]; then
  echo "ERROR: list assets failed status=${assets_status}" >&2
  cat "${assets_json}" >&2
  rm -f "${assets_json}"
  exit 1
fi

for f in "${DIST_DIR}"/agent-*; do
  [[ -f "${f}" ]] || continue
  name="$(basename "${f}")"
  old_id="$(python3 - "${assets_json}" "${name}" <<'PY'
import json
import sys
path, target = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as f:
    arr = json.load(f)
for item in arr:
    if item.get("name") == target:
        print(item.get("id"))
        break
PY
)"
  if [[ -n "${old_id}" ]]; then
    curl -sS -X DELETE \
      -H "${auth_header}" \
      -H "Accept: application/vnd.github+json" \
      "${api_base}/releases/assets/${old_id}" >/dev/null
  fi
done
rm -f "${assets_json}"

for f in "${DIST_DIR}"/agent-*; do
  [[ -f "${f}" ]] || continue
  name="$(basename "${f}")"
  echo "==> upload ${name}"
  curl -sS \
    -X POST \
    -H "${auth_header}" \
    -H "Accept: application/vnd.github+json" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"${f}" \
    "${upload_url}?name=${name}" >/dev/null
done

echo "release: https://github.com/${GITHUB_REPO}/releases/tag/${TAG}"
