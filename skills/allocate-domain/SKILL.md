---
name: allocate-domain
description: >
  当用户说"给项目分配域名"、"为项目申请公网域名"、"allocate domain"、
  "assign public domain"、"给我的项目一个域名" 时自动触发。
  一句话即可为任何项目分配公网域名，无需启动项目。
---

# 快速域名分配（Allocate Domain）

**一句话分配公网域名，无需启动项目，只需提供项目名和本地端口。**

## 使用场景

- 已有本地项目在某个端口运行，想要分配公网域名
- 快速测试新项目的公网访问
- 为多个项目批量分配域名
- 临时公网访问某个本地服务

## 用法示例

```bash
# 最简单：项目名 + 端口
给我的 todo 项目分配一个域名，它在本地 localhost:3000 运行

# 或指定用户ID和基础域名
为 myapp 项目分配域名，端口是 5318，用户 ID 是 alice，域名后缀是 vyibc.com

# 英文方式
Allocate a domain for my project "myproject" running on localhost:5318
```

## 返回信息

```json
{
  "public_url": "http://myproject-a8vau2.vyibc.com",
  "tunnel_id": "68bb4bf9-9a6f-4e21-8aa5-3cfb7dc1cfcb",
  "tunnel_token": "dHGAFkpuQx610ShnxCqwbBoJFGHj5y70EDv7RsN26Ds",
  "agent_command": "./agent -server ws://152.32.214.95/connect ..."
}
```

## 触发关键词

- "给项目分配域名"
- "为项目申请公网域名"
- "我想要一个公网域名"
- "分配公网地址"
- "allocate domain"
- "assign public domain"
- "get a public URL for my project"

## 环境要求

- `curl` - 用于调用 API
- 网络连接到 152.32.214.95:3002

## 工作流程

```
用户说：给 myproject 分配域名，端口 3000
         ↓
1. 提取项目名、端口、用户ID、域名
2. 调用 /control/api/sessions/register API
3. 解析返回的 tunnel 和 route 信息
4. 返回 public_url 和 agent 启动命令
```
