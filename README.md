# 🌐 Auto Domain - 快速获取公网域名

**一句话，为你的任何项目快速分配公网域名，无需复杂配置。**

让本地项目在公网可访问，只需提供项目名和端口。用户可以通过 Tunnel ID 登录管理界面修改、启用/禁用自己的域名。

---

## ✨ 核心功能

### 🚀 快速域名分配
- **一句话分配域名** - 只需提供项目名和端口；注册后需启动本地 Agent 才能生效
- **固定二级域名** - 默认使用 `project.base_domain`，也支持显式传 `subdomain`
- **即刻生效** - 启动本地 Agent 后即可访问

### 🔐 用户自主管理
- **Tunnel ID 登录** - 用户用分配时获得的 Tunnel ID 登录，无需记住密码
- **域名管理** - 查看、修改、启用/禁用自己的域名映射
- **路由控制** - 实时切换目标地址，支持动态改端口

### 🛠️ 完整的 API 和控制面
- **RESTful API** - 完整的 Tunnel/Route 管理 API
- **Web Console** - 直观的管理界面
- **实时日志** - 查看所有请求和系统事件

---

## 🎯 使用场景

✅ 本地开发需要分享给别人测试  
✅ 临时公网访问本地服务  
✅ Webhook 测试（支持外网回调）  
✅ 多个项目快速发布和管理  
✅ 演示/展示项目给客户  

---

## 🚀 快速开始

### ⚡ 一键安装 Skill

```bash
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh)
```

运行后会出现交互菜单，选择安装到哪个 AI 工具：

```
🛠  选择要安装到哪个 AI 工具：

  1) Codex        (~/.codex/skills/)
  2) Cursor       (~/.cursor/skills/)
  3) Claude       (~/.claude/plugins/)
  4) Gemini       (~/.gemini/skills/)
  5) Antigravity  (~/.gemini/antigravity/knowledge/)
  6) Copilot      (~/.github-copilot/skills/)
  7) 全部安装
```

也可以直接用 `--target` 参数跳过菜单：

```bash
# 安装到指定工具
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target codex
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target cursor
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target claude
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target gemini
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target antigravity
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target copilot

# 一次安装到所有工具
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh) --target all
```

安装完成后，直接对 AI 说：

```
给我的 myapp 项目分配一个公网域名，它在 localhost:3000 运行
```

也可以查看公开接入文档：

```text
https://tunnel.vyibc.com/api-docs
```

---

### 方式 1：自然语言 Skill（推荐）

使用一键安装脚本（支持 Codex / Cursor / Claude / Gemini / Antigravity / Copilot）：

```bash
bash <(curl -fsSL https://tunnel.vyibc.com/install-skill.sh)
```

然后对 AI 说：

```
给我的 myapp 项目分配一个公网域名，它在 localhost:3000 运行

为 todo 项目分配域名，端口 5318，用户 alice
```

**Skill 会自动：**
1. 提取项目名、端口、用户 ID
2. 调用 API 分配域名
3. 返回公网地址、Tunnel ID 和 Agent Command
4. 提示启动本地 Agent，并告诉你如何管理这个域名

### 方式 2：命令行脚本

```bash
# 最简单：项目名 + 端口
./skills/allocate-domain/scripts/allocate-domain.sh myapp 3000

# 指定用户和域名
./skills/allocate-domain/scripts/allocate-domain.sh myapp 3000 alice vyibc.com
```

### 方式 3：直接调用 API

```bash
curl -X POST 'https://domain.vyibc.com/api/sessions/register' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "alice",
    "project": "myapp",
    "target": "127.0.0.1:3000",
    "base_domain": "vyibc.com"
  }'
```

说明：
- 传了 `subdomain` 时，会注册成固定二级域名，例如 `myapp.vyibc.com`
- 没传 `subdomain` 时，会直接使用 `project`，例如 `myapp.vyibc.com`
- 普通用户如果该固定二级域名已存在，会自动回退成带随机后缀的新域名
- 管理员携带 `admin_key` 时，可以覆盖已存在的固定二级域名
- 如果想让同一台机器永远只跑 1 个 agent，第一次注册后请保存返回的 `tunnel.id` 和 `tunnel.token`
- 统一推荐保存到 `~/.tunneling/machine_state.json`
- 后续再注册其他本地服务时，把 `tunnel_id` 和 `tunnel_token` 一起传给 `/api/sessions/register`，接口就会复用已有 tunnel，只新增 route

复用同一个 tunnel 的示例：

```bash
curl -X POST 'https://domain.vyibc.com/api/sessions/register' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "alice",
    "project": "admin",
    "subdomain": "admin",
    "target": "127.0.0.1:3001",
    "base_domain": "vyibc.com",
    "tunnel_id": "68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb",
    "tunnel_token": "dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds"
  }'
```

---

## 📋 使用流程

### 第一步：分配域名

使用上述任意一种方式分配域名，你会获得：

```
✅ 域名分配成功！

🌐 公网地址：http://myapp.vyibc.com

📌 Tunnel 信息：
- Tunnel ID: 68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb
- Token: dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds
```

### 第二步：启动本地项目

确保你的项目在指定端口运行：

```bash
npm run dev  # 如果端口是 3000
# 或
python -m http.server 5318  # 如果端口是 5318
```

