package control

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type SupabaseClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

var ErrNotFound = errors.New("not found")

func NewSupabaseClient(baseURL, apiKey string) (*SupabaseClient, error) {
	baseURL = strings.TrimSpace(strings.TrimRight(baseURL, "/"))
	apiKey = strings.TrimSpace(apiKey)
	if baseURL == "" {
		return nil, errors.New("SUPABASE_URL is required")
	}
	if apiKey == "" {
		return nil, errors.New("SUPABASE_SERVICE_ROLE_KEY is required")
	}
	return &SupabaseClient{
		baseURL: baseURL,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}, nil
}

func (c *SupabaseClient) ListTunnels(ctx context.Context) ([]Tunnel, error) {
	query := url.Values{}
	query.Set("select", "id,name,created_at")
	query.Set("order", "created_at.desc")

	var out []Tunnel
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_tunnels", query, nil, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

func (c *SupabaseClient) CreateTunnel(ctx context.Context, name, token string) (Tunnel, error) {
	return c.CreateTunnelWithMeta(ctx, name, token, "", "")
}

func (c *SupabaseClient) CreateTunnelWithMeta(ctx context.Context, name, token, ownerID, projectKey string) (Tunnel, error) {
	basePayload := map[string]any{
		"name":  name,
		"token": token,
	}
	payload := map[string]any{
		"name":  name,
		"token": token,
	}
	useMeta := false
	if strings.TrimSpace(ownerID) != "" {
		useMeta = true
		payload["owner_id"] = strings.TrimSpace(ownerID)
	}
	if strings.TrimSpace(projectKey) != "" {
		useMeta = true
		payload["project_key"] = strings.TrimSpace(projectKey)
	}

	query := url.Values{}
	query.Set("select", "id,name,token,created_at")

	headers := map[string]string{
		"Prefer": "return=representation",
	}

	var rows []Tunnel
	if err := c.requestJSON(ctx, http.MethodPost, "/rest/v1/tunnel_tunnels", query, headers, payload, &rows); err != nil {
		if useMeta && isMissingColumnError(err) {
			rows = nil
			if err2 := c.requestJSON(ctx, http.MethodPost, "/rest/v1/tunnel_tunnels", query, headers, basePayload, &rows); err2 != nil {
				return Tunnel{}, err2
			}
		} else {
			return Tunnel{}, err
		}
	}
	if len(rows) == 0 {
		return Tunnel{}, errors.New("create tunnel returned empty result")
	}
	return rows[0], nil
}

func (c *SupabaseClient) GetTunnelByID(ctx context.Context, id string) (Tunnel, error) {
	query := url.Values{}
	query.Set("select", "id,name,token,created_at")
	query.Set("id", "eq."+id)
	query.Set("limit", "1")

	var rows []Tunnel
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_tunnels", query, nil, nil, &rows); err != nil {
		return Tunnel{}, err
	}
	if len(rows) == 0 {
		return Tunnel{}, errors.New("tunnel not found")
	}
	return rows[0], nil
}

func (c *SupabaseClient) ValidateTunnelToken(ctx context.Context, tunnelID, token string) (Tunnel, error) {
	query := url.Values{}
	query.Set("select", "id,name,token,created_at")
	query.Set("id", "eq."+tunnelID)
	query.Set("token", "eq."+token)
	query.Set("limit", "1")

	var rows []Tunnel
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_tunnels", query, nil, nil, &rows); err != nil {
		return Tunnel{}, err
	}
	if len(rows) == 0 {
		return Tunnel{}, errors.New("invalid tunnel id or token")
	}
	return rows[0], nil
}

func (c *SupabaseClient) UpsertRoute(ctx context.Context, route Route) (Route, error) {
	query := url.Values{}
	query.Set("on_conflict", "hostname")
	query.Set("select", "id,tunnel_id,hostname,target,enabled,created_at,updated_at")

	headers := map[string]string{
		"Prefer": "resolution=merge-duplicates,return=representation",
	}

	payload := []Route{route}

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodPost, "/rest/v1/tunnel_routes", query, headers, payload, &rows); err != nil {
		return Route{}, err
	}
	if len(rows) == 0 {
		return Route{}, errors.New("upsert route returned empty result")
	}
	return rows[0], nil
}

