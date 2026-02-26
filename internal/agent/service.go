package agent

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"tunneling/internal/protocol"
)

const (
	maxProxyBodySize = 10 << 20 // 10MB
)

type Service struct {
	serverURL string
	token     string
	adminAddr string
	store     *ConfigStore

	routeSyncURL      string
	tunnelID          string
	tunnelToken       string
	routeSyncInterval time.Duration

	httpClient *http.Client

	connMu sync.RWMutex
	conn   *websocket.Conn

	writeMu sync.Mutex

	statusMu  sync.RWMutex
	connected bool
	lastError string
}

type Status struct {
	Connected bool   `json:"connected"`
	LastError string `json:"last_error,omitempty"`
	ServerURL string `json:"server_url"`
	AdminAddr string `json:"admin_addr"`
	TokenHint string `json:"token_hint"`

	RouteSyncURL      string `json:"route_sync_url,omitempty"`
	TunnelID          string `json:"tunnel_id,omitempty"`
	ManagedByControl  bool   `json:"managed_by_control"`
	RouteSyncInterval string `json:"route_sync_interval,omitempty"`
}

func NewService(serverURL, token, adminAddr, routeSyncURL, tunnelID, tunnelToken string, routeSyncInterval time.Duration, store *ConfigStore) (*Service, error) {
	parsed, err := url.Parse(serverURL)
	if err != nil {
		return nil, fmt.Errorf("invalid server url: %w", err)
	}
	if parsed.Scheme != "ws" && parsed.Scheme != "wss" {
		return nil, errors.New("server url must start with ws:// or wss://")
	}

	routeSyncURL = strings.TrimSpace(routeSyncURL)
	if routeSyncURL != "" {
		routeParsed, err := url.Parse(routeSyncURL)
		if err != nil {
			return nil, fmt.Errorf("invalid route sync url: %w", err)
		}
		if routeParsed.Scheme != "http" && routeParsed.Scheme != "https" {
			return nil, errors.New("route sync url must start with http:// or https://")
		}
		if strings.TrimSpace(tunnelID) == "" {
			return nil, errors.New("tunnel-id is required when route sync url is set")
		}
		if strings.TrimSpace(tunnelToken) == "" {
			return nil, errors.New("tunnel-token is required when route sync url is set")
		}
	}
	if routeSyncInterval <= 0 {
		routeSyncInterval = 5 * time.Second
	}

	return &Service{
		serverURL:         serverURL,
		token:             token,
		adminAddr:         adminAddr,
		store:             store,
		routeSyncURL:      routeSyncURL,
		tunnelID:          strings.TrimSpace(tunnelID),
		tunnelToken:       strings.TrimSpace(tunnelToken),
		routeSyncInterval: routeSyncInterval,
		httpClient: &http.Client{
			Timeout: 45 * time.Second,
		},
	}, nil
}

func (s *Service) Run(ctx context.Context) error {
	adminSrv := &http.Server{
		Addr:    s.adminAddr,
		Handler: s.adminMux(),
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = adminSrv.Shutdown(shutdownCtx)
	}()

	go func() {
		log.Printf("agent admin UI listening on http://%s", s.adminAddr)
		if err := adminSrv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("admin server error: %v", err)
		}
	}()

	if s.routeSyncURL != "" {
		go s.routeSyncLoop(ctx)
	}

	return s.connectLoop(ctx)
}

func (s *Service) connectLoop(ctx context.Context) error {
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		if err := s.connectOnce(ctx); err != nil {
			s.setLastError(err.Error())
			log.Printf("agent disconnected: %v", err)
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(backoff):
		}

		if backoff < 10*time.Second {
			backoff *= 2
			if backoff > 10*time.Second {
				backoff = 10 * time.Second
			}
		}
	}
}

func (s *Service) connectOnce(ctx context.Context) error {
	wsURL, err := s.buildConnectURL()
	if err != nil {
		return err
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		return fmt.Errorf("connect server: %w", err)
	}
	conn.SetReadLimit(maxProxyBodySize + (2 << 20))
	s.setConn(conn)
	s.setConnected(true)
	s.setLastError("")
	defer func() {
		s.setConnected(false)
		s.clearConn(conn)
		_ = conn.Close()
	}()

	if err := s.publishRoutes(); err != nil {
		return fmt.Errorf("sync routes on connect: %w", err)
	}
	log.Printf("agent connected to %s", s.serverURL)

	for {
		var env protocol.Envelope
		if err := conn.ReadJSON(&env); err != nil {
			return fmt.Errorf("read server message: %w", err)
		}
		switch env.Type {
		case protocol.TypeProxyRequest:
			go s.handleProxyRequest(env)
		case protocol.TypeError:
			log.Printf("server error: %s", env.Message)
		default:
			log.Printf("unknown server message type=%s", env.Type)
		}
	}
}

