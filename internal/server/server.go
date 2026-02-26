package server

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"

	"tunneling/internal/protocol"
)

const maxBodySize = 10 << 20 // 10MB

type routeBinding struct {
	Token  string
	Target string
}

type AgentSession struct {
	Token string
	Conn  *websocket.Conn

	writeMu   sync.Mutex
	pendingMu sync.Mutex
	pending   map[string]chan protocol.Envelope
}

func newAgentSession(token string, conn *websocket.Conn) *AgentSession {
	return &AgentSession{
		Token:   token,
		Conn:    conn,
		pending: make(map[string]chan protocol.Envelope),
	}
}

func (s *AgentSession) Write(env protocol.Envelope) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	return s.Conn.WriteJSON(env)
}

func (s *AgentSession) AddPending(requestID string, ch chan protocol.Envelope) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()
	s.pending[requestID] = ch
}

func (s *AgentSession) PopPending(requestID string) (chan protocol.Envelope, bool) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()
	ch, ok := s.pending[requestID]
	if ok {
		delete(s.pending, requestID)
	}
	return ch, ok
}

func (s *AgentSession) RemovePending(requestID string) {
	s.pendingMu.Lock()
	defer s.pendingMu.Unlock()
	delete(s.pending, requestID)
}

type TunnelServer struct {
	upgrader websocket.Upgrader

	agentsMu sync.RWMutex
	agents   map[string]*AgentSession

	routesMu sync.RWMutex
	routes   map[string]routeBinding

	requestSeq     atomic.Uint64
	requestTimeout time.Duration
}

func New(requestTimeout time.Duration) *TunnelServer {
	return &TunnelServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(_ *http.Request) bool { return true },
		},
		agents:         make(map[string]*AgentSession),
		routes:         make(map[string]routeBinding),
		requestTimeout: requestTimeout,
	}
}

func (s *TunnelServer) HandleConnect(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		http.Error(w, "missing token", http.StatusBadRequest)
		return
	}

	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade failed: %v", err)
		return
	}
	conn.SetReadLimit(maxBodySize + (2 << 20))

	session := newAgentSession(token, conn)
	previous := s.swapAgent(token, session)
	if previous != nil {
		_ = previous.Conn.Close()
	}

	log.Printf("agent connected token=%s remote=%s", token, r.RemoteAddr)

	s.readLoop(session)
}

func (s *TunnelServer) readLoop(session *AgentSession) {
	defer func() {
		s.cleanupAgent(session)
		_ = session.Conn.Close()
		log.Printf("agent disconnected token=%s", session.Token)
	}()

	for {
		var env protocol.Envelope
		if err := session.Conn.ReadJSON(&env); err != nil {
			if websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) || errors.Is(err, io.EOF) {
				return
			}
			log.Printf("read agent message failed token=%s err=%v", session.Token, err)
			return
		}

		switch env.Type {
		case protocol.TypeRegisterRoutes:
			s.applyRoutes(session.Token, env.Routes)
		case protocol.TypeProxyResponse:
			if env.RequestID == "" {
				continue
			}
			if ch, ok := session.PopPending(env.RequestID); ok {
				ch <- env
			}
		case protocol.TypeError:
			log.Printf("agent error token=%s msg=%s", session.Token, env.Message)
		default:
			log.Printf("unknown agent message token=%s type=%s", session.Token, env.Type)
		}
	}
}

func (s *TunnelServer) cleanupAgent(session *AgentSession) {
	shouldClearRoutes := false

	s.agentsMu.Lock()
	current, ok := s.agents[session.Token]
	if ok && current == session {
		delete(s.agents, session.Token)
		shouldClearRoutes = true
	}
	s.agentsMu.Unlock()

	if !shouldClearRoutes {
		return
	}

	s.routesMu.Lock()
	for host, binding := range s.routes {
		if binding.Token == session.Token {
			delete(s.routes, host)
		}
	}
	s.routesMu.Unlock()
}

func (s *TunnelServer) swapAgent(token string, next *AgentSession) *AgentSession {
	s.agentsMu.Lock()
	defer s.agentsMu.Unlock()
	prev := s.agents[token]
	s.agents[token] = next
	return prev
}

