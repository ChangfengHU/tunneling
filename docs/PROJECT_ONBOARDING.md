# 新项目接入文档（内网穿透）

本文用于把一个新的本地项目快速接入现有 tunneling 平台，并拿到可访问的公网二级域名。

## 1. 前置条件

- 对外接入地址：`https://domain.vyibc.com`
- 公开接口文档：`https://tunnel.vyibc.com/api-docs`
- 本地已安装 `node` / `npm` / `python3` / `curl`
- 不要求预装 agent，`project-tunnel.sh` 会自动下载

## 2. 一键接入（推荐）

把 [project-tunnel.sh](/Users/huchangfeng/code/tunneling/scripts/project-tunnel.sh) 放到项目根目录，执行：

```bash
chmod +x ./project-tunnel.sh
./project-tunnel.sh start
```

指定端口启动：

```bash
./project-tunnel.sh start --port 5318
./project-tunnel.sh start 5318
```

这套脚本默认会：

- 从当前目录读取项目名和端口（`package.json.name`、`.tunnel-port`、`.env`）
- 优先复用 `~/.tunneling/machine_state.json` 里的 tunnel 凭证
- 保持同一台机器只跑一个 agent
- 先尝试固定二级域名
- 固定域名冲突时，普通用户自动回退到随机后缀域名
- 管理员模式下可覆盖固定域名

常用命令：

```bash
./project-tunnel.sh status
./project-tunnel.sh stop
```

## 3. 手动调用注册接口

最小注册示例：

```bash
curl -sS -X POST 'https://domain.vyibc.com/api/sessions/register' \
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
- `route.hostname`
- `public_url`
- `agent_command`

当前二级域名规则：

- 传了 `subdomain`：先尝试 `subdomain.vyibc.com`
- 没传 `subdomain`：先尝试 `project.vyibc.com`
- 普通用户遇到固定域名冲突：自动回退到 `project-随机后缀.vyibc.com`
- 管理员带 `admin_key`：可直接覆盖固定域名

## 4. 复用单机单 Agent

推荐把第一次注册返回的凭证保存在：

- `~/.tunneling/machine_state.json`

文件里至少保存：

- `tunnel_id`
- `tunnel_token`

后续同一台机器新增其他服务时，把这两个字段一起传给 `/api/sessions/register`，接口就只会新增 route，不会再创建第二个 tunnel / agent。

示例：

```bash
curl -sS -X POST 'https://domain.vyibc.com/api/sessions/register' \
  -H 'Content-Type: application/json' \
  --data-raw '{
    "user_id": "u-hcf",
    "project": "admin",
    "subdomain": "admin",
    "base_domain": "vyibc.com",
    "target": "127.0.0.1:3001",
    "tunnel_id": "YOUR_TUNNEL_ID",
    "tunnel_token": "YOUR_TUNNEL_TOKEN"
  }'
```

## 5. 启动本地 Agent

直接使用注册接口返回的 `agent_command` 即可。

典型格式：

```bash
./agent \
  -server ws://domain.vyibc.com/connect \
  -token <tunnel_token> \
  -route-sync-url https://domain.vyibc.com/_tunnel/agent/routes \
  -tunnel-id <tunnel_id> \
  -tunnel-token <tunnel_token> \
  -admin-addr 127.0.0.1:17005 \
  -config ~/.tunneling/machine-agent/config.json
```

如果 agent 在 Docker 中，目标服务建议填 `host.docker.internal:<port>`，不要填 `127.0.0.1:<port>`。

## 6. 验证

```bash
curl -sS http://127.0.0.1:17005/api/status
curl -I http://<your-subdomain>.vyibc.com/
```

预期：

- `api/status` 中 `connected=true`
- 公网域名能返回业务响应

## 7. 常见问题

- `404 page not found`
  - route 已写入，但该 tunnel 的 agent 没连上
- `502 bad gateway`
  - agent 已连上，但 target 端口服务未启动或端口写错
- 返回了带随机后缀的域名
  - 说明你想要的固定二级域名已被占用，系统自动回退了随机后缀
- 想强制绑定固定域名
  - 需要管理员显式带 `admin_key`

## 8. 推荐标准化方式

每台机器只维护一套共享状态：

- `~/.tunneling/machine_state.json`
- `~/.tunneling/machine-agent/config.json`

这样所有项目都复用同一个 tunnel / agent，只是不断新增 route。