func (s *Service) buildConnectURL() (string, error) {
	parsed, err := url.Parse(s.serverURL)
	if err != nil {
		return "", err
	}
	q := parsed.Query()
	q.Set("token", s.token)
	parsed.RawQuery = q.Encode()
	return parsed.String(), nil
}

func (s *Service) publishRoutes() error {
	routes := s.store.List()
	env := protocol.Envelope{Type: protocol.TypeRegisterRoutes, Routes: routes}
	return s.writeEnvelope(env)
}

func (s *Service) SyncRoutes() error {
	return s.publishRoutes()
}

func (s *Service) writeEnvelope(env protocol.Envelope) error {
	conn := s.getConn()
	if conn == nil {
		return errors.New("tunnel is offline")
	}
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	if err := conn.WriteJSON(env); err != nil {
		return fmt.Errorf("write websocket: %w", err)
	}
	return nil
}

func (s *Service) handleProxyRequest(req protocol.Envelope) {
	status, headers, body := s.forwardToLocal(req)

	resp := protocol.Envelope{
		Type:      protocol.TypeProxyResponse,
		RequestID: req.RequestID,
		Status:    status,
		Headers:   headers,
		Body:      base64.StdEncoding.EncodeToString(body),
	}
	if err := s.writeEnvelope(resp); err != nil {
		log.Printf("write proxy response failed req=%s err=%v", req.RequestID, err)
	}
}

func (s *Service) forwardToLocal(req protocol.Envelope) (int, map[string][]string, []byte) {
	if req.Target == "" {
		return http.StatusBadGateway, map[string][]string{"Content-Type": {"text/plain; charset=utf-8"}}, []byte("missing target")
	}

	body, err := base64.StdEncoding.DecodeString(req.Body)
	if err != nil {
		return http.StatusBadRequest, map[string][]string{"Content-Type": {"text/plain; charset=utf-8"}}, []byte("invalid request body")
	}

	fullURL := "http://" + req.Target + req.Path
	if req.Query != "" {
		fullURL += "?" + req.Query
	}

	localReq, err := http.NewRequest(req.Method, fullURL, bytes.NewReader(body))
	if err != nil {
		return http.StatusBadGateway, map[string][]string{"Content-Type": {"text/plain; charset=utf-8"}}, []byte("build local request failed")
	}
	if req.Hostname != "" {
		localReq.Host = req.Hostname
	}

	for k, v := range req.Headers {
		for _, item := range v {
			localReq.Header.Add(k, item)
		}
	}
	stripHopHeaders(localReq.Header)

	localResp, err := s.httpClient.Do(localReq)
	if err != nil {
		return http.StatusBadGateway, map[string][]string{"Content-Type": {"text/plain; charset=utf-8"}}, []byte("local request failed: " + err.Error())
	}
	defer localResp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(localResp.Body, maxProxyBodySize))
	if err != nil {
		return http.StatusBadGateway, map[string][]string{"Content-Type": {"text/plain; charset=utf-8"}}, []byte("read local response failed")
	}

	headers := make(map[string][]string, len(localResp.Header))
	for k, v := range localResp.Header {
		copied := make([]string, len(v))
		copy(copied, v)
		headers[k] = copied
	}
	stripHopHeaders(headers)

	return localResp.StatusCode, headers, respBody
}

func stripHopHeaders(headers map[string][]string) {
	for _, key := range []string{
		"Connection",
		"Proxy-Connection",
		"Keep-Alive",
		"Proxy-Authenticate",
		"Proxy-Authorization",
		"Te",
		"Trailer",
		"Transfer-Encoding",
		"Upgrade",
	} {
		delete(headers, key)
		delete(headers, strings.ToLower(key))
	}
}

func (s *Service) setConn(conn *websocket.Conn) {
	s.connMu.Lock()
	defer s.connMu.Unlock()
	s.conn = conn
}

func (s *Service) clearConn(conn *websocket.Conn) {
	s.connMu.Lock()
	defer s.connMu.Unlock()
	if s.conn == conn {
		s.conn = nil
	}
}

func (s *Service) getConn() *websocket.Conn {
	s.connMu.RLock()
	defer s.connMu.RUnlock()
	return s.conn
}

func (s *Service) setConnected(v bool) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	s.connected = v
}

func (s *Service) setLastError(msg string) {
	s.statusMu.Lock()
	defer s.statusMu.Unlock()
	s.lastError = msg
}

