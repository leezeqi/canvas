package auth

import (
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
