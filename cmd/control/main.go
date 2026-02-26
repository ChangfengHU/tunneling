package main

import (
	"flag"
	"log"
	"net/http"
	"os"
	"strings"

	"tunneling/internal/control"
)

func main() {
	var (
		addr = flag.String("addr", ":18100", "control api listen address")
	)
	flag.Parse()

	supabaseURL := envOr("SUPABASE_URL", "")
	supabaseKey := envOr("SUPABASE_SERVICE_ROLE_KEY", "")
	agentServerWS := envOr("AGENT_SERVER_WS", "ws://127.0.0.1/connect")
	agentConfigURL := envOr("AGENT_CONFIG_URL", "http://127.0.0.1:18100/agent/routes")
	defaultAdminAddr := envOr("DEFAULT_AGENT_ADMIN_ADDR", "127.0.0.1:17001")

	client, err := control.NewSupabaseClient(supabaseURL, supabaseKey)
	if err != nil {
		log.Fatalf("supabase init failed: %v", err)
	}

	srv := control.NewServer(client, strings.TrimSpace(agentServerWS), strings.TrimSpace(agentConfigURL), strings.TrimSpace(defaultAdminAddr))

	log.Printf("control api listening on %s", *addr)
	if err := http.ListenAndServe(*addr, srv.Handler()); err != nil {
		log.Fatalf("control api failed: %v", err)
	}
}

func envOr(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}
