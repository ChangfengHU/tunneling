# 本地使用指南（Project Tunnel）

目标：把 `project-tunnel.sh` 放到项目根目录后，一条命令拿到公网域名。

## 1) 放置脚本

把 `scripts/project-tunnel.sh` 复制到你的项目根目录，并重命名为 `project-tunnel.sh`。

```text
my-project/
  ├─ project-tunnel.sh
  ├─ package.json
  └─ ...
```

## 2) 启动并分配公网域名

```bash
sh project-tunnel.sh start
```

指定端口：

```bash
sh project-tunnel.sh start --port 3000
```

先执行自定义启动脚本：

```bash
sh project-tunnel.sh start --startsh scripts/dev-restart.sh
```

## 3) 看关键输出

- `public_url: https://xxx.vyibc.com`：公网访问地址
- `target: http://127.0.0.1:xxxx`：本地目标
- `public_probe code=200`：外网探测成功

如果出现 `public_probe code=502`，通常是本地服务未启动或端口错误。

## 4) 常用命令

```bash
sh project-tunnel.sh status
sh project-tunnel.sh stop
```

## 5) Skill 一键方式

触发示例：

- “启动我的项目，给我一个公网域名”
- “使用启动脚本 scripts/dev-restart.sh 并给我公网域名”

`auto-domain` skill 会自动完成：项目识别、启动、域名分配并返回 `public_url`。

## 6) 效果截图

### 脚本方式执行结果

![脚本执行输出](images/screenshot-script-output.png)

### Skill 返回公网域名结果

![Skill 启动结果](images/screenshot-skill-result.png)

### Skill 触发与执行过程

![Skill 触发过程](images/screenshot-skill-trigger.png)
