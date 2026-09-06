package auth

import (
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"
)

func TestPresenceTrackerCountsUniqueRecentUsers(t *testing.T) {
	now := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	tracker := newPresenceTracker(5*time.Minute, func() time.Time { return now })

	if got := tracker.touch("user-a"); got != 1 {
		t.Fatalf("first user count = %d, want 1", got)
	}
	if got := tracker.touch("user-a"); got != 1 {
		t.Fatalf("duplicate user count = %d, want 1", got)
	}
	if got := tracker.touch("user-b"); got != 2 {
		t.Fatalf("second user count = %d, want 2", got)
	}

	now = now.Add(5*time.Minute + time.Second)
	if got := tracker.touch("user-b"); got != 1 {
		t.Fatalf("expired user count = %d, want 1", got)
	}
}

func TestPresenceTrackerSnapshotExpiresWithoutHeartbeat(t *testing.T) {
	now := time.Date(2026, 9, 3, 10, 0, 0, 0, time.UTC)
	tracker := newPresenceTracker(onlineWindow, func() time.Time { return now })
	tracker.touch("expired")
	now = now.Add(time.Minute)
	tracker.touch("active")
	now = now.Add(onlineWindow - time.Minute)

	if got := tracker.activeUserIDs(); !slices.Equal(got, []string{"active"}) {
		t.Fatalf("active users at expiry boundary = %v, want [active]", got)
	}
	now = now.Add(time.Minute)
	if got := tracker.activeUserIDs(); len(got) != 0 {
		t.Fatalf("reading presence refreshed activity: %v", got)
	}
	if got := tracker.touch("new"); got != 1 {
		t.Fatalf("count after snapshot expiry = %d, want 1", got)
	}
}

func TestMaskedPresenceLabel(t *testing.T) {
	for _, test := range []struct {
		name, email, want string
	}{
		{"\u5c0f\u660e\u540c\u5b66", "zhangsan@qq.com", "\u5c0f***"},
		{" Alice ", "alice@example.com", "A***"},
		{"\U0001f600User", "", "\U0001f600***"},
		{"\u674e", "li@example.com", "***"},
		{"A", "a@example.com", "***"},
		{"  ", " ZHANGSAN@QQ.COM ", "z***@qq.com"},
		{"", "a@example.com", "***@example.com"},
		{"", "\u660e@example.com", "***@example.com"},
		{"", "", "***"},
		{"", "private-email", "***"},
		{"", "Alice <alice@example.com>", "***"},
	} {
		t.Run(test.name+"/"+test.email, func(t *testing.T) {
			if got := maskedPresenceLabel(test.name, test.email); got != test.want {
				t.Fatalf("masked label = %q, want %q", got, test.want)
			}
		})
	}
}

func TestPresenceUsersRequiresLogin(t *testing.T) {
	handler := NewServer(Config{}, nil)
	for _, cookie := range []string{"", "invalid"} {
		req := httptest.NewRequest(http.MethodGet, "/api/presence/users", nil)
		if cookie != "" {
			req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: cookie})
		}
		recorder := httptest.NewRecorder()
		handler.ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("unauthenticated status = %d, body = %s", recorder.Code, recorder.Body.String())
		}
	}
}
