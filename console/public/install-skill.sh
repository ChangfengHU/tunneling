#!/usr/bin/env bash
# install-skill.sh - install the registration-only allocate-domain skill
#
# 用法:
#   bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh)
#   bash <(curl -fsSL ...) --target codex
#   bash <(curl -fsSL ...) --target all
#
# 参数:
#   --skill  <name>                        指定 skill 名称（默认: allocate-domain）
#   --target codex|cursor|claude|gemini|antigravity|copilot|all
#                                          指定安装目标（不传则交互选择）

set -euo pipefail

SKILL_NAME="allocate-domain"
TARGET=""
CONSOLE_BASE_URL="https://tunnel.vyibc.com"
DOCS_URL="${CONSOLE_BASE_URL}/api-docs"
PUBLIC_BASE_URL="https://domain.vyibc.com"
SCRIPT_SELF_URL="${CONSOLE_BASE_URL}/install-skill.sh"

print_done() {
  echo ""
  echo "✅ 安装完成！"
  echo ""
  echo "现在你可以直接对 AI 说："
  echo "  给我的 myapp 项目分配一个公网域名，它在 localhost:3000 运行"
  echo ""
  echo "这个 skill 只负责注册域名，不会帮你启动项目。"
  echo "域名注册成功后，你只需要后续自己启动本地服务和本地 Agent。"
  echo ""
  echo "也可以查看公开接入文档："
  echo "  ${DOCS_URL}"
  echo ""
  echo "以后如果 GitHub Raw 访问受限，优先使用："
  echo "  bash <(curl -fsSL ${SCRIPT_SELF_URL})"
  echo ""
  echo "如果你想直接调用 HTTP API，请使用："
  echo "  ${PUBLIC_BASE_URL}/api/sessions/register"
  echo ""
}

# ── 参数解析 ─────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skill)  SKILL_NAME="$2"; shift 2 ;;
    --target) TARGET="$2";     shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

# ── 工具检测 ──────────────────────────────────────────────
if ! command -v curl &>/dev/null; then
  echo "❌ 需要 curl，请先安装"; exit 1
fi

write_skill_md() {
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  cat > "$dst" <<'EOF'
---
name: allocate-domain
description: >
  当用户说"给项目分配域名"、"为项目申请公网域名"、"allocate domain"、
  "assign public domain"、"给我的项目一个域名" 时自动触发。
  只负责注册公网域名与返回 tunnel 信息，不负责启动项目；若服务尚未运行，只需明确告知用户后续自行启动服务和 Agent。
---

# Allocate Domain

一句话注册公网域名。这个 skill 只做两件事：

- 确认要绑定的本地端口
- 注册域名并返回 tunnel 信息

不要在这个 skill 里启动、重启、构建、修复项目。分配域名和启动项目是两件事。

## 边界

- 只负责域名注册和 tunnel 凭证复用
- 不负责启动项目
- 不负责探测健康检查
- 不负责修复端口占用
- 如果用户还没有启动服务，只需明确告诉他：域名已经注册，但公网访问要等本地服务和 Agent 都启动后才会生效

## 执行规则

1. 优先从用户输入提取：
   - `PORT`
   - `SUBDOMAIN`
   - `PROJECT_NAME`
   - 是否要求管理员覆盖注册
2. 只有在用户没明确给端口时，才读取简单本地配置做推断：
   - `.tunnel-port`
   - `.env`
   - `.env.local`
   - `package.json` 里的端口提示
   - 当前目录名作为 `PROJECT_NAME` / `SUBDOMAIN` 的兜底
3. 不要运行启动脚本，不要尝试 `npm run dev`、`go run`、`restart.sh` 之类命令
4. 直接调用注册 API
5. 如果本机已有 `~/.tunneling/machine_state.json`，优先复用其中的 `tunnel_id` 和 `tunnel_token`
6. 返回 `public_url`、`tunnel_id`、`tunnel_token`、`agent_command`

## 何时需要用户手动处理

- 如果端口无法从用户输入或简单配置中确定：
  直接让用户明确告诉你端口
- 如果用户问“为什么域名访问还是 502 / 404”：
  明确说明通常是本地服务未启动，或本地 Agent 未启动
- 如果用户要求“顺便把项目也启动起来”：
  那不是这个 skill 的职责，应该使用单独的启动 / tunnel skill

## 返回给用户的话术要求

成功时要明确区分三件事：

1. 域名已经注册成功
2. 是否已经知道目标端口
3. 公网是否依赖用户后续自己启动服务 / Agent

返回格式保持简洁，类似：

```text
✅ 域名分配成功

🌐 公网地址: https://myapp.vyibc.com
🎯 本地目标: 127.0.0.1:3000

后续你只需要：
1. 确保本地服务监听 3000
2. 启动本地 Agent
3. 再访问上面的公网地址

如果服务或 Agent 还没启动，公网通常会返回 502/404，这不影响域名注册本身。
```

## 用法示例

- `给 3000 端口分配公网域名，二级域名用 myapp`
- `给当前项目分配域名`
- `Allocate a domain for localhost:5318 using subdomain todo`
- `以管理员方式把 8080 端口注册成 admin.vyibc.com`

## 脚本

优先使用：

```bash
skills/allocate-domain/scripts/allocate-domain.sh
```

脚本是注册器，不做启动动作。若旧的 machine tunnel 已失效，脚本会自动退回到新建 tunnel 再重试。
EOF
}

