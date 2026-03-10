#!/usr/bin/env bash
# install-skill.sh - 一键安装 allocate-domain skill
#
# 用法:
#   bash <(curl -fsSL https://raw.githubusercontent.com/ChangfengHU/auto-domain/main/scripts/install-skill.sh)
#   bash <(curl -fsSL ...) --target codex
#   bash <(curl -fsSL ...) --target all
#
# 参数:
#   --skill  <name>                        指定 skill 名称（默认: allocate-domain）
#   --target codex|cursor|claude|gemini|antigravity|copilot|all
#                                          指定安装目标（不传则交互选择）

set -euo pipefail

RAW_BASE="https://raw.githubusercontent.com/ChangfengHU/auto-domain/main"
SKILL_NAME="allocate-domain"
TARGET=""

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

# ── 下载函数 ──────────────────────────────────────────────
fetch() {
  # fetch <remote-path-relative-to-skills/> <local-dest-file>
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  curl -fsSL "${RAW_BASE}/skills/${src}" -o "$dst"
  echo "    ↓ $src"
}

# ── 各工具安装函数 ────────────────────────────────────────

install_codex() {
  local dir="${HOME}/.codex/skills/${SKILL_NAME}"
  echo "  📦 Codex → $dir"
  mkdir -p "$dir/agents" "$dir/scripts"
  fetch "${SKILL_NAME}/SKILL.md"                   "$dir/SKILL.md"
  fetch "${SKILL_NAME}/agents/openai.yaml"         "$dir/agents/openai.yaml"
  fetch "${SKILL_NAME}/scripts/${SKILL_NAME}.sh"   "$dir/scripts/${SKILL_NAME}.sh"
  chmod +x "$dir/scripts/${SKILL_NAME}.sh"
}

install_cursor() {
  local dir="${HOME}/.cursor/skills/${SKILL_NAME}"
  echo "  📦 Cursor → $dir"
  mkdir -p "$dir"
  fetch "${SKILL_NAME}/SKILL.md" "$dir/SKILL.md"
}

install_claude() {
  local dir="${HOME}/.claude/plugins/${SKILL_NAME}/skills/${SKILL_NAME}"
  echo "  📦 Claude → $dir"
  mkdir -p "$dir/agents"
  fetch "${SKILL_NAME}/SKILL.md"           "$dir/SKILL.md"
  fetch "${SKILL_NAME}/agents/openai.yaml" "$dir/agents/openai.yaml"
}

install_gemini() {
  local dir="${HOME}/.gemini/skills/${SKILL_NAME}"
  echo "  📦 Gemini → $dir"
  mkdir -p "$dir"
  fetch "${SKILL_NAME}/SKILL.md" "$dir/SKILL.md"
}

install_antigravity() {
  local dir="${HOME}/.gemini/antigravity/knowledge/${SKILL_NAME}"
  echo "  📦 Antigravity → $dir"
  mkdir -p "$dir"
  fetch "${SKILL_NAME}/SKILL.md" "$dir/SKILL.md"
}

install_copilot() {
  local dir="${HOME}/.github-copilot/skills/${SKILL_NAME}"
  echo "  📦 Copilot → $dir"
  mkdir -p "$dir/agents"
  fetch "${SKILL_NAME}/SKILL.md"           "$dir/SKILL.md"
  fetch "${SKILL_NAME}/agents/openai.yaml" "$dir/agents/openai.yaml"
}

# ── 执行安装 ──────────────────────────────────────────────
echo ""
echo "🚀 安装 skill: ${SKILL_NAME}  →  ${TARGET}"
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
echo ""
echo "✅ 安装完成！"
echo ""
echo "现在你可以对 AI 说："
echo "   给我的 myapp 项目分配一个公网域名，它在 localhost:3000 运行"
echo ""