func (c *SupabaseClient) CreateRoute(ctx context.Context, route Route) (Route, error) {
	query := url.Values{}
	query.Set("select", "id,tunnel_id,hostname,target,enabled,created_at,updated_at")

	headers := map[string]string{
		"Prefer": "return=representation",
	}

	payload := map[string]any{
		"tunnel_id": route.TunnelID,
		"hostname":  route.Hostname,
		"target":    route.Target,
		"enabled":   route.Enabled,
	}

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodPost, "/rest/v1/tunnel_routes", query, headers, payload, &rows); err != nil {
		return Route{}, err
	}
	if len(rows) == 0 {
		return Route{}, errors.New("create route returned empty result")
	}
	return rows[0], nil
}

func (c *SupabaseClient) UpdateRoute(ctx context.Context, routeID string, target string, enabled bool) (Route, error) {
	return c.UpdateRouteBinding(ctx, routeID, "", target, enabled)
}

func (c *SupabaseClient) UpdateRouteBinding(ctx context.Context, routeID string, tunnelID string, target string, enabled bool) (Route, error) {
	query := url.Values{}
	query.Set("id", "eq."+routeID)
	query.Set("select", "id,tunnel_id,hostname,target,enabled,created_at,updated_at")

	headers := map[string]string{
		"Prefer": "return=representation",
	}

	payload := map[string]any{"target": target, "enabled": enabled}
	if strings.TrimSpace(tunnelID) != "" {
		payload["tunnel_id"] = strings.TrimSpace(tunnelID)
	}

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodPatch, "/rest/v1/tunnel_routes", query, headers, payload, &rows); err != nil {
		return Route{}, err
	}
	if len(rows) == 0 {
		return Route{}, ErrNotFound
	}
	return rows[0], nil
}

func (c *SupabaseClient) GetRouteByHostname(ctx context.Context, hostname string) (Route, error) {
	query := url.Values{}
	query.Set("select", "id,tunnel_id,hostname,target,enabled,created_at,updated_at")
	query.Set("hostname", "eq."+hostname)
	query.Set("limit", "1")

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_routes", query, nil, nil, &rows); err != nil {
		return Route{}, err
	}
	if len(rows) == 0 {
		return Route{}, ErrNotFound
	}
	return rows[0], nil
}

func (c *SupabaseClient) DeleteTunnelByID(ctx context.Context, tunnelID string) error {
	query := url.Values{}
	query.Set("id", "eq."+tunnelID)
	headers := map[string]string{
		"Prefer": "return=minimal",
	}
	return c.requestJSON(ctx, http.MethodDelete, "/rest/v1/tunnel_tunnels", query, headers, nil, nil)
}

func (c *SupabaseClient) ListRoutesByTunnel(ctx context.Context, tunnelID string) ([]Route, error) {
	query := url.Values{}
	query.Set("select", "id,tunnel_id,hostname,target,enabled,created_at,updated_at")
	query.Set("tunnel_id", "eq."+tunnelID)
	query.Set("order", "hostname.asc")

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_routes", query, nil, nil, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (c *SupabaseClient) ListEnabledProtocolRoutesByTunnel(ctx context.Context, tunnelID string) ([]Route, error) {
	query := url.Values{}
	query.Set("select", "hostname,target,enabled")
	query.Set("tunnel_id", "eq."+tunnelID)
	query.Set("enabled", "eq.true")
	query.Set("order", "hostname.asc")

	var rows []Route
	if err := c.requestJSON(ctx, http.MethodGet, "/rest/v1/tunnel_routes", query, nil, nil, &rows); err != nil {
		return nil, err
	}
	return rows, nil
}

func (c *SupabaseClient) requestJSON(ctx context.Context, method, path string, query url.Values, extraHeaders map[string]string, payload any, out any) error {
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}

	var body io.Reader
	if payload != nil {
		data, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("marshal payload: %w", err)
		}
		body = bytes.NewReader(data)
	}

	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("apikey", c.apiKey)
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range extraHeaders {
		req.Header.Set(k, v)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("supabase error status=%d body=%s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	if out == nil {
		return nil
	}
	if len(respBody) == 0 {
		return nil
	}
	if err := json.Unmarshal(respBody, out); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}
	return nil
}

func isMissingColumnError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "could not find the") && strings.Contains(msg, "column") ||
		(strings.Contains(msg, "column") && strings.Contains(msg, "does not exist"))
}
