"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Tunnel = {
  id: string;
  name: string;
  created_at: string;
};

type Route = {
  id: string;
  tunnel_id: string;
  hostname: string;
  target: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

type LogEntry = {
  id: number;
  time: string;
  level: string;
  event: string;
  tunnel_id?: string;
  message: string;
};

type TunnelsResponse = { tunnels: Tunnel[] };
type RoutesResponse = { routes: Route[] };
type LogsResponse = { logs: LogEntry[] };
type CommandResponse = { tunnel_id: string; agent_command: string; agent_config_url: string };
type CreateTunnelResponse = { tunnel: Tunnel; agent_command: string };

const CONTROL_PREFIX = "/control";

async function requestJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${CONTROL_PREFIX}${path}`, {
    cache: "no-store",
    ...init
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : {};
  if (!resp.ok) {
    throw new Error(data.error || `HTTP ${resp.status}`);
  }
  return data as T;
}

function fmtTime(input: string): string {
  if (!input) {
    return "-";
  }
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) {
    return input;
  }
  return parsed.toLocaleString("zh-CN", { hour12: false });
}

export default function HomePage() {
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [selectedTunnelID, setSelectedTunnelID] = useState<string>("");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [agentCommand, setAgentCommand] = useState<string>("");
  const [agentConfigURL, setAgentConfigURL] = useState<string>("");

  const [createTunnelName, setCreateTunnelName] = useState("");
  const [createFirstHostname, setCreateFirstHostname] = useState("");
  const [createFirstTarget, setCreateFirstTarget] = useState("");

  const [routeHostname, setRouteHostname] = useState("");
  const [routeTarget, setRouteTarget] = useState("");
  const [routeEnabled, setRouteEnabled] = useState(true);

  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selectedTunnel = useMemo(() => {
    return tunnels.find((item) => item.id === selectedTunnelID) || null;
  }, [tunnels, selectedTunnelID]);

  useEffect(() => {
    if (!selectedTunnelID) {
      return;
    }
    void loadTunnelDetails(selectedTunnelID);
    const timer = window.setInterval(() => {
      void loadLogs(selectedTunnelID);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selectedTunnelID]);

  const loadTunnels = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await requestJSON<TunnelsResponse>("/api/tunnels");
      setTunnels(data.tunnels || []);
      if (!selectedTunnelID && data.tunnels.length > 0) {
        setSelectedTunnelID(data.tunnels[0].id);
      }
      if (selectedTunnelID && !data.tunnels.some((item) => item.id === selectedTunnelID)) {
        setSelectedTunnelID(data.tunnels[0]?.id || "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 tunnel 失败");
    } finally {
      setLoading(false);
    }
  }, [selectedTunnelID]);

  useEffect(() => {
    void loadTunnels();
  }, [loadTunnels]);

  async function loadTunnelDetails(tunnelID: string) {
    setError("");
    try {
      const [routeData, commandData, logData] = await Promise.all([
        requestJSON<RoutesResponse>(`/api/tunnels/${encodeURIComponent(tunnelID)}/routes`),
        requestJSON<CommandResponse>(`/api/tunnels/${encodeURIComponent(tunnelID)}/command`),
        requestJSON<LogsResponse>(`/api/logs?tunnel_id=${encodeURIComponent(tunnelID)}&limit=200`)
      ]);
      setRoutes(routeData.routes || []);
      setAgentCommand(commandData.agent_command || "");
      setAgentConfigURL(commandData.agent_config_url || "");
      setLogs(logData.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载 tunnel 详情失败");
    }
  }

  async function loadLogs(tunnelID: string) {
    try {
      const data = await requestJSON<LogsResponse>(`/api/logs?tunnel_id=${encodeURIComponent(tunnelID)}&limit=200`);
      setLogs(data.logs || []);
    } catch {
      // Ignore transient polling errors.
    }
  }

  async function handleCreateTunnel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createTunnelName.trim()) {
      setError("请输入 tunnel 名称");
      return;
    }
    if ((createFirstHostname && !createFirstTarget) || (!createFirstHostname && createFirstTarget)) {
      setError("首次映射需要同时填写 hostname 和 target");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      const created = await requestJSON<CreateTunnelResponse>("/api/tunnels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createTunnelName.trim() })
      });

      if (createFirstHostname.trim() && createFirstTarget.trim()) {
        await requestJSON<{ route: Route }>("/api/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tunnel_id: created.tunnel.id,
            hostname: createFirstHostname.trim(),
            target: createFirstTarget.trim(),
            enabled: true
          })
        });
      }

      await loadTunnels();
      setSelectedTunnelID(created.tunnel.id);
      setCreateTunnelName("");
      setCreateFirstHostname("");
      setCreateFirstTarget("");
      setMessage(`Tunnel 创建成功: ${created.tunnel.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建 tunnel 失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTunnelID) {
      setError("请先选择 tunnel");
      return;
    }
    if (!routeHostname.trim() || !routeTarget.trim()) {
      setError("请填写 hostname 和 target");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJSON<{ route: Route }>("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tunnel_id: selectedTunnelID,
          hostname: routeHostname.trim(),
          target: routeTarget.trim(),
          enabled: routeEnabled
        })
      });
      await loadTunnelDetails(selectedTunnelID);
      setMessage(`映射已保存: ${routeHostname} -> ${routeTarget}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存映射失败");
    } finally {
      setBusy(false);
    }
  }

  function fillRoute(route: Route) {
    setRouteHostname(route.hostname);
    setRouteTarget(route.target);
    setRouteEnabled(route.enabled);
  }

  async function toggleRoute(route: Route) {
    if (!selectedTunnelID) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await requestJSON<{ route: Route }>("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tunnel_id: selectedTunnelID,
          hostname: route.hostname,
          target: route.target,
          enabled: !route.enabled
        })
      });
      await loadTunnelDetails(selectedTunnelID);
      setMessage(`映射已${route.enabled ? "禁用" : "启用"}: ${route.hostname}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新映射状态失败");
    } finally {
      setBusy(false);
    }
  }

  async function copyCommand() {
    if (!agentCommand) {
      return;
    }
    try {
      await navigator.clipboard.writeText(agentCommand);
      setMessage("启动命令已复制");
      setError("");
    } catch {
      setError("复制失败，请手动复制");
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Tunnel Console</h1>
          <p>创建 Tunnel、配置域名映射、复制本地启动脚本、查看运行日志</p>
        </div>
        <button className="ghost" onClick={() => void loadTunnels()} disabled={loading || busy}>
          刷新 Tunnel
        </button>
      </header>

      {error ? <div className="alert error">{error}</div> : null}
      {message ? <div className="alert ok">{message}</div> : null}

      <section className="grid">
        <aside className="panel left">
          <h2>创建 Tunnel</h2>
          <form onSubmit={handleCreateTunnel} className="form">
            <label>
              Tunnel 名称
              <input
                value={createTunnelName}
                onChange={(e) => setCreateTunnelName(e.target.value)}
                placeholder="例如: user-001"
                disabled={busy}
              />
            </label>
            <label>
              首次 hostname（可选）
              <input
                value={createFirstHostname}
                onChange={(e) => setCreateFirstHostname(e.target.value)}
                placeholder="例如: app.vyibc.com"
                disabled={busy}
              />
            </label>
            <label>
              首次 target（可选）
              <input
                value={createFirstTarget}
                onChange={(e) => setCreateFirstTarget(e.target.value)}
                placeholder="例如: 127.0.0.1:3000"
                disabled={busy}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "处理中..." : "创建"}
            </button>
          </form>

          <h2>Tunnel 列表</h2>
          <div className="list">
            {tunnels.length === 0 ? <p className="muted">暂无 tunnel</p> : null}
            {tunnels.map((item) => (
              <button
                key={item.id}
                className={`listItem ${selectedTunnelID === item.id ? "active" : ""}`}
                onClick={() => setSelectedTunnelID(item.id)}
                disabled={busy}
              >
                <strong>{item.name}</strong>
                <small>{item.id}</small>
              </button>
            ))}
          </div>
        </aside>

        <section className="panel right">
          {!selectedTunnel ? (
            <p className="muted">请选择一个 tunnel</p>
          ) : (
            <>
              <div className="row">
                <div>
                  <h2>{selectedTunnel.name}</h2>
                  <p className="muted">
                    Tunnel ID: <code>{selectedTunnel.id}</code>
                  </p>
                  <p className="muted">创建时间: {fmtTime(selectedTunnel.created_at)}</p>
                </div>
                <button className="ghost" onClick={() => void loadTunnelDetails(selectedTunnel.id)} disabled={busy}>
                  刷新详情
                </button>
              </div>

              <div className="card">
                <div className="row">
                  <h3>本地启动命令</h3>
                  <button className="ghost" onClick={() => void copyCommand()}>
                    复制命令
                  </button>
                </div>
                <pre>{agentCommand || "暂无命令"}</pre>
                <p className="muted">
                  route sync 地址: <code>{agentConfigURL || "-"}</code>
                </p>
              </div>

              <div className="card">
                <h3>新增 / 更新映射</h3>
                <form onSubmit={handleSaveRoute} className="inlineForm">
                  <input
                    value={routeHostname}
                    onChange={(e) => setRouteHostname(e.target.value)}
                    placeholder="hostname: demo1.vyibc.com"
                    disabled={busy}
                  />
                  <input
                    value={routeTarget}
                    onChange={(e) => setRouteTarget(e.target.value)}
                    placeholder="target: 127.0.0.1:3100"
                    disabled={busy}
                  />
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={routeEnabled}
                      onChange={(e) => setRouteEnabled(e.target.checked)}
                      disabled={busy}
                    />
                    启用
                  </label>
                  <button type="submit" disabled={busy}>
                    保存
                  </button>
                </form>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Hostname</th>
                        <th>Target</th>
                        <th>状态</th>
                        <th>更新时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="muted">
                            暂无映射
                          </td>
                        </tr>
                      ) : null}
                      {routes.map((route) => (
                        <tr key={route.id || route.hostname}>
                          <td>{route.hostname}</td>
                          <td>{route.target}</td>
                          <td>{route.enabled ? "启用" : "停用"}</td>
                          <td>{fmtTime(route.updated_at)}</td>
                          <td className="actions">
                            <button className="ghost" onClick={() => fillRoute(route)} disabled={busy}>
                              编辑
                            </button>
                            <button className="ghost" onClick={() => void toggleRoute(route)} disabled={busy}>
                              {route.enabled ? "禁用" : "启用"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="row">
                  <h3>日志</h3>
                  <button className="ghost" onClick={() => void loadLogs(selectedTunnel.id)} disabled={busy}>
                    刷新日志
                  </button>
                </div>
                <div className="logs">
                  {logs.length === 0 ? <p className="muted">暂无日志</p> : null}
                  {logs.map((item) => (
                    <div key={item.id} className="logRow">
                      <span className={`level ${item.level}`}>{item.level.toUpperCase()}</span>
                      <code>{fmtTime(item.time)}</code>
                      <strong>{item.event}</strong>
                      <span>{item.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </section>
    </main>
  );
}
