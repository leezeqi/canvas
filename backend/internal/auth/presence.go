package auth

import (
	"net/http"
	"sync"
	"time"
)

const onlineWindow = 5 * time.Minute

type presenceTracker struct {
	mu       sync.Mutex
	lastSeen map[string]time.Time
	ttl      time.Duration
	now      func() time.Time
}

func newPresenceTracker(ttl time.Duration, now func() time.Time) *presenceTracker {
	return &presenceTracker{lastSeen: make(map[string]time.Time), ttl: ttl, now: now}
}

func (p *presenceTracker) touch(userID string) int {
	p.mu.Lock()
	defer p.mu.Unlock()

	now := p.now()
	cutoff := now.Add(-p.ttl)
	for id, seenAt := range p.lastSeen {
		if !seenAt.After(cutoff) {
			delete(p.lastSeen, id)
		}
	}
	p.lastSeen[userID] = now
	return len(p.lastSeen)
}

func (s *Server) presenceHeartbeat(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	writeData(w, http.StatusOK, map[string]int{"online": s.presence.touch(userID)})
}
