package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func TestAuthLifecycleAndHajimiEmailIsolation(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{"identity": map[string]any{
				"sub": "hajimi-user-7", "email": "same@example.com", "email_verified": true, "name": "Hajimi 用户", "avatar": "",
			}},
		})
	}))
	defer upstream.Close()
	handler, pool := newIntegrationAuthServer(t, upstream.URL)

	register := authJSONRequest(t, handler, http.MethodPost, "/api/auth/register", map[string]any{
		"email": "same@example.com", "password": "strong-password", "name": "本地用户",
	}, nil)
	if register.Code != http.StatusCreated {
		t.Fatalf("register status = %d, body = %s", register.Code, register.Body.String())
	}
	localCookie := findSessionCookie(t, register.Result().Cookies())
	assertIssuedSessionCookie(t, localCookie)

	duplicate := authJSONRequest(t, handler, http.MethodPost, "/api/auth/register", map[string]any{
		"email": "SAME@example.com", "password": "another-password", "name": "重复用户",
	}, nil)
	if duplicate.Code != http.StatusConflict {
		t.Fatalf("duplicate status = %d, body = %s", duplicate.Code, duplicate.Body.String())
	}

	wrongPassword := authJSONRequest(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "same@example.com", "password": "wrong-password",
	}, nil)
	unknownEmail := authJSONRequest(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "missing@example.com", "password": "wrong-password",
	}, nil)
	if wrongPassword.Code != http.StatusUnauthorized || unknownEmail.Code != http.StatusUnauthorized || wrongPassword.Body.String() != unknownEmail.Body.String() {
		t.Fatalf("credential failures differ: wrong=%d %s unknown=%d %s", wrongPassword.Code, wrongPassword.Body.String(), unknownEmail.Code, unknownEmail.Body.String())
	}

	login := authJSONRequest(t, handler, http.MethodPost, "/api/auth/login", map[string]any{
		"email": "same@example.com", "password": "strong-password",
	}, nil)
	if login.Code != http.StatusOK {
		t.Fatalf("login status = %d, body = %s", login.Code, login.Body.String())
	}
	loginCookie := findSessionCookie(t, login.Result().Cookies())

	sessionReq := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	sessionReq.AddCookie(loginCookie)
	session := httptest.NewRecorder()
	handler.ServeHTTP(session, sessionReq)
	if session.Code != http.StatusOK {
		t.Fatalf("session status = %d, body = %s", session.Code, session.Body.String())
	}

	validTicket := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	hajimi := authJSONRequest(t, handler, http.MethodPost, "/api/auth/hajimi/exchange", map[string]any{"ticket": validTicket}, nil)
	if hajimi.Code != http.StatusOK {
		t.Fatalf("Hajimi exchange status = %d, body = %s", hajimi.Code, hajimi.Body.String())
	}

	var users, passwords, externalIdentities int
	if err := pool.QueryRow(t.Context(), `SELECT COUNT(*) FROM users WHERE email = 'same@example.com'`).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(t.Context(), `SELECT COUNT(*) FROM password_credentials`).Scan(&passwords); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(t.Context(), `SELECT COUNT(*) FROM external_identities WHERE provider = 'hajimi'`).Scan(&externalIdentities); err != nil {
		t.Fatal(err)
	}
	if users != 2 || passwords != 1 || externalIdentities != 1 {
		t.Fatalf("identity isolation failed: users=%d passwords=%d external=%d", users, passwords, externalIdentities)
	}

	logout := authJSONRequest(t, handler, http.MethodPost, "/api/auth/logout", nil, loginCookie)
	if logout.Code != http.StatusOK {
		t.Fatalf("logout status = %d, body = %s", logout.Code, logout.Body.String())
	}
	assertClearedSessionCookie(t, logout.Result().Cookies())

	staleReq := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	staleReq.AddCookie(loginCookie)
	staleSession := httptest.NewRecorder()
	handler.ServeHTTP(staleSession, staleReq)
	if staleSession.Code != http.StatusUnauthorized {
		t.Fatalf("logged-out session status = %d, body = %s", staleSession.Code, staleSession.Body.String())
	}
}

func newIntegrationAuthServer(t *testing.T, hajimiBaseURL string) (http.Handler, *pgxpool.Pool) {
	t.Helper()
	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is not configured")
	}
	admin, err := pgxpool.New(t.Context(), databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	random := make([]byte, 8)
	if _, err := rand.Read(random); err != nil {
		t.Fatal(err)
	}
	schema := "canvas_auth_test_" + hex.EncodeToString(random)
	if _, err := admin.Exec(t.Context(), "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
	})

	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	config.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(t.Context(), config)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if err := Migrate(t.Context(), pool); err != nil {
		t.Fatal(err)
	}
	cfg := Config{
		AppOrigin: "https://canvas.example", CookieSecure: true, SessionTTL: time.Hour,
		HajimiBaseURL: hajimiBaseURL, HajimiSSOClientSecret: "canvas-secret",
	}
	return NewServer(cfg, pool), pool
}

func authJSONRequest(t *testing.T, handler http.Handler, method, path string, body any, cookie *http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Origin", "https://canvas.example")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		req.AddCookie(cookie)
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	return recorder
}

func findSessionCookie(t *testing.T, cookies []*http.Cookie) *http.Cookie {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name == sessionCookieName {
			return cookie
		}
	}
	t.Fatal("session cookie was not set")
	return nil
}

func assertIssuedSessionCookie(t *testing.T, cookie *http.Cookie) {
	t.Helper()
	if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.MaxAge <= 0 {
		t.Fatalf("unsafe issued session cookie: %+v", cookie)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil || len(decoded) != 32 {
		t.Fatalf("invalid session token: %q", cookie.Value)
	}
}