func (s *Service) GetStatus() Status {
	s.statusMu.RLock()
	defer s.statusMu.RUnlock()
	return Status{
		Connected:         s.connected,
		LastError:         s.lastError,
		ServerURL:         s.serverURL,
		AdminAddr:         s.adminAddr,
		TokenHint:         tokenHint(s.token),
		RouteSyncURL:      s.routeSyncURL,
		TunnelID:          s.tunnelID,
		ManagedByControl:  s.routeSyncURL != "",
		RouteSyncInterval: s.routeSyncInterval.String(),
	}
}

type syncedRoutesPayload struct {
	TunnelID string           `json:"tunnel_id"`
	Routes   []protocol.Route `json:"routes"`
}

func (s *Service) routeSyncLoop(ctx context.Context) {
	log.Printf("route sync enabled tunnel_id=%s source=%s interval=%s", s.tunnelID, s.routeSyncURL, s.routeSyncInterval)
	ticker := time.NewTicker(s.routeSyncInterval)
	defer ticker.Stop()

	s.syncRoutesFromControl(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.syncRoutesFromControl(ctx)
		}
	}
}

func (s *Service) syncRoutesFromControl(ctx context.Context) {
	reqURL, err := url.Parse(s.routeSyncURL)
	if err != nil {
		log.Printf("route sync parse url failed: %v", err)
		return
	}
	q := reqURL.Query()
	q.Set("tunnel_id", s.tunnelID)
	q.Set("token", s.tunnelToken)
	reqURL.RawQuery = q.Encode()

	reqCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, reqURL.String(), nil)
	if err != nil {
		log.Printf("route sync build request failed: %v", err)
		return
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("route sync request failed: %v", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<10))
		log.Printf("route sync failed status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(body)))
		return
	}

	var payload syncedRoutesPayload
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&payload); err != nil {
		log.Printf("route sync decode failed: %v", err)
		return
	}
	changed, err := s.store.ReplaceAll(payload.Routes)
	if err != nil {
		log.Printf("route sync apply failed: %v", err)
		return
	}
	if !changed {
		return
	}
	log.Printf("route sync applied %d routes", len(payload.Routes))
	if err := s.publishRoutes(); err != nil {
		log.Printf("route sync publish deferred: %v", err)
	}
}

func tokenHint(token string) string {
	if len(token) <= 8 {
		return token
	}
	return token[:4] + "..." + token[len(token)-4:]
}

