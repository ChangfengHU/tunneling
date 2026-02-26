package control

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"tunneling/internal/protocol"
)

type Server struct {
	supabase        *SupabaseClient
	agentServerWS   string
	agentConfigURL  string
	defaultAdminAPI string
	events          *EventStore
}

func NewServer(supabase *SupabaseClient, agentServerWS, agentConfigURL, defaultAdminAPI string) *Server {
	return &Server{
		supabase:        supabase,
		agentServerWS:   strings.TrimSpace(agentServerWS),
		agentConfigURL:  strings.TrimSpace(agentConfigURL),
		defaultAdminAPI: strings.TrimSpace(defaultAdminAPI),
		events:          NewEventStore(2000),
	}
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/api/tunnels", s.handleTunnels)
	mux.HandleFunc("/api/routes", s.handleRoutes)
	mux.HandleFunc("/api/tunnels/", s.handleTunnelByID)
	mux.HandleFunc("/api/logs", s.handleLogs)
	mux.HandleFunc("/agent/routes", s.handleAgentRoutes)
	return mux
}

func (s *Server) handleHealthz(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) handleTunnels(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleListTunnels(w, r)
	case http.MethodPost:
		s.handleCreateTunnel(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleListTunnels(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	rows, err := s.supabase.ListTunnels(ctx)
	if err != nil {
		errorJSON(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"tunnels": rows})
}

type createTunnelRequest struct {
	Name string `json:"name"`
}

func (s *Server) handleCreateTunnel(w http.ResponseWriter, r *http.Request) {
	var req createTunnelRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid json")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		errorJSON(w, http.StatusBadRequest, "name is required")
		return
	}

	token, err := randomToken(32)
	if err != nil {
		errorJSON(w, http.StatusInternalServerError, "generate token failed")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	tunnel, err := s.supabase.CreateTunnel(ctx, req.Name, token)
	if err != nil {
		errorJSON(w, http.StatusBadGateway, err.Error())
		s.events.Add("error", "tunnel.create.failed", "", err.Error())
		return
	}
	s.events.Add("info", "tunnel.created", tunnel.ID, "created tunnel "+tunnel.Name)

	writeJSON(w, http.StatusOK, map[string]any{
		"tunnel":        tunnel,
		"agent_command": s.agentCommand(tunnel.ID, tunnel.Token),
	})
}

type upsertRouteRequest struct {
	TunnelID string `json:"tunnel_id"`
	Hostname string `json:"hostname"`
	Target   string `json:"target"`
	Enabled  *bool  `json:"enabled,omitempty"`
}

func (s *Server) handleRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req upsertRouteRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid json")
		return
	}

	tunnelID := strings.TrimSpace(req.TunnelID)
	if tunnelID == "" {
		errorJSON(w, http.StatusBadRequest, "tunnel_id is required")
		return
	}

	hostname, err := normalizeHostname(req.Hostname)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	target, err := normalizeTarget(req.Target)
	if err != nil {
		errorJSON(w, http.StatusBadRequest, err.Error())
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	if _, err := s.supabase.GetTunnelByID(ctx, tunnelID); err != nil {
		errorJSON(w, http.StatusBadRequest, "invalid tunnel_id")
		return
	}

	route, err := s.supabase.UpsertRoute(ctx, Route{
		TunnelID: tunnelID,
		Hostname: hostname,
		Target:   target,
		Enabled:  enabled,
	})
	if err != nil {
		errorJSON(w, http.StatusBadGateway, err.Error())
		s.events.Add("error", "route.upsert.failed", tunnelID, err.Error())
		return
	}
	s.events.Add("info", "route.upserted", tunnelID, fmt.Sprintf("%s => %s enabled=%t", route.Hostname, route.Target, route.Enabled))
	writeJSON(w, http.StatusOK, map[string]any{"route": route})
}

func (s *Server) handleTunnelByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/tunnels/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) < 2 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}

	tunnelID := parts[0]
	action := parts[1]

	switch {
	case r.Method == http.MethodGet && action == "routes":
		s.handleListTunnelRoutes(w, r, tunnelID)
	case r.Method == http.MethodGet && action == "command":
		s.handleTunnelCommand(w, r, tunnelID)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleListTunnelRoutes(w http.ResponseWriter, r *http.Request, tunnelID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	routes, err := s.supabase.ListRoutesByTunnel(ctx, tunnelID)
	if err != nil {
		errorJSON(w, http.StatusBadGateway, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"routes": routes})
}

func (s *Server) handleTunnelCommand(w http.ResponseWriter, r *http.Request, tunnelID string) {
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	tunnel, err := s.supabase.GetTunnelByID(ctx, tunnelID)
	if err != nil {
		errorJSON(w, http.StatusNotFound, err.Error())
		s.events.Add("error", "tunnel.command.failed", tunnelID, err.Error())
		return
	}
	s.events.Add("info", "tunnel.command.requested", tunnelID, "generated startup command")

	writeJSON(w, http.StatusOK, map[string]any{
		"tunnel_id":        tunnel.ID,
		"agent_command":    s.agentCommand(tunnel.ID, tunnel.Token),
		"agent_config_url": s.agentConfigURL,
	})
}

func (s *Server) handleAgentRoutes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tunnelID := strings.TrimSpace(r.URL.Query().Get("tunnel_id"))
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if tunnelID == "" || token == "" {
		errorJSON(w, http.StatusBadRequest, "tunnel_id and token are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	if _, err := s.supabase.ValidateTunnelToken(ctx, tunnelID, token); err != nil {
		errorJSON(w, http.StatusUnauthorized, "invalid tunnel credentials")
		s.events.Add("warn", "agent.routes.auth_failed", tunnelID, "invalid tunnel credentials")
		return
	}

	routes, err := s.supabase.ListEnabledProtocolRoutesByTunnel(ctx, tunnelID)
	if err != nil {
		errorJSON(w, http.StatusBadGateway, err.Error())
		return
	}
	mapped := make([]protocol.Route, 0, len(routes))
	for _, item := range routes {
		mapped = append(mapped, protocol.Route{Hostname: item.Hostname, Target: item.Target})
	}
	writeJSON(w, http.StatusOK, AgentRoutesResponse{TunnelID: tunnelID, Routes: mapped})
}

func (s *Server) handleLogs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	tunnelID := strings.TrimSpace(r.URL.Query().Get("tunnel_id"))
	limit := 100
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			limit = n
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"logs": s.events.List(tunnelID, limit),
	})
}

