# 新项目接入文档（内网穿透）

本文用于把一个新的 Next.js/React 项目快速接入现有 tunneling 平台，并拿到可访问的公网二级域名。

## 1. 前置条件

- 你的控制台/API 已可访问：`http://152.32.214.95:3002/control`
- DNS 已托管到 Cloudflare，且二级域名可解析到你的网关
- 本地已安装 `node` / `npm` / `python3` / `curl`
- 不要求预装 agent，`project-tunnel.sh` 会自动下载

## 2. 一键接入（推荐）

把 `scripts/project-tunnel.sh` 放到你的项目根目录，执行：

```bash
chmod +x ./project-tunnel.sh
./project-tunnel.sh start
```

默认会自动：

- 从当前目录读取项目名和端口（`package.json.name`、`.tunnel-port`、`.env`）
- 使用固定域名模式：`<project>-<user>.vyibc.com`
- 自动下载 agent（平台：`darwin-arm64` / `darwin-amd64` / `linux-amd64` / `windows-amd64`）
- 启动项目和 agent，并输出 `public_url`

常用命令：

```bash
./project-tunnel.sh status
./project-tunnel.sh stop
```

## 3. 一次性注册 Tunnel + 子域名（手动方式）

推荐使用会话注册接口（避免 tunnel/域名冲突）：

```bash
curl -sS -X POST 'http://152.32.214.95:3002/control/api/sessions/register' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "user_id": "u-hcf",
    "project": "todo-katong",
    "base_domain": "vyibc.com",
    "target": "127.0.0.1:5318"
  }'
```

返回里会包含：

- `tunnel.id`
- `tunnel.token`
- `route.hostname`（随机后缀，避免冲突）
- `public_url`
- `agent_command`

## 4. 启动项目（生产模式）

不要用 `next dev`，要用生产模式：

```bash
cd /path/to/your-project
npm install
npm run build
npm run start -- -p 5318
```

说明：

- 端口可改，但要和注册时 `target` 一致
- 生产模式首屏更快、更稳定

## 5. 启动 Agent（二选一）

### 4.1 直接二进制启动

```bash
/path/to/tunneling/bin/agent \
  -server ws://152.32.214.95/connect \
  -token <tunnel_token> \
  -route-sync-url http://152.32.214.95/_tunnel/agent/routes \
  -tunnel-id <tunnel_id> \
  -tunnel-token <tunnel_token> \
  -admin-addr 127.0.0.1:17005
```

### 4.2 Docker 启动（推荐长期运行）

先准备 `agent.env`（可参考 `deploy/examples/agent.env.example`）：

- `TUNNEL_ID=<tunnel_id>`
- `AGENT_TOKEN=<tunnel_token>`
- `TUNNEL_TOKEN=<tunnel_token>`
- `SERVER_WS=ws://152.32.214.95/connect`
- `ROUTE_SYNC_URL=http://152.32.214.95/_tunnel/agent/routes`
- `ADMIN_ADDR=0.0.0.0:17005`

执行：

```bash
cd /Users/huchangfeng/code/tunneling
./scripts/agent-deploy-local.sh
```

如果 agent 在 Docker 中，目标项目建议填 `host.docker.internal:<port>`，不要填 `127.0.0.1:<port>`。

## 6. 验证

```bash
# 1) 看 agent 是否在线
curl -sS http://127.0.0.1:17005/api/status

# 2) 看域名是否可访问
curl -I http://<your-subdomain>.vyibc.com/
```

预期：

- `api/status` 中 `connected=true`
- 域名返回 `200`（或业务页面状态码）

## 7. 常见问题排查

- `404 page not found`：
  - route 已写入，但该 tunnel 的 agent 没连上
- `502 bad gateway`：
  - agent 已连上，但 target 端口服务未启动或端口写错
- 首屏慢（7-10 秒）：
  - 项目使用了 `next dev` 或项目冷启动慢；改为 `npm run build && npm run start`
- 域名冲突：
  - 不要手工复用固定二级域名，优先使用 `sessions/register` 自动生成随机后缀

## 8. 推荐接入方式（标准化）

每个项目目录放一个统一脚本 `start-with-tunnel.sh`，脚本做 4 件事：

1. 调 `sessions/register` 获取 tunnel + 子域名  
2. `npm run build && npm run start -- -p <port>`  
3. 启动 agent（带返回的 tunnel/token）  
4. 输出 `public_url` 并做健康检查

这样新项目接入只需执行一条命令。