type routePayload struct {
	Hostname string `json:"hostname"`
	Target   string `json:"target"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorJSON(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func (s *Service) adminMux() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handleIndex)
	mux.HandleFunc("/api/status", s.handleStatus)
	mux.HandleFunc("/api/routes", s.handleRoutes)
	mux.HandleFunc("/api/routes/", s.handleRouteByHost)
	return mux
}

func (s *Service) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(indexHTML))
}

func (s *Service) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, s.GetStatus())
}

func (s *Service) handleRoutes(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, http.StatusOK, map[string]any{"routes": s.store.List()})
	case http.MethodPost:
		if s.routeSyncURL != "" {
			errorJSON(w, http.StatusForbidden, "routes are managed by control plane")
			return
		}
		var payload routePayload
		if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&payload); err != nil {
			errorJSON(w, http.StatusBadRequest, "invalid json")
			return
		}
		if err := s.store.Upsert(payload.Hostname, payload.Target); err != nil {
			errorJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		syncErr := s.SyncRoutes()
		writeJSON(w, http.StatusOK, map[string]any{
			"ok":      true,
			"sync_ok": syncErr == nil,
			"routes":  s.store.List(),
			"warning": errText(syncErr),
		})
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Service) handleRouteByHost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if s.routeSyncURL != "" {
		errorJSON(w, http.StatusForbidden, "routes are managed by control plane")
		return
	}
	host := strings.TrimPrefix(r.URL.Path, "/api/routes/")
	host, _ = url.PathUnescape(host)
	if host == "" {
		errorJSON(w, http.StatusBadRequest, "hostname is required")
		return
	}
	if err := s.store.Delete(host); err != nil {
		errorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	syncErr := s.SyncRoutes()
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"sync_ok": syncErr == nil,
		"routes":  s.store.List(),
		"warning": errText(syncErr),
	})
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

const indexHTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Tunnel Agent</title>
  <style>
    :root {
      --bg: #f4f7fb;
      --card: #ffffff;
      --text: #0f172a;
      --muted: #475569;
      --line: #dbe2ea;
      --brand: #0b5fff;
      --brand2: #0a49c9;
      --danger: #d94848;
      --ok: #0f9d58;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      background: radial-gradient(circle at top right, #e8f0ff, var(--bg) 45%);
      color: var(--text);
      min-height: 100vh;
      padding: 28px;
    }
    .wrap { max-width: 920px; margin: 0 auto; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 20px;
      box-shadow: 0 10px 28px rgba(8, 36, 90, 0.08);
    }
    h1 { margin: 0 0 6px; font-size: 28px; }
    .sub { color: var(--muted); margin: 0 0 18px; }
    .status { display: flex; gap: 8px; align-items: center; margin-bottom: 18px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; }
    .online { background: var(--ok); }
    .offline { background: var(--danger); }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 10px;
      margin-bottom: 16px;
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      background: #fff;
    }
    button {
      border: none;
      border-radius: 10px;
      padding: 10px 14px;
      color: #fff;
      background: linear-gradient(135deg, var(--brand), var(--brand2));
      cursor: pointer;
      font-weight: 600;
    }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
    }
    th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); }
    th { color: #334155; background: #f8fafc; }
    tr:last-child td { border-bottom: none; }
    .danger {
      background: transparent;
      color: var(--danger);
      border: 1px solid #f2cccc;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 13px;
    }
    .hint { color: var(--muted); font-size: 13px; margin-top: 10px; min-height: 20px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Tunnel Agent</h1>
      <p class="sub">配置 域名 -> 本地 IP:端口 映射。公网请求会通过隧道转发到本地服务。</p>
      <div class="status">
        <span id="statusDot" class="dot offline"></span>
        <strong id="statusText">连接中...</strong>
        <span id="statusMeta" class="sub"></span>
      </div>

      <form id="routeForm" class="grid">
        <input id="hostname" placeholder="app.example.com" required />
        <input id="target" placeholder="127.0.0.1:3000" required />
        <button id="submitBtn" type="submit">保存</button>
      </form>

      <table>
        <thead>
          <tr>
            <th>域名</th>
            <th>本地目标</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="routeBody"></tbody>
      </table>
      <div id="hint" class="hint"></div>
    </div>
  </div>

<script>
  const routeBody = document.getElementById('routeBody');
  const hint = document.getElementById('hint');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusMeta = document.getElementById('statusMeta');

  async function fetchJSON(url, options = {}) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
    return data;
  }

  function showHint(msg, isError = false) {
    hint.textContent = msg || '';
    hint.style.color = isError ? '#d94848' : '#475569';
  }

  function renderRoutes(routes) {
    routeBody.innerHTML = '';
    if (!routes || routes.length === 0) {
      routeBody.innerHTML = '<tr><td colspan="3" style="color:#64748b">暂无映射</td></tr>';
      return;
    }

	for (const r of routes) {
	  const tr = document.createElement('tr');
	  tr.innerHTML = '<td>' + r.hostname + '</td>' +
	    '<td>' + r.target + '</td>' +
	    '<td><button class="danger" data-host="' + encodeURIComponent(r.hostname) + '">删除</button></td>';
      tr.querySelector('button').addEventListener('click', async () => {
        try {
          const data = await fetchJSON('/api/routes/' + encodeURIComponent(r.hostname), { method: 'DELETE' });
          renderRoutes(data.routes || []);
          showHint(data.sync_ok ? '删除成功并已同步。' : ('删除成功，但同步失败：' + (data.warning || 'unknown')));
        } catch (e) {
          showHint(e.message, true);
        }
      });
      routeBody.appendChild(tr);
    }
  }

  async function loadRoutes() {
    try {
      const data = await fetchJSON('/api/routes');
      renderRoutes(data.routes || []);
    } catch (e) {
      showHint(e.message, true);
    }
  }

  async function loadStatus() {
    try {
      const st = await fetchJSON('/api/status');
      const online = !!st.connected;
      statusDot.className = 'dot ' + (online ? 'online' : 'offline');
      statusText.textContent = online ? '隧道已连接' : '隧道未连接';
	  statusMeta.textContent = '服务器: ' + st.server_url + ' 令牌: ' + st.token_hint;
      if (!online && st.last_error) {
        showHint('最近错误: ' + st.last_error, true);
      }
    } catch (e) {
      showHint(e.message, true);
    }
  }

  document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const hostname = document.getElementById('hostname').value.trim();
    const target = document.getElementById('target').value.trim();
    if (!hostname || !target) return;

    try {
      const data = await fetchJSON('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname, target })
      });
      renderRoutes(data.routes || []);
      showHint(data.sync_ok ? '保存成功并已同步。' : ('保存成功，但同步失败：' + (data.warning || 'unknown')));
      document.getElementById('hostname').value = '';
      document.getElementById('target').value = '';
    } catch (e) {
      showHint(e.message, true);
    }
  });

  loadRoutes();
  loadStatus();
  setInterval(loadStatus, 5000);
</script>
</body>
</html>`