func (s *Server) agentCommand(tunnelID, token string) string {
	adminAddr := s.defaultAdminAPI
	if adminAddr == "" {
		adminAddr = "127.0.0.1:17001"
	}
	return fmt.Sprintf("./agent -server %s -token %s -route-sync-url %s -tunnel-id %s -tunnel-token %s -admin-addr %s", s.agentServerWS, token, s.agentConfigURL, tunnelID, token, adminAddr)
}

func decodeJSON(body io.Reader, out any) error {
	dec := json.NewDecoder(io.LimitReader(body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(out)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func errorJSON(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]any{"error": msg})
}

func randomToken(n int) (string, error) {
	if n < 16 {
		return "", errors.New("token length too short")
	}
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func normalizeHostname(hostname string) (string, error) {
	host := strings.TrimSpace(strings.ToLower(hostname))
	host = strings.TrimSuffix(host, ".")
	if host == "" {
		return "", errors.New("hostname is required")
	}
	if strings.Contains(host, " ") {
		return "", errors.New("hostname cannot contain spaces")
	}
	if strings.Contains(host, ":") {
		return "", errors.New("hostname cannot include port")
	}
	if !strings.Contains(host, ".") {
		return "", errors.New("hostname must be a domain, e.g. app.example.com")
	}
	return host, nil
}

func normalizeTarget(target string) (string, error) {
	t := strings.TrimSpace(target)
	if t == "" {
		return "", errors.New("target is required")
	}
	if strings.HasPrefix(t, "http://") || strings.HasPrefix(t, "https://") {
		return "", errors.New("target should be host:port, e.g. 127.0.0.1:3000")
	}
	if !strings.Contains(t, ":") {
		return "", errors.New("target must include port, e.g. 127.0.0.1:3000")
	}
	return t, nil
}

func mustWSURL(baseURL string) string {
	baseURL = strings.TrimSpace(strings.TrimRight(baseURL, "/"))
	if baseURL == "" {
		return ""
	}
	if strings.HasPrefix(baseURL, "ws://") || strings.HasPrefix(baseURL, "wss://") {
		return baseURL
	}
	u, err := url.Parse(baseURL)
	if err != nil {
		log.Printf("invalid url: %v", err)
		return ""
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	u.Path = "/connect"
	u.RawQuery = ""
	return u.String()
}
