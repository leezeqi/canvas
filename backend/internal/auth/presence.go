package auth

import (
	"net/http"
	"strings"
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
	p.expire(now)
	p.lastSeen[userID] = now
	return len(p.lastSeen)
}

func (p *presenceTracker) activeUserIDs() []string {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.expire(p.now())
	ids := make([]string, 0, len(p.lastSeen))
	for id := range p.lastSeen {
		ids = append(ids, id)
	}
	return ids
}

// Caller must hold p.mu.
func (p *presenceTracker) expire(now time.Time) {
	cutoff := now.Add(-p.ttl)
	for id, seenAt := range p.lastSeen {
		if !seenAt.After(cutoff) {
			delete(p.lastSeen, id)
		}
	}
}

func (s *Server) presenceHeartbeat(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	writeData(w, http.StatusOK, map[string]int{"online": s.presence.touch(userID)})
}

func (s *Server) presenceUsers(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.syncUserID(r); !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	users := make([]string, 0)
	ids := s.presence.activeUserIDs()
	if len(ids) > 0 {
		rows, err := s.db.Query(r.Context(), `SELECT display_name, email FROM users WHERE id = ANY($1::uuid[]) ORDER BY id`, ids)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "读取在线用户失败")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var name, email string
			if err := rows.Scan(&name, &email); err != nil {
				writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "读取在线用户失败")
				return
			}
			users = append(users, maskedPresenceLabel(name, email))
		}
		if rows.Err() != nil {
			writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "读取在线用户失败")
			return
		}
	}
	writeData(w, http.StatusOK, map[string][]string{"users": users})
}

func maskedPresenceLabel(name, email string) string {
	value := strings.TrimSpace(name)
	suffix := ""
	if value == "" {
		normalized, ok := validateEmail(email)
		if !ok {
			return "***"
		}
		at := strings.LastIndexByte(normalized, '@')
		value, suffix = normalized[:at], normalized[at:]
	}
	chars := []rune(value)
	if len(chars) < 2 {
		return "***" + suffix
	}
	return string(chars[0]) + "***" + suffix
}
