package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"time"

	"tunneling/internal/server"
)

func main() {
	var (
		addr           = flag.String("addr", "", "single address for both public and control, e.g. :80")
		publicAddr     = flag.String("public-addr", ":8080", "public http address")
		controlAddr    = flag.String("control-addr", ":9000", "agent websocket control address")
		controlAPI     = flag.String("control-api", "http://127.0.0.1:18100", "internal control api address for route sync proxy")
		routeSyncPath  = flag.String("route-sync-path", "/_tunnel/agent/routes", "public path to proxy agent route sync requests")
		requestTimeout = flag.Duration("request-timeout", 30*time.Second, "timeout when waiting for agent response")
	)
	flag.Parse()

	ts := server.New(*requestTimeout)

	controlMux := http.NewServeMux()
	controlMux.HandleFunc("/connect", ts.HandleConnect)
	controlMux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	controlMux.HandleFunc("/debug/state", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(ts.DebugState()))
	})

	publicMux := http.NewServeMux()
	if err := registerRouteSyncProxy(publicMux, *routeSyncPath, *controlAPI); err != nil {
		log.Fatalf("register route sync proxy failed: %v", err)
	}
	publicMux.HandleFunc("/", ts.HandlePublicHTTP)

	if *addr != "" {
		unified := http.NewServeMux()
		unified.HandleFunc("/connect", ts.HandleConnect)
		unified.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("ok"))
		})
		unified.HandleFunc("/debug/state", func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(ts.DebugState()))
		})
		if err := registerRouteSyncProxy(unified, *routeSyncPath, *controlAPI); err != nil {
			log.Fatalf("register route sync proxy failed: %v", err)
		}
		unified.HandleFunc("/", ts.HandlePublicHTTP)

		log.Printf("unified gateway listening on %s", *addr)
		if err := http.ListenAndServe(*addr, unified); err != nil {
			log.Fatalf("unified gateway failed: %v", err)
		}
		return
	}

	go func() {
		log.Printf("control server listening on %s", *controlAddr)
		if err := http.ListenAndServe(*controlAddr, controlMux); err != nil {
			log.Fatalf("control server failed: %v", err)
		}
	}()

	log.Printf("public gateway listening on %s", *publicAddr)
	if err := http.ListenAndServe(*publicAddr, publicMux); err != nil {
		log.Fatalf("public gateway failed: %v", err)
	}
}

func registerRouteSyncProxy(mux *http.ServeMux, publicPath string, controlAPI string) error {
	if publicPath == "" {
		return nil
	}
	target, err := url.Parse(controlAPI)
	if err != nil {
		return err
	}
	proxy := httputil.NewSingleHostReverseProxy(target)
	director := proxy.Director
	proxy.Director = func(req *http.Request) {
		director(req)
		req.URL.Path = "/agent/routes"
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, err error) {
		http.Error(w, "route sync upstream error: "+err.Error(), http.StatusBadGateway)
	}

	mux.HandleFunc(publicPath, func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		proxy.ServeHTTP(w, r)
	})
	return nil
}
