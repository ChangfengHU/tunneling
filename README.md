# Auto Domain

Auto Domain 用于把本地服务快速映射到公网域名，提供 Tunnel 控制面、路由管理与自动化启动能力。

## 项目功能

- 本地服务自动映射为公网可访问域名
- Tunnel/Route 管理（创建、更新、停用）
- 控制面 API（会话注册、命令下发、状态查询）
- Web Console（Tunnel 列表、路由管理、日志查看）
- Skill 自动化启动（`auto-domain`）

## 主要目录

- `cmd/`: `server` / `agent` / `control` 入口
- `internal/`: 核心服务与协议
- `console/`: Next.js 管理后台
- `scripts/`: 构建、推送、部署脚本
- `skills/auto-domain/`: Skill 定义与自动启动脚本
- `sql/init.sql`: 数据库初始化脚本
- `docs/local-usage.md`: 本地使用说明

## Docker 部署

### 1) 本地构建并推送镜像

```bash
export DOCKER_USERNAME=你的仓库账号
export DOCKER_PASSWORD=你的仓库密码
export REGISTRY=registry.cn-hangzhou.aliyuncs.com
export NAMESPACE=vyibc
export IMAGE_NAME=tunneling-console
export TAG=latest

./scripts/console-build-push.sh
```

### 2) 远程机器拉取并启动

```bash
cd /opt/tunneling
ENV_FILE=/opt/tunneling/console.env ./scripts/console-deploy-aliyun.sh
```

### 3) Agent 镜像部署

```bash
export DOCKER_USERNAME=你的仓库账号
export DOCKER_PASSWORD=你的仓库密码
export REGISTRY=registry.cn-hangzhou.aliyuncs.com
export NAMESPACE=vyibc
export IMAGE_NAME=tunneling-agent
export TAG=latest

./scripts/agent-build-push.sh
```

远程或本地机器启动 agent：

```bash
./scripts/agent-deploy-local.sh
```

## 本地使用

面向最终用户的脚本/Skill 使用文档见：

- [docs/local-usage.md](docs/local-usage.md)
