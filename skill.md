---
name: project-tunnel-bootstrap
description: One-command setup for local project tunneling with fixed subdomain mapping. Use when a project needs `project-tunnel.sh` wiring, port-based start/stop/status operations, automatic agent download, and route lifecycle management (including port switch cleanup).
---

# Project Tunnel Bootstrap

Run this workflow when a local web project needs public access through `*.vyibc.com`.

## Steps

1. Ensure project root has `project-tunnel.sh`.
2. Start with:
   - `sh project-tunnel.sh start`
   - or `sh project-tunnel.sh start --port 4544`
3. Verify:
   - `sh project-tunnel.sh status`
   - check `public_url` and `public_probe`.
4. Stop with:
   - `sh project-tunnel.sh stop`

## Expected Behavior

- Fixed hostname mode (`<project>-<user>.<base_domain>`) by default.
- Switching ports removes old same-project port state and keeps only current port mapping.
- `stop` disables current mapping.
- Agent binary auto-downloads from GitHub releases.

## Troubleshooting

- `409 hostname is already bound`: use updated script; it force-upserts on start and cleans sibling port state.
- `521 on https`: Cloudflare source TLS path issue (configure SSL mode or origin 443 cert).
- build failure: project build itself failed; fix app errors first.
