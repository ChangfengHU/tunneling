# 远程部署文档

这份文档记录当前线上真实可用的部署方式，作为后续部署唯一参考。

## 部署总览

当前远程部署不是纯镜像仓库方案，也不是远程 `git pull` 方案，而是：

1. 本地编译 Linux 二进制
2. 通过 `rsync` 同步代码到远程
3. 远程重启 Go 服务
4. 远程重新构建并启动 Console 容器

也就是说：

- `control` 和 `server` 是本地编译后上传的二进制
- `console` 是把代码同步到远程后，在远程机器上执行 `docker build`
- 不依赖“先推镜像仓库再拉镜像”这条链路

## 线上机器结构

- 机器：`152.32.214.95`
- 部署目录：`/opt/tunneling`
- 服务数量：3 个
- Go 二进制目录：`/opt/tunneling/bin`

具体服务：

1. `control`
   - 可执行文件：`/opt/tunneling/bin/control`
   - 端口：`18100`
   - systemd：`tunneling-control.service`
   - 环境文件：`/opt/tunneling/control.env`

2. `server`
   - 可执行文件：`/opt/tunneling/bin/server`
   - 端口：`80`
   - systemd：`tunneling-server.service`
   - 环境文件：复用 `/opt/tunneling/control.env`

3. `console`
   - 代码目录：`/opt/tunneling/console`
   - 容器名：`tunneling-console`
   - 本机端口：`3002`
   - 环境文件：`/opt/tunneling/console.env`
   - 部署方式：远程 `docker build` + `docker run`

当前唯一保留的部署方式：

1. 本地交叉编译 Linux 版 `control` / `server`
2. `rsync` 同步当前工作区到远程 `/opt/tunneling`
3. 远程重启 systemd：
   - `tunneling-control.service`
   - `tunneling-server.service`
4. 远程用 Docker 重建并重启 `tunneling-console`

## 远程机器约定

- 代码目录：`/opt/tunneling`
- control env：`/opt/tunneling/control.env`
- console env：`/opt/tunneling/console.env`
- systemd：
  - `tunneling-control.service`
  - `tunneling-server.service`
- console 容器名：`tunneling-console`

注意：

- `control.env` 和 `console.env` 是远程机器本地文件，不在仓库里管理。
- 部署脚本会保留这两个文件，不会用本地内容覆盖它们。
- 这两个文件如果丢失，服务虽然能部署，但无法正常启动。

## 一键部署

如果你本机已配置 SSH 免密：

```bash
./scripts/deploy-remote.sh
```

如果需要密码登录：

```bash
SSH_PASSWORD='your-password' ./scripts/deploy-remote.sh
```

可选变量：

```bash
REMOTE_USER=root
REMOTE_HOST=152.32.214.95
REMOTE_DIR=/opt/tunneling
```

## 脚本做的事情

`./scripts/deploy-remote.sh` 会：

1. 本地编译 Linux 二进制
2. 同步仓库到远程
3. 上传新二进制到 `/opt/tunneling/bin`
4. 重启 `tunneling-control.service` 和 `tunneling-server.service`
5. 读取远程 `console.env`，在远程重建并重启 `tunneling-console`
6. 做基础健康检查

## 远程部署时实际发生了什么

部署过程可以理解为下面这条链路：

1. 在本地把 `cmd/control` 和 `cmd/server` 交叉编译成 Linux 可执行文件
2. 用 `rsync` 把仓库同步到远程 `/opt/tunneling`
3. 单独把新二进制放到远程 `/opt/tunneling/bin`
4. 在远程执行 `systemctl restart tunneling-control.service`
5. 在远程执行 `systemctl restart tunneling-server.service`
6. 读取远程 `console.env`
7. 在远程 `/opt/tunneling/console` 下执行 `docker build`
8. 删除旧的 `tunneling-console` 容器并重新启动新容器
9. 最后做本机健康检查

所以可以把它理解成：

- 代码传输：`rsync`
- Go 服务部署：上传二进制 + `systemd restart`
- Console 部署：远程 `docker build` + 重建容器

## 当前部署入口

当前唯一保留的远程部署入口是：

- `scripts/deploy-remote.sh`

不再使用：

- 推镜像仓库再部署的旧脚本
- 阿里云专用旧脚本
- 临时项目启动脚本
- 其他历史遗留发布脚本

## 健康检查

部署完成后，至少确认：

```bash
curl http://127.0.0.1:18100/healthz
curl http://127.0.0.1/healthz
curl -I http://127.0.0.1:3002
```

公网访问：

- 控制台：`https://domain.vyibc.com`
- 接入文档：`https://tunnel.vyibc.com/api-docs`

## 当前保留脚本

- `scripts/deploy-remote.sh`：远程部署主脚本
- `scripts/restart-local.sh`：本地开发环境重启脚本
- `scripts/install-skill.sh`：安装公开 Skill
- `scripts/project-tunnel.sh`：项目侧公网接入脚本

其他旧的远程部署/推镜像/临时项目启动脚本已删除。
