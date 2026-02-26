package control

import "tunneling/internal/protocol"

type Tunnel struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Token     string `json:"token,omitempty"`
	CreatedAt string `json:"created_at,omitempty"`
}

type Route struct {
	ID        string `json:"id,omitempty"`
	TunnelID  string `json:"tunnel_id"`
	Hostname  string `json:"hostname"`
	Target    string `json:"target"`
	Enabled   bool   `json:"enabled"`
	CreatedAt string `json:"created_at,omitempty"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type AgentRoutesResponse struct {
	TunnelID string           `json:"tunnel_id"`
	Routes   []protocol.Route `json:"routes"`
}
