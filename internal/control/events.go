package control

import (
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type LogEntry struct {
	ID       int64  `json:"id"`
	Time     string `json:"time"`
	Level    string `json:"level"`
	Event    string `json:"event"`
	TunnelID string `json:"tunnel_id,omitempty"`
	Message  string `json:"message"`
}

type EventStore struct {
	max int

	seq atomic.Int64
	mu  sync.RWMutex
	buf []LogEntry
}

func NewEventStore(max int) *EventStore {
	if max <= 0 {
		max = 500
	}
	return &EventStore{
		max: max,
		buf: make([]LogEntry, 0, max),
	}
}

func (s *EventStore) Add(level, event, tunnelID, message string) {
	level = strings.TrimSpace(strings.ToLower(level))
	if level == "" {
		level = "info"
	}
	entry := LogEntry{
		ID:       s.seq.Add(1),
		Time:     time.Now().UTC().Format(time.RFC3339),
		Level:    level,
		Event:    strings.TrimSpace(event),
		TunnelID: strings.TrimSpace(tunnelID),
		Message:  strings.TrimSpace(message),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.buf) >= s.max {
		copy(s.buf, s.buf[1:])
		s.buf[len(s.buf)-1] = entry
		return
	}
	s.buf = append(s.buf, entry)
}

func (s *EventStore) List(tunnelID string, limit int) []LogEntry {
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	filterTunnelID := strings.TrimSpace(tunnelID)

	s.mu.RLock()
	items := make([]LogEntry, len(s.buf))
	copy(items, s.buf)
	s.mu.RUnlock()

	out := make([]LogEntry, 0, len(items))
	for _, item := range items {
		if filterTunnelID != "" && item.TunnelID != filterTunnelID {
			continue
		}
		out = append(out, item)
	}

	sort.Slice(out, func(i, j int) bool {
		return out[i].ID > out[j].ID
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}
