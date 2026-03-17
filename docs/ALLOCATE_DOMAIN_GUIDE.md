# 快速域名分配 Skill 使用指南

## 概述

`allocate-domain` skill 让用户一句话即可为任何本地服务注册公网域名，但注册后需启动本地 Agent 才能生效。适合：
- 已有本地服务在运行，需要公网访问
- 想指定固定二级域名
- 想让同一台机器上的多个服务共用一个 tunnel / 一个 agent

## 三种使用方式

### 方式 1：自然语言触发（推荐）

直接对 Copilot 说：

```
给我的 todo 项目分配一个公网域名，它在 localhost:3000 运行

为 myapp 项目申请域名，端口是 5318

allocate a public domain for my project on port 8080

给 chatbot 项目一个公网 URL，端口 4000，用户 alice，域名 example.com
```

**Skill 会自动：**
1. 优先提取端口和想用的二级域名，没说时再从项目基础配置里推断
2. 默认按普通用户注册；只有明确说管理员覆盖时才使用管理员密钥
3. 优先复用 `~/.tunneling/machine_state.json` 里的 tunnel 凭证
4. 调用 API 注册 tunnel 或新增 route
5. 返回公网地址和 agent 启动命令

提示：如果未启动 Agent，公网访问通常会出现 502/404。

### 方式 2：直接运行脚本

在命令行运行（本地或远程服务器）：

```bash
# 基本用法（项目名 + 端口）
./skills/allocate-domain/scripts/allocate-domain.sh myproject 3000

# 指定用户 ID
./skills/allocate-domain/scripts/allocate-domain.sh todo 5318 alice

# 指定用户 ID + 基础域名
./skills/allocate-domain/scripts/allocate-domain.sh app 8080 bob example.com

# 使用自定义 API 地址
./skills/allocate-domain/scripts/allocate-domain.sh myapp 4000 user vyibc.com http://your-api:3002
```

**输出示例：**
```
📋 分配域名信息：
  项目名: myproject
  本地端口: 3000
  用户ID: user
  基础域名: vyibc.com

✅ 域名分配成功！

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
公网地址: http://myproject.vyibc.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 完整信息：
  Hostname: myproject.vyibc.com
  Tunnel ID: fa56413f-7261-44f0-b076-dccef24dc7e9
  Token: 4AzizZOBHF00DIb5qho-8ayo6IY8aMCLAYYVI0uCgu4
  凭证文件: ~/.tunneling/machine_state.json
```

### 方式 3：API 直接调用

```bash
curl -s -X POST 'https://domain.vyibc.com/api/sessions/register' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "alice",
    "project": "myproject",
    "target": "127.0.0.1:3000",
    "base_domain": "vyibc.com"
  }' | jq
```

## 参数说明

| 参数 | 说明 | 默认值 | 例子 |
|------|------|--------|------|
| `PROJECT_NAME` | 项目名称 | 必需 | `myproject`, `todo`, `app` |
| `PORT` | 本地服务端口 | `3000` | `5318`, `8080`, `4000` |
| `USER_ID` | 用户标识 | `user` | `alice`, `bob`, `dev` |
| `BASE_DOMAIN` | 域名后缀 | `vyibc.com` | `example.com`, `test.io` |
| `API_URL` | API 服务地址 | `https://domain.vyibc.com` | 自定义 API 地址 |

## 返回的信息含义

分配成功后会返回 JSON，包含：

```json
{
  "public_url": "http://myproject.vyibc.com",
  "tunnel": {
    "id": "fa56413f-7261-44f0-b076-dccef24dc7e9",
    "name": "myproject-alice-uh81",
    "token": "4AzizZOBHF00DIb5qho-8ayo6IY8aMCLAYYVI0uCgu4"
  },
  "route": {
    "hostname": "myproject.vyibc.com",
    "target": "127.0.0.1:3000",
    "is_enabled": true
  },
  "agent_command": "./agent -server ws://domain.vyibc.com/connect -token 4AzizZOBHF00DIb5qho-8ayo6IY8aMCLAYYVI0uCgu4 ... -config ~/.tunneling/machine-agent/config.json"
}
```

### 字段解释

- **public_url**: 公网访问地址，可直接在浏览器打开（需要本地服务在运行）
- **tunnel_id**: Tunnel 的唯一标识
- **tunnel_token**: 用于 Agent 连接的认证令牌
- **hostname**: 分配的二级域名
- **agent_command**: 启动 Agent 以保持连接的完整命令

## 常见使用场景

### 场景 1：本地开发，临时公网访问

```bash
# 1. 启动本地服务
npm run dev  # 运行在 localhost:3000

# 2. 另开终端，分配域名
./scripts/allocate-domain.sh myproject 3000

# 3. 得到公网地址后，别人可以通过这个地址访问你的本地服务
✅ 公网地址：http://myproject.vyibc.com
```

### 场景 2：为多个项目快速分配域名

```bash
# 项目 1
./scripts/allocate-domain.sh frontend 3000

# 项目 2
./scripts/allocate-domain.sh api 8000

# 项目 3
./scripts/allocate-domain.sh worker 5000
```

### 场景 3：在服务器上为生产服务分配域名

```bash
# 在 152.32.214.95 或其他服务器上
ssh root@your-server
cd /path/to/tunneling
./skills/allocate-domain/scripts/allocate-domain.sh production-app 8080 admin vyibc.com
```

### 场景 4：使用 Copilot 自然语言触发

```
"给我的新项目分配一个公网域名，它在本地 5318 端口运行"

Copilot 会自动：
1. 提取项目名（从当前目录或用户描述）
2. 提取端口：5318
3. 调用 skill
4. 返回公网地址
```

## 后续步骤

获得公网域名后：

1. **访问服务**：在浏览器打开 `public_url`
   - 前提：本地服务必须在指定端口运行

2. **启动 Agent**（可选）：如果想要长期保持连接
   ```bash
   # 使用返回的 agent_command
   ./agent -server ws://domain.vyibc.com/connect \
     -token 4AzizZOBHF00DIb5qho-8ayo6IY8aMCLAYYVI0uCgu4 \
     ...
   ```

3. **管理域名**：访问 https://domain.vyibc.com/login 管理 tunnel 和 route

## 故障排除

### 问题：API 返回错误
**症状**：`curl: (7) Failed to connect to domain.vyibc.com`
**解决**：检查网络连接，确保能访问 https://domain.vyibc.com

### 问题：域名分配成功但访问失败
**症状**：`404 Not Found` 或 `Connection refused`
**解决**：
1. 检查本地服务是否在指定端口运行：`lsof -i :3000`
2. 确保防火墙允许访问该端口
3. 启动本地服务：`npm run dev`（如果还没启动）

### 问题：获得的域名已被使用
**症状**：你期望得到 `myapp.vyibc.com`，但返回了 `myapp-xxxxxx.vyibc.com`
**解决**：说明固定二级域名已被占用。普通用户会自动回退到随机后缀域名；管理员可显式带 `admin_key` 覆盖固定域名

## 参考链接

- Skill 源代码：`skills/allocate-domain/`
- API 文档：`https://tunnel.vyibc.com/api-docs`
- Control API：`https://domain.vyibc.com/api/`
