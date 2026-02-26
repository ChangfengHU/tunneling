package protocol

const (
	TypeRegisterRoutes = "register_routes"
	TypeProxyRequest   = "proxy_request"
	TypeProxyResponse  = "proxy_response"
	TypeError          = "error"
)

type Route struct {
	Hostname string `json:"hostname"`
	Target   string `json:"target"`
}

type Envelope struct {
	Type      string              `json:"type"`
	RequestID string              `json:"request_id,omitempty"`
	Method    string              `json:"method,omitempty"`
	Path      string              `json:"path,omitempty"`
	Query     string              `json:"query,omitempty"`
	Headers   map[string][]string `json:"headers,omitempty"`
	Body      string              `json:"body,omitempty"`
	Status    int                 `json:"status,omitempty"`
	Hostname  string              `json:"hostname,omitempty"`
	Target    string              `json:"target,omitempty"`
	Routes    []Route             `json:"routes,omitempty"`
	Message   string              `json:"message,omitempty"`
}

func CloneHeaders(h map[string][]string) map[string][]string {
	if len(h) == 0 {
		return map[string][]string{}
	}
	out := make(map[string][]string, len(h))
	for k, v := range h {
		copied := make([]string, len(v))
		copy(copied, v)
		out[k] = copied
	}
	return out
}
