package auth

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestSyncDomainValidationAndEncryption(t *testing.T) {
	if !isSyncDomain("canvas") || isSyncDomain("unknown") {
		t.Fatal("domain allowlist is incorrect")
	}
	enc, err := newDataEncryptor("test-encryption-key")
	if err != nil {
		t.Fatal(err)
	}
	original := map[string]any{"apiKey": "secret-value", "nested": map[string]any{"token": "token-value"}, "name": "plain"}
	sealed, err := enc.sealJSON(original)
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(sealed)
	if bytes.Contains(encoded, []byte("secret-value")) || bytes.Contains(encoded, []byte("token-value")) {
		t.Fatal("sensitive values were stored in plaintext")
	}
	opened, err := enc.openJSON(sealed)
	if err != nil {
		t.Fatal(err)
	}
	if got := opened.(map[string]any)["apiKey"]; got != "secret-value" {
		t.Fatalf("decrypted api key = %v", got)
	}
}

func TestSyncFilePathValidation(t *testing.T) {
	root := t.TempDir()
	for _, key := range []string{"image/a.png", "../escape", "/absolute", "", "image\\..\\escape"} {
		path, err := safeStoragePath(root, key)
		if key == "image/a.png" {
			if err != nil || path != filepath.Join(root, "image", "a.png") {
				t.Fatalf("valid key rejected: %q, %v", path, err)
			}
			continue
		}
		if err == nil {
			t.Fatalf("unsafe key accepted: %q", key)
		}
	}
}

func TestSyncUnauthenticated(t *testing.T) {
	server := &Server{cfg: Config{AppOrigin: "https://canvas.example"}}
	for _, path := range []string{"/api/sync/state", "/api/sync/domains/canvas", "/api/sync/files/a.txt"} {
		req := httptest.NewRequest(http.MethodGet, path, nil)
		recorder := httptest.NewRecorder()
		server.middleware(http.HandlerFunc(server.syncState)).ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("%s status = %d", path, recorder.Code)
		}
	}
}

func TestSyncIntegrationDomainConflictAndFileIsolation(t *testing.T) {
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	_ = databaseURL
	serverHandler, _ := newIntegrationAuthServer(t, "")

	register := authJSONRequest(t, serverHandler, http.MethodPost, "/api/auth/register", map[string]any{"email": "sync@example.com", "password": "strong-password", "name": "同步用户"}, nil)
	if register.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", register.Code, register.Body.String())
	}
	cookie := findSessionCookie(t, register.Result().Cookies())
	put := syncJSONRequest(t, serverHandler, http.MethodPut, "/api/sync/domains/config", map[string]any{"baseVersion": 0, "data": map[string]any{"apiKey": "secret"}}, cookie)
	if put.Code != http.StatusOK {
		t.Fatalf("domain put status = %d, body = %s", put.Code, put.Body.String())
	}
	conflict := syncJSONRequest(t, serverHandler, http.MethodPut, "/api/sync/domains/config", map[string]any{"baseVersion": 0, "data": map[string]any{"apiKey": "other"}}, cookie)
	if conflict.Code != http.StatusConflict || !bytes.Contains(conflict.Body.Bytes(), []byte(`"version"`)) || !bytes.Contains(conflict.Body.Bytes(), []byte(`"files"`)) {
		t.Fatalf("conflict response missing remote state: %d %s", conflict.Code, conflict.Body.String())
	}

	file := syncRawRequest(t, serverHandler, http.MethodPut, "/api/sync/files/asset/test.txt", []byte("hello"), "text/plain", cookie)
	if file.Code != http.StatusCreated && file.Code != http.StatusOK {
		t.Fatalf("file put status = %d, body = %s", file.Code, file.Body.String())
	}
	got := syncRawRequest(t, serverHandler, http.MethodGet, "/api/sync/files/asset/test.txt", nil, "", cookie)
	if got.Code != http.StatusOK || got.Body.String() != "hello" {
		t.Fatalf("file get = %d %q", got.Code, got.Body.String())
	}
}

func syncJSONRequest(t *testing.T, handler http.Handler, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	payload, err := json.Marshal(body)
	if err != nil {
		t.Fatal(err)
	}
	return syncRawRequest(t, handler, method, path, payload, "application/json", cookie)
}

func syncRawRequest(t *testing.T, handler http.Handler, method, path string, body []byte, contentType string, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	req.Header.Set("Origin", "https://canvas.example")
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}
