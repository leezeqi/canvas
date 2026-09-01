package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"
)

func TestSyncStateIsolatedAcrossAccountsAndPreservesTombstones(t *testing.T) {
	handler, _ := newIntegrationAuthServer(t, "")
	a := registerSyncTestUser(t, handler, "sync-a@example.com")
	b := registerSyncTestUser(t, handler, "sync-b@example.com")

	data := map[string]any{
		"records":   []any{map[string]any{"id": "kept", "updatedAt": "2026-09-01T00:00:00Z"}},
		"tombstones": []any{map[string]any{"id": "deleted", "deletedAt": "2026-09-01T00:01:00Z"}},
	}
	put := syncJSONRequest(t, handler, http.MethodPut, "/api/sync/domains/canvas", map[string]any{"baseVersion": 0, "data": data}, a)
	if put.Code != http.StatusOK {
		t.Fatalf("account A put status = %d, body = %s", put.Code, put.Body.String())
	}

	stateA := syncRawRequest(t, handler, http.MethodGet, "/api/sync/state", nil, "", a)
	if stateA.Code != http.StatusOK || !bytes.Contains(stateA.Body.Bytes(), []byte("deletedAt")) {
		t.Fatalf("account A state = %d, body = %s", stateA.Code, stateA.Body.String())
	}
	stateB := syncRawRequest(t, handler, http.MethodGet, "/api/sync/state", nil, "", b)
	if stateB.Code != http.StatusOK {
		t.Fatalf("account B state status = %d, body = %s", stateB.Code, stateB.Body.String())
	}
	var envelope struct {
		Data struct {
			Domains map[string]json.RawMessage `json:"domains"`
		} `json:"data"`
	}
	if err := json.Unmarshal(stateB.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if len(envelope.Data.Domains) != 0 {
		t.Fatalf("account B unexpectedly saw account A domains: %s", stateB.Body.String())
	}
}

func TestSyncDomainRejectsStaleVersionAndReturnsRemoteState(t *testing.T) {
	handler, _ := newIntegrationAuthServer(t, "")
	cookie := registerSyncTestUser(t, handler, "sync-conflict@example.com")
	first := syncJSONRequest(t, handler, http.MethodPut, "/api/sync/domains/canvas", map[string]any{"baseVersion": 0, "data": map[string]any{"value": "first"}}, cookie)
	if first.Code != http.StatusOK {
		t.Fatalf("first write status = %d, body = %s", first.Code, first.Body.String())
	}
	second := syncJSONRequest(t, handler, http.MethodPut, "/api/sync/domains/canvas", map[string]any{"baseVersion": 1, "data": map[string]any{"value": "second"}}, cookie)
	if second.Code != http.StatusOK {
		t.Fatalf("second write status = %d, body = %s", second.Code, second.Body.String())
	}
	stale := syncJSONRequest(t, handler, http.MethodPut, "/api/sync/domains/canvas", map[string]any{"baseVersion": 1, "data": map[string]any{"value": "stale"}}, cookie)
	if stale.Code != http.StatusConflict || !bytes.Contains(stale.Body.Bytes(), []byte(`"details"`)) || !bytes.Contains(stale.Body.Bytes(), []byte(`"version":2`)) {
		t.Fatalf("stale write = %d, body = %s", stale.Code, stale.Body.String())
	}
	current := syncRawRequest(t, handler, http.MethodGet, "/api/sync/domains/canvas", nil, "", cookie)
	if current.Code != http.StatusOK || !bytes.Contains(current.Body.Bytes(), []byte(`"value":"second"`)) {
		t.Fatalf("remote document was overwritten: %d %s", current.Code, current.Body.String())
	}
}

func TestSyncFilesArePrivateAndEnforcePathMimeAndSizeLimits(t *testing.T) {
	handler, _ := newIntegrationAuthServer(t, "")
	a := registerSyncTestUser(t, handler, "sync-files-a@example.com")
	b := registerSyncTestUser(t, handler, "sync-files-b@example.com")

	put := syncRawRequest(t, handler, http.MethodPut, "/api/sync/files/assets/test.txt", []byte("hello"), "text/plain", a)
	if put.Code != http.StatusCreated {
		t.Fatalf("file put status = %d, body = %s", put.Code, put.Body.String())
	}
	private := syncRawRequest(t, handler, http.MethodGet, "/api/sync/files/assets/test.txt", nil, "", b)
	if private.Code != http.StatusNotFound {
		t.Fatalf("account B file status = %d, body = %s", private.Code, private.Body.String())
	}
	got := syncRawRequest(t, handler, http.MethodGet, "/api/sync/files/assets/test.txt", nil, "", a)
	if got.Code != http.StatusOK || got.Body.String() != "hello" {
		t.Fatalf("account A file = %d %q", got.Code, got.Body.String())
	}

	badMime := syncRawRequest(t, handler, http.MethodPut, "/api/sync/files/assets/bad.xml", []byte("x"), "application/xml", a)
	if badMime.Code != http.StatusUnsupportedMediaType {
		t.Fatalf("unsupported MIME status = %d, body = %s", badMime.Code, badMime.Body.String())
	}
	// Encoded backslashes reach the wildcard unchanged and are rejected by safeStoragePath.
	badPath := syncRawRequest(t, handler, http.MethodPut, "/api/sync/files/assets%5C..%5Cescape.txt", []byte("x"), "text/plain", a)
	if badPath.Code != http.StatusBadRequest {
		t.Fatalf("unsafe path status = %d, body = %s", badPath.Code, badPath.Body.String())
	}
	tooLarge := syncRawRequest(t, handler, http.MethodPut, "/api/sync/files/assets/large.bin", bytes.Repeat([]byte{'x'}, maxSyncFileBytes+1), "application/octet-stream", a)
	if tooLarge.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized file status = %d, body = %s", tooLarge.Code, tooLarge.Body.String())
	}

	deleted := syncRawRequest(t, handler, http.MethodDelete, "/api/sync/files/assets/test.txt", nil, "", a)
	if deleted.Code != http.StatusOK {
		t.Fatalf("file delete status = %d, body = %s", deleted.Code, deleted.Body.String())
	}
	missing := syncRawRequest(t, handler, http.MethodGet, "/api/sync/files/assets/test.txt", nil, "", a)
	if missing.Code != http.StatusNotFound {
		t.Fatalf("deleted file status = %d, body = %s", missing.Code, missing.Body.String())
	}
}

func TestSyncEndpointsRequireAuthentication(t *testing.T) {
	handler := NewServer(Config{AppOrigin: "https://canvas.example", DataEncryptionKey: "integration-test-encryption-key", FileStoragePath: t.TempDir()}, nil)
	for _, test := range []struct {
		method, path string
	}{
		{http.MethodGet, "/api/sync/state"},
		{http.MethodPut, "/api/sync/domains/canvas"},
		{http.MethodGet, "/api/sync/files/assets/test.txt"},
	} {
		req := syncRawRequest(t, handler, test.method, test.path, nil, "", nil)
		if req.Code != http.StatusUnauthorized {
			t.Errorf("%s %s status = %d, want 401", test.method, test.path, req.Code)
		}
	}
}

func registerSyncTestUser(t *testing.T, handler http.Handler, email string) *http.Cookie {
	t.Helper()
	response := authJSONRequest(t, handler, http.MethodPost, "/api/auth/register", map[string]any{
		"email": email, "password": "strong-password", "name": "同步测试用户",
	}, nil)
	if response.Code != http.StatusCreated {
		t.Fatalf("register %s status = %d, body = %s", email, response.Code, response.Body.String())
	}
	return findSessionCookie(t, response.Result().Cookies())
}