write_openai_yaml() {
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  cat > "$dst" <<'EOF'
interface:
  display_name: "Allocate Domain"
  short_description: "只注册公网域名并返回 tunnel 信息，不负责启动项目。"
  default_prompt: |
    Goal: Register a public domain for the user's local service. This skill is registration-only.

    Rules:
    1. Extract PORT, SUBDOMAIN, PROJECT_NAME, BASE_DOMAIN, and whether admin override was explicitly requested.
    2. If PORT is missing, inspect only simple local config such as .tunnel-port, .env, .env.local, and package.json port hints.
    3. Do not start, restart, build, or repair the project.
    4. Reuse ~/.tunneling/machine_state.json when it contains tunnel_id and tunnel_token.
    5. Use skills/allocate-domain/scripts/allocate-domain.sh to register the domain.
    6. If port still cannot be inferred, ask the user for the port instead of trying to start the service.
    7. Tell the user clearly that domain registration can succeed even when the local service is not running yet, but public access will require both the local service and the local Agent later.

    Reply concisely with:
    - public_url
    - target port
    - tunnel_id
    - next steps: start local service if needed, start local Agent, then visit the URL
policy:
  allow_implicit_invocation: true
EOF
}

write_allocate_domain_script() {
  local dst="$1"
  mkdir -p "$(dirname "$dst")"
  cat > "$dst" <<'EOF'
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
EOF
  chmod +x "$dst"
}

# ── 交互菜单（未指定 --target 时显示）────────────────────
if [[ -z "$TARGET" ]]; then
  echo ""
  echo "🛠  选择要安装到哪个 AI 工具："
  echo ""
  echo "  1) Codex        (~/.codex/skills/)"
  echo "  2) Cursor       (~/.cursor/skills/)"
  echo "  3) Claude       (~/.claude/plugins/)"
  echo "  4) Gemini       (~/.gemini/skills/)"
  echo "  5) Antigravity  (~/.gemini/antigravity/knowledge/)"
  echo "  6) Copilot      (~/.github-copilot/skills/)"
  echo "  7) 全部安装"
  echo ""
  read -rp "请输入编号 [1-7]: " CHOICE
  case "$CHOICE" in
    1) TARGET="codex"       ;;
    2) TARGET="cursor"      ;;
    3) TARGET="claude"      ;;
    4) TARGET="gemini"      ;;
    5) TARGET="antigravity" ;;
    6) TARGET="copilot"     ;;
    7) TARGET="all"         ;;
    *) echo "❌ 无效选项"; exit 1 ;;
  esac
fi

# ── 各工具安装函数 ────────────────────────────────────────

install_codex() {
  local dir="${HOME}/.codex/skills/${SKILL_NAME}"
  echo "  📦 Codex → $dir"
  mkdir -p "$dir/agents" "$dir/scripts"
  write_skill_md "$dir/SKILL.md"
  write_openai_yaml "$dir/agents/openai.yaml"
  write_allocate_domain_script "$dir/scripts/${SKILL_NAME}.sh"
}

install_cursor() {
  local dir="${HOME}/.cursor/skills/${SKILL_NAME}"
  echo "  📦 Cursor → $dir"
  mkdir -p "$dir"
  write_skill_md "$dir/SKILL.md"
}

install_claude() {
  local dir="${HOME}/.claude/plugins/${SKILL_NAME}/skills/${SKILL_NAME}"
  echo "  📦 Claude → $dir"
  mkdir -p "$dir/agents"
  write_skill_md "$dir/SKILL.md"
  write_openai_yaml "$dir/agents/openai.yaml"
}

install_gemini() {
  local dir="${HOME}/.gemini/skills/${SKILL_NAME}"
  echo "  📦 Gemini → $dir"
  mkdir -p "$dir"
  write_skill_md "$dir/SKILL.md"
}

install_antigravity() {
  local dir="${HOME}/.gemini/antigravity/knowledge/${SKILL_NAME}"
  echo "  📦 Antigravity → $dir"
  mkdir -p "$dir"
  write_skill_md "$dir/SKILL.md"
}

install_copilot() {
  local dir="${HOME}/.github-copilot/skills/${SKILL_NAME}"
  echo "  📦 Copilot → $dir"
  mkdir -p "$dir/agents"
  write_skill_md "$dir/SKILL.md"
  write_openai_yaml "$dir/agents/openai.yaml"
}

# ── 执行安装 ──────────────────────────────────────────────
echo ""
echo "🚀 安装 skill: ${SKILL_NAME}  →  ${TARGET}"
echo ""
echo "   mode: registration-only"
echo ""

case "$TARGET" in
  codex)       install_codex       ;;
  cursor)      install_cursor      ;;
  claude)      install_claude      ;;
  gemini)      install_gemini      ;;
  antigravity) install_antigravity ;;
  copilot)     install_copilot     ;;
  all)
    install_codex
    install_cursor
    install_claude
    install_gemini
    install_antigravity
    install_copilot
    ;;
  *) echo "❌ 不支持的 target: $TARGET"; exit 1 ;;
esac

# ── 完成 ─────────────────────────────────────────────────
print_done
