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
