---
name: project-tunnel-bootstrap
description: Install and run project-level tunneling in one step. Use when the user wants auto-create `project-tunnel.sh` in the current project, start/stop/status tunnel by port, and get a public subdomain URL quickly.
---

# Project Tunnel Bootstrap

Use bundled scripts; do not rewrite shell logic manually.

## 运行环境要求

在目标开发机器上运行 `project-tunnel.sh` 前，需确保以下工具已安装：

| 工具 | 用途 | 安装方式 |
|------|------|----------|
| `bash` ≥ 4 | 脚本运行时 | macOS 默认，Linux 自带 |
| `curl` | 调用控制 API、健康检查 | `brew install curl` / `apt install curl` |
| `python3` | JSON 读写、UUID 生成 | `brew install python3` / `apt install python3` |
| `node` + `npm` | 构建前端项目（如适用） | [nodejs.org](https://nodejs.org) 或 `brew install node` |
| `lsof` | 检测端口占用 | macOS 自带，Linux：`apt install lsof` |

> `go` **不需要**在开发机上安装，agent 二进制由脚本自动下载到 `~/.tunneling/bin/`。

### 一键检查环境
```bash
for cmd in bash curl python3 node npm lsof; do
  command -v $cmd &>/dev/null && echo "✅ $cmd" || echo "❌ $cmd 缺失"
done
```

### macOS 一键安装缺失依赖
```bash
brew install curl python3 node
```

### Ubuntu/Debian 一键安装
```bash
sudo apt update && sudo apt install -y curl python3 nodejs npm lsof
```

---

## Workflow

1. Install script into current project:
   - `scripts/install_project_tunnel.sh`
2. Start tunnel and print public URL:
   - `scripts/start_project_tunnel.sh --port 3000`
3. For existing project script operations:
   - `sh ./project-tunnel.sh status --port 3000`
   - `sh ./project-tunnel.sh stop --port 3000`

## Notes

- Installer copies bundled `assets/project-tunnel.sh` into project root.
- Start helper always installs first, then runs `project-tunnel.sh start ...`.
- Default behavior is fixed subdomain mode.
- Port switch keeps only current project port mapping (old port state is cleaned).
- **机器级共享 tunnel**：同一台机器上的所有项目共享一个 tunnel_id，状态存于 `~/.tunneling/machine_state.json`。第一个启动的项目自动锁定 tunnel_id，后续项目自动复用。