func (s *TunnelServer) applyRoutes(token string, routes []protocol.Route) {
	s.routesMu.Lock()
	defer s.routesMu.Unlock()

	for host, binding := range s.routes {
		if binding.Token == token {
			delete(s.routes, host)
		}
	}

	for _, route := range routes {
		host := normalizeHost(route.Hostname)
		target := strings.TrimSpace(route.Target)
		if host == "" || target == "" {
			continue
		}
		s.routes[host] = routeBinding{Token: token, Target: target}
	}

	log.Printf("routes updated token=%s count=%d", token, len(routes))
}

func (s *TunnelServer) HandlePublicHTTP(w http.ResponseWriter, r *http.Request) {
	host := normalizeHost(r.Host)
	if host == "" {
		http.Error(w, "invalid host", http.StatusBadRequest)
		return
	}

	s.routesMu.RLock()
	binding, ok := s.routes[host]
	s.routesMu.RUnlock()
	if !ok {
		http.NotFound(w, r)
		return
	}

	s.agentsMu.RLock()
	session := s.agents[binding.Token]
	s.agentsMu.RUnlock()
	if session == nil {
		http.Error(w, "tunnel offline", http.StatusServiceUnavailable)
		return
	}

	body, err := io.ReadAll(io.LimitReader(r.Body, maxBodySize))
	if err != nil {
		http.Error(w, "read request failed", http.StatusBadRequest)
		return
	}

	headers := protocol.CloneHeaders(r.Header)
	stripHopHeaders(headers)
	appendXForwarded(headers, r)

	requestID := strconv.FormatUint(s.requestSeq.Add(1), 10)
	respCh := make(chan protocol.Envelope, 1)
	session.AddPending(requestID, respCh)
	defer session.RemovePending(requestID)

	env := protocol.Envelope{
		Type:      protocol.TypeProxyRequest,
		RequestID: requestID,
		Method:    r.Method,
		Path:      r.URL.Path,
		Query:     r.URL.RawQuery,
		Headers:   headers,
		Body:      base64.StdEncoding.EncodeToString(body),
		Hostname:  host,
		Target:    binding.Target,
	}

	if err := session.Write(env); err != nil {
		http.Error(w, "send to tunnel failed", http.StatusBadGateway)
		return
	}

	select {
	case resp := <-respCh:
		writeResponse(w, resp)
	case <-time.After(s.requestTimeout):
		http.Error(w, "tunnel timeout", http.StatusGatewayTimeout)
	}
}

func writeResponse(w http.ResponseWriter, resp protocol.Envelope) {
	status := resp.Status
	if status == 0 {
		status = http.StatusBadGateway
	}
	for k, v := range resp.Headers {
		for _, item := range v {
			w.Header().Add(k, item)
		}
	}
	w.WriteHeader(status)

	if resp.Body == "" {
		return
	}
	body, err := base64.StdEncoding.DecodeString(resp.Body)
	if err != nil {
		_, _ = w.Write([]byte("decode response body failed"))
		return
	}
	_, _ = w.Write(body)
}

func normalizeHost(host string) string {
	host = strings.TrimSpace(strings.ToLower(host))
	if host == "" {
		return ""
	}
	if strings.Contains(host, ":") {
		h, _, err := net.SplitHostPort(host)
		if err == nil {
			return strings.TrimSpace(strings.ToLower(h))
		}
		if strings.Count(host, ":") == 1 {
			parts := strings.Split(host, ":")
			return strings.TrimSpace(strings.ToLower(parts[0]))
		}
	}
	return host
}

func appendXForwarded(headers map[string][]string, r *http.Request) {
	clientIP := extractClientIP(r.RemoteAddr)
	if clientIP != "" {
		headers["X-Forwarded-For"] = append(headers["X-Forwarded-For"], clientIP)
	}
	headers["X-Forwarded-Host"] = []string{normalizeHost(r.Host)}
	if r.TLS != nil {
		headers["X-Forwarded-Proto"] = []string{"https"}
	} else {
		headers["X-Forwarded-Proto"] = []string{"http"}
	}
}

func extractClientIP(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
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

func (s *TunnelServer) DebugState() string {
	s.agentsMu.RLock()
	agents := len(s.agents)
	s.agentsMu.RUnlock()

	s.routesMu.RLock()
	routes := len(s.routes)
	s.routesMu.RUnlock()

	return fmt.Sprintf("agents=%d routes=%d", agents, routes)
}
