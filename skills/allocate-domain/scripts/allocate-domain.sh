#!/usr/bin/env bash
# allocate-domain.sh - 快速为项目分配公网域名
# 用法: ./allocate-domain.sh <project_name> <port> [user_id] [base_domain] [api_url]

set -euo pipefail

# 默认值
API_URL="${5:-http://152.32.214.95:3002}"
PROJECT_NAME="${1:-}"
PORT="${2:-3000}"
USER_ID="${3:-user}"
BASE_DOMAIN="${4:-vyibc.com}"

# 验证参数
if [[ -z "$PROJECT_NAME" ]]; then
    echo "❌ 错误：项目名称是必须的"
    echo ""
    echo "用法："
    echo "  $0 <project_name> [port] [user_id] [base_domain] [api_url]"
    echo ""
    echo "示例："
    echo "  $0 myproject 3000"
    echo "  $0 todo 5318 alice vyibc.com"
    echo "  $0 app 8080 - - http://your-api:3002"
    exit 1
fi

# 验证端口是否为数字
if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
    echo "❌ 错误：端口必须是数字，得到: $PORT"
    exit 1
fi

echo "📋 分配域名信息："
echo "  项目名: $PROJECT_NAME"
echo "  本地端口: $PORT"
echo "  用户ID: $USER_ID"
echo "  基础域名: $BASE_DOMAIN"
echo "  API 地址: $API_URL"
echo ""

# 调用 API
echo "🔗 正在调用 API..."
RESPONSE=$(curl -s -X POST "$API_URL/control/api/sessions/register" \
    -H 'Content-Type: application/json' \
    -d "{
        \"user_id\": \"$USER_ID\",
        \"project\": \"$PROJECT_NAME\",
        \"target\": \"127.0.0.1:$PORT\",
        \"base_domain\": \"$BASE_DOMAIN\"
    }")

# 检查响应是否包含错误
if echo "$RESPONSE" | grep -q '"error"'; then
    echo "❌ API 返回错误："
    echo "$RESPONSE" | grep -o '"error":"[^"]*"'
    exit 1
fi

# 解析响应
PUBLIC_URL=$(echo "$RESPONSE" | grep -o '"public_url":"[^"]*"' | cut -d'"' -f4)
TUNNEL_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
TUNNEL_TOKEN=$(echo "$RESPONSE" | grep -o '"token":"[^"]*"' | head -1 | cut -d'"' -f4)
HOSTNAME=$(echo "$RESPONSE" | grep -o '"hostname":"[^"]*"' | cut -d'"' -f4)

# 输出结果
echo ""
echo "✅ 域名分配成功！"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "公网地址: $PUBLIC_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📌 完整信息："
echo "  Hostname: $HOSTNAME"
echo "  Tunnel ID: $TUNNEL_ID"
echo "  Token: $TUNNEL_TOKEN"
echo ""
echo "🚀 下一步："
echo "  1. 确保你的项目在 127.0.0.1:$PORT 上运行"
echo "  2. 访问 $PUBLIC_URL 即可从公网访问"
echo "  3. 如需启动 agent 以保持连接，使用返回的 agent_command"
echo ""

# 完整 JSON 响应（用于脚本处理）
echo "📊 完整 JSON 响应："
echo "$RESPONSE" | python3 -m json.tool 2>/dev/null || echo "$RESPONSE"
