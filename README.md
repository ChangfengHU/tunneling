# Simple Tunnel Service (No Docker)

这是一个最小可运行的内网穿透原型，包含三个进程和一个前端控制台：

- `server`: 公网网关 + agent 控制通道
- `agent`: 本地连接器 + 本地管理页面
- `control`（新增）: 基于 Supabase 的 Tunnel/映射管理 API
- `console`（新增）: Next.js 管理后台页面（Tunnel 列表、映射配置、启动命令、日志）

## 功能

- 本地启动 `agent` 后，打开管理页面配置 `子域名 -> 本地IP:端口`
- `agent` 会把映射同步到 `server`
- 外部访问该子域名时，`server` 把 HTTP 请求转发给 `agent`，再转发到你本地服务

## 目录

- `cmd/server/main.go`: server 入口
- `cmd/agent/main.go`: agent 入口
- `cmd/control/main.go`: control 入口
- `internal/server/server.go`: server 核心逻辑
- `internal/agent/service.go`: agent + 管理页面
- `internal/agent/config.go`: 映射配置持久化
- `internal/control/*`: control + supabase 客户端
- `console/*`: Next.js 控制台
- `internal/protocol/protocol.go`: 通信协议
- `sql/tunnel_schema.sql`: Supabase 表结构（统一 `tunnel_` 前缀）

## 本地开发运行

前置条件：安装 Go 1.22+

1. 启动 server（公网机器）

```bash
go run ./cmd/server -public-addr :8080 -control-addr :9000
```

或使用单端口模式（推荐，`/connect` 和公网转发共用一个端口）：

```bash
go run ./cmd/server -addr :80
```

2. 启动 agent（你的内网机器）

```bash
go run ./cmd/agent \
  -server ws://<server-ip>:9000/connect \
  -token your-token \
  -admin-addr 127.0.0.1:7000
```

如果 server 使用单端口 `-addr :80`，agent 改为：

```bash
go run ./cmd/agent \
  -server ws://<server-ip>/connect \
  -token your-token \
  -admin-addr 127.0.0.1:7000
```

3. 打开本地管理页

```text
http://127.0.0.1:7000
```

4. 在页面新增映射

- 域名: `app.example.com`
- 本地目标: `127.0.0.1:3000`

## Supabase 控制面（云端管理 Tunnel 与映射）

1. 在 Supabase SQL Editor 执行：

```sql
-- 文件：sql/tunnel_schema.sql
```

2. 启动 control 服务：

```bash
SUPABASE_URL=https://<project>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx \
AGENT_SERVER_WS=ws://<server-ip>/connect \
AGENT_CONFIG_URL=http://<server-ip>/_tunnel/agent/routes \
go run ./cmd/control -addr :18100
```

3. 创建 tunnel：

```bash
curl -sS -X POST http://127.0.0.1:18100/api/tunnels \
  -H 'Content-Type: application/json' \
  -d '{"name":"demo-user-1"}'
```

4. 创建映射：

```bash
curl -sS -X POST http://127.0.0.1:18100/api/routes \
  -H 'Content-Type: application/json' \
  -d '{"tunnel_id":"<tunnel_id>","hostname":"demo1.example.com","target":"127.0.0.1:3000"}'
```

5. 本地 agent 只带 `tunnel_id` + `tunnel_token` 启动（由 control 返回命令）：

```bash
go run ./cmd/agent \
  -server ws://<server-ip>/connect \
  -token <tunnel_token> \
  -route-sync-url http://<server-ip>/_tunnel/agent/routes \
  -tunnel-id <tunnel_id> \
  -tunnel-token <tunnel_token> \
  -admin-addr 127.0.0.1:7000
```

推荐 `-route-sync-url` 统一走 `http://<server-ip>/_tunnel/agent/routes`，这样 agent 仅依赖公网 `80/443`，不需要额外开放 `18100`。

### 控制 API（补充）

- `GET /api/tunnels`: tunnel 列表
- `POST /api/tunnels`: 创建 tunnel
- `POST /api/routes`: 新增或更新映射
- `GET /api/tunnels/{id}/routes`: tunnel 下映射
- `GET /api/tunnels/{id}/command`: agent 启动命令
- `GET /api/logs?tunnel_id={id}&limit=200`: 控制面日志

## Web 控制台（Next.js）

目录：`console/`

1. 安装依赖

```bash
cd console
npm install
```

2. 本地开发

```bash
CONTROL_API_BASE=http://127.0.0.1:18100 npm run dev
```

3. 生产构建

```bash
npm run build
npm run start
```

控制台默认在 `http://127.0.0.1:3002`，通过 Next.js rewrite 把 `/control/*` 代理到 `CONTROL_API_BASE`。

