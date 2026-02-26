package agent

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"tunneling/internal/protocol"
)

type ConfigStore struct {
	path string
	mu   sync.RWMutex

	routes map[string]protocol.Route
}

type fileConfig struct {
	Routes []protocol.Route `json:"routes"`
}

func NewConfigStore(path string) (*ConfigStore, error) {
	store := &ConfigStore{
		path:   path,
		routes: make(map[string]protocol.Route),
	}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *ConfigStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := os.Stat(s.path); errors.Is(err, os.ErrNotExist) {
		return nil
	}

	data, err := os.ReadFile(s.path)
	if err != nil {
		return fmt.Errorf("read config: %w", err)
	}

	var cfg fileConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return fmt.Errorf("parse config: %w", err)
	}

	for _, route := range cfg.Routes {
		host, err := NormalizeHostname(route.Hostname)
		if err != nil {
			continue
		}
		target, err := NormalizeTarget(route.Target)
		if err != nil {
			continue
		}
		s.routes[host] = protocol.Route{Hostname: host, Target: target}
	}

	return nil
}

func (s *ConfigStore) saveLocked() error {
	cfg := fileConfig{Routes: s.snapshotLocked()}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode config: %w", err)
	}

	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create config dir: %w", err)
	}

	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return fmt.Errorf("write temp config: %w", err)
	}
	if err := os.Rename(tmp, s.path); err != nil {
		return fmt.Errorf("replace config: %w", err)
	}
	return nil
}

func (s *ConfigStore) snapshotLocked() []protocol.Route {
	out := make([]protocol.Route, 0, len(s.routes))
	for _, route := range s.routes {
		out = append(out, route)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Hostname < out[j].Hostname
	})
	return out
}

func (s *ConfigStore) List() []protocol.Route {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]protocol.Route, 0, len(s.routes))
	for _, route := range s.routes {
		out = append(out, route)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Hostname < out[j].Hostname
	})
	return out
}

func (s *ConfigStore) Upsert(hostname, target string) error {
	host, err := NormalizeHostname(hostname)
	if err != nil {
		return err
	}
	normalizedTarget, err := NormalizeTarget(target)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.routes[host] = protocol.Route{Hostname: host, Target: normalizedTarget}
	return s.saveLocked()
}

func (s *ConfigStore) Delete(hostname string) error {
	host, err := NormalizeHostname(hostname)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.routes, host)
	return s.saveLocked()
}

func (s *ConfigStore) ReplaceAll(routes []protocol.Route) (bool, error) {
	next := make(map[string]protocol.Route, len(routes))
	for _, route := range routes {
		host, err := NormalizeHostname(route.Hostname)
		if err != nil {
			return false, err
		}
		target, err := NormalizeTarget(route.Target)
		if err != nil {
			return false, err
		}
		next[host] = protocol.Route{Hostname: host, Target: target}
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if len(next) == len(s.routes) {
		same := true
		for host, route := range next {
			current, ok := s.routes[host]
			if !ok || current.Target != route.Target {
				same = false
				break
			}
		}
		if same {
			return false, nil
		}
	}

	s.routes = next
	if err := s.saveLocked(); err != nil {
		return false, err
	}
	return true, nil
}

func NormalizeHostname(hostname string) (string, error) {
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

func NormalizeTarget(target string) (string, error) {
	t := strings.TrimSpace(target)
	if t == "" {
		return "", errors.New("target is required")
	}
	if strings.Contains(t, "http://") || strings.Contains(t, "https://") {
		return "", errors.New("target should be host:port, e.g. 127.0.0.1:3000")
	}
	if !strings.Contains(t, ":") {
		return "", errors.New("target must include port, e.g. 127.0.0.1:3000")
	}
	return t, nil
}