### 第三步：公网访问

直接访问分配的公网地址：

```
https://myapp.vyibc.com
```

### 第四步：管理域名（可选）

如果你需要修改、启用/禁用自己的域名，访问：

```
https://domain.vyibc.com/login
```

输入你的 **Tunnel ID** 登录，然后：
- ✅ 启用/禁用域名映射
- ✏️ 修改目标地址（切换端口）
- 📊 查看请求日志和统计
- 🔄 获取最新的 Agent 启动命令

---

## 👥 两种登录方式

### 超级管理员登录
**URL:** `https://domain.vyibc.com/adminlogin`

**用途：** 系统管理员管理整个平台（创建用户、查看日志等）

**认证方式：** Email + Password

---

### 普通用户登录
**URL:** `https://domain.vyibc.com/login`

**用途：** 用户管理自己分配的域名和路由

**认证方式：** Tunnel ID（分配域名时获得）

---

## 📚 详细文档

| 文档 | 说明 |
|------|------|
| [公开接入文档](https://tunnel.vyibc.com/api-docs) | 免登录查看的对外接入文档，适合用户/SDK/脚本调用 |
| [allocate-domain Skill 使用指南](./docs/ALLOCATE_DOMAIN_GUIDE.md) | Skill 的完整使用文档、参数说明、常见问题 |
| [项目接入指南](./docs/PROJECT_ONBOARDING.md) | 开发者集成本项目的指南 |
| [本地使用指南](./docs/local-usage.md) | 本地开发和测试的指南 |

---

## 🏗️ 项目架构

```
tunneling/
├── cmd/                    # 应用入口
│   ├── server/            # Gateway 服务器
│   ├── agent/             # Agent 客户端
│   └── control/           # Control Plane
├── internal/              # 核心逻辑
│   ├── protocol/          # Tunnel 协议
│   ├── control/           # Control API 实现
│   └── server/            # Gateway 实现
├── console/               # Next.js 管理后台
│   ├── app/login/         # 用户登录界面（Tunnel ID）
│   ├── app/adminlogin/    # 超管登录界面
│   └── app/portal/        # 用户管理界面
├── skills/                # Copilot Skills
│   └── allocate-domain/   # 域名分配 Skill
└── docs/                  # 文档
```

---

## 🔧 核心 Skill

### allocate-domain
**一句话为任何项目分配公网域名**

```bash
# 安装
copilot skills add ChangfengHU/tunneling-skills allocate-domain

# 或手动安装
git clone https://github.com/ChangfengHU/tunneling.git
cd tunneling/skills/allocate-domain
```

**使用示例：**
```
给我的 todo 项目分配一个域名，运行在 localhost:3000

为 myapp 分配公网域名，端口 5318，用户 alice
```

**返回信息包含：**
- 公网地址
- Tunnel ID（用于登录）
- 管理界面链接

---

## 📦 部署

当前实际保留并验证可用的部署方式只有一套：

- 本地编译 `control` / `server`
- `rsync` 同步到远程 `/opt/tunneling`
- 远程重启 `systemd`
- 远程 `docker build` 并重建 `console`

详细说明见：

- [远程部署文档](./docs/REMOTE_DEPLOYMENT.md)

---

## 🌍 公开实例

**Console 地址：** https://domain.vyibc.com

**超管登录：** https://domain.vyibc.com/adminlogin  
**用户登录：** https://domain.vyibc.com/login

---

## 🤖 API 示例

### 分配域名（无需认证）

```bash
curl -X POST 'https://domain.vyibc.com/api/sessions/register' \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "alice",
    "project": "myapp",
    "target": "127.0.0.1:3000",
    "base_domain": "vyibc.com"
  }'

# 返回
{
  "public_url": "http://myapp.vyibc.com",
  "tunnel": {
    "id": "68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb",
    "token": "dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds"
  },
  "route": {
    "hostname": "myapp.vyibc.com",
    "target": "127.0.0.1:3000"
  }
}
```

### 查询 Tunnel（需要 Tunnel Token）

```bash
curl 'https://domain.vyibc.com/api/tunnels/68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb' \
  -H "Authorization: Bearer dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds"
```

更多 API 文档见 `internal/control/server.go`

---

## 💡 常见问题

**Q: 为什么我的域名访问显示 502？**  
A: 确保你的项目在指定的本地端口运行。例如，分配时说是 3000，确保项目已启动在 `127.0.0.1:3000`。

**Q: 我忘记了 Tunnel ID 怎么办？**  
A: 如果你保存了分配时的响应信息，里面有 Tunnel ID。否则需要重新分配一个新的域名。

**Q: 可以改变域名映射的目标地址吗？**  
A: 可以。登录 https://domain.vyibc.com/login，输入 Tunnel ID，在管理界面修改目标地址。

**Q: 域名分配是永久的吗？**  
A: 是的，只要你不手动禁用，域名映射会一直生效。

**Q: 支持 HTTPS 吗？**  
A: 支持。分配的域名会自动使用 HTTPS（通过反向代理）。

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

---

## 📄 许可证

MIT License

---

## 📞 联系方式

- **GitHub Issues:** https://github.com/ChangfengHU/tunneling/issues
- **Discussions:** https://github.com/ChangfengHU/tunneling/discussions

---

**Happy tunneling! 🎉**