### Docker 镜像部署（推荐）

本仓库已提供脚本：

- 本地构建并推送：`scripts/console-build-push.sh`
- 阿里云拉镜像并启动：`scripts/console-deploy-aliyun.sh`

1. 本地执行（构建 + 推送）：

```bash
export DOCKER_USERNAME=你的仓库账号
export DOCKER_PASSWORD=你的仓库密码
export REGISTRY=registry.cn-hangzhou.aliyuncs.com
export NAMESPACE=vyibc
export IMAGE_NAME=tunneling-console
export TAG=latest

./scripts/console-build-push.sh
```

2. 在阿里云写入配置文件（推荐）：

```bash
cat >/opt/tunneling/console.env <<'EOF'
DOCKER_USERNAME=你的仓库账号
DOCKER_PASSWORD=你的仓库密码
REGISTRY=registry.cn-hangzhou.aliyuncs.com
NAMESPACE=vyibc
IMAGE_NAME=tunneling-console
TAG=latest
PORT=3002
CONTROL_API_BASE=http://127.0.0.1:18100
EOF
```

3. 在阿里云执行（拉取 + 启动）：

```bash
./scripts/console-deploy-aliyun.sh
```

容器默认 `--network host`，所以页面地址是 `http://<服务器IP>:3002`。

### 本地 Agent Docker 部署

脚本：

- 构建并推送镜像：`scripts/agent-build-push.sh`
- 本地机器拉取并启动：`scripts/agent-deploy-local.sh`

1. 构建并推送 `tunneling-agent`：

```bash
export DOCKER_USERNAME=你的仓库账号
export DOCKER_PASSWORD=你的仓库密码
export REGISTRY=registry.cn-hangzhou.aliyuncs.com
export NAMESPACE=vyibc
export IMAGE_NAME=tunneling-agent
export TAG=latest

./scripts/agent-build-push.sh
```

2. 在本地机器写配置文件（默认路径：`$HOME/.tunneling-agent/agent.env`）：

```bash
mkdir -p "$HOME/.tunneling-agent"
cp deploy/examples/agent.env.example "$HOME/.tunneling-agent/agent.env"
# 然后编辑 TUNNEL_ID / AGENT_TOKEN / TUNNEL_TOKEN
```

3. 本地机器直接执行：

```bash
./scripts/agent-deploy-local.sh
```

说明：

- 脚本会自动读取 `$HOME/.tunneling-agent/agent.env`，并支持重复执行（会重建容器）。
- 若 agent 跑在 Docker，映射目标建议用 `host.docker.internal:<port>`，不要用 `127.0.0.1:<port>`。

## DNS 与访问

要让 `app.example.com` 可访问：

- 配置 DNS `A` 记录：`app.example.com -> <server 公网IP>`
- 访问请求会打到 `server` 的 `:8080`

生产建议：把 `:8080` 放在 `Nginx/Caddy` 后面，由它监听 `443` 提供 HTTPS，再反代到 `127.0.0.1:8080`。

## 当前限制（MVP）

- 仅支持 HTTP/HTTPS 请求转发（不是原始 TCP）
- 单节点内存路由，无数据库
- token 为简单标识，不是完整鉴权体系
- 无多租户权限管理

## 作为系统服务运行（可选）

仓库提供了 systemd 模板：

- `deploy/systemd/tunnel-server.service`
- `deploy/systemd/tunnel-agent.service`
- `deploy/systemd/tunnel-control.service`
- `deploy/systemd/tunnel-agent-managed.service`

示例步骤：

```bash
mkdir -p /opt/tunneling/bin
cp /path/to/server /opt/tunneling/bin/server
cp /path/to/agent /opt/tunneling/bin/agent
cp deploy/systemd/tunnel-server.service /etc/systemd/system/
cp deploy/systemd/tunnel-agent.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now tunnel-server
systemctl enable --now tunnel-agent
```

上线前请先编辑 `tunnel-agent.service` 里的 `YOUR_SERVER_IP` 和 `YOUR_TOKEN`。

`tunnel-control.service` 依赖 `/opt/tunneling/control.env`，示例：

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
AGENT_SERVER_WS=ws://<server-ip>/connect
AGENT_CONFIG_URL=http://<server-ip>/_tunnel/agent/routes
DEFAULT_AGENT_ADMIN_ADDR=127.0.0.1:17001
```

## 下一步建议

1. 增加数据库存储（PostgreSQL/MySQL）
2. 增加正式鉴权（JWT + API Key + 用户体系）
3. 支持 TLS 终止 + 自动证书
4. 支持 WebSocket 透传与流式转发
5. 做 SaaS 控制台与租户隔离
