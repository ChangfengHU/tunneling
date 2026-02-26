package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"tunneling/internal/agent"
)

func main() {
	var (
		serverURL         = flag.String("server", "ws://127.0.0.1:9000/connect", "websocket server url, e.g. ws://your-server:9000/connect")
		token             = flag.String("token", "", "agent token used to connect tunnel server")
		adminAddr         = flag.String("admin-addr", "127.0.0.1:7000", "local admin ui address")
		config            = flag.String("config", defaultConfigPath(), "config file path")
		routeSyncURL      = flag.String("route-sync-url", "", "control plane endpoint, e.g. http://your-server:18100/agent/routes")
		tunnelID          = flag.String("tunnel-id", "", "tunnel id for route sync")
		tunnelToken       = flag.String("tunnel-token", "", "tunnel token for route sync auth")
		routeSyncInterval = flag.Duration("route-sync-interval", 5*time.Second, "route sync polling interval")
	)
	flag.Parse()

	if *token == "" {
		log.Fatal("-token is required")
	}

	store, err := agent.NewConfigStore(*config)
	if err != nil {
		log.Fatalf("load config failed: %v", err)
	}

	svc, err := agent.NewService(*serverURL, *token, *adminAddr, *routeSyncURL, *tunnelID, *tunnelToken, *routeSyncInterval, store)
	if err != nil {
		log.Fatalf("create service failed: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	log.Printf("agent started config=%s", *config)
	if err := svc.Run(ctx); err != nil {
		log.Fatalf("agent exited with error: %v", err)
	}
	log.Printf("agent exited")
}

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "./agent-config.json"
	}
	return filepath.Join(home, ".tunneling-agent", "config.json")
}
