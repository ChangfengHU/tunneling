---
name: project-tunnel-bootstrap
description: Install and run project-level tunneling in one step. Use when the user wants auto-create `project-tunnel.sh` in the current project, start/stop/status tunnel by port, and get a public subdomain URL quickly.
---

# Project Tunnel Bootstrap

Use bundled scripts; do not rewrite shell logic manually.

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
