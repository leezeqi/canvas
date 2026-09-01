package auth

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestMiddlewareRejectsCrossOriginMutations(t *testing.T) {
	server := &Server{cfg: Config{AppOrigin: "https://canvas.example"}}
	var called atomic.Bool
	handler := server.middleware(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called.Store(true) }))
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.Header.Set("Origin", "https://evil.example")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusForbidden)
	}
	if called.Load() {
		t.Fatal("cross-origin request reached the protected handler")
	}
	if strings.Contains(recorder.Header().Get("Access-Control-Allow-Origin"), "evil.example") {
		t.Fatal("untrusted origin was reflected in CORS response")
	}
}

func TestMiddlewareAllowsConfiguredCredentialedOrigin(t *testing.T) {
	server := &Server{cfg: Config{AppOrigin: "https://canvas.example"}}
	handler := server.middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	req := httptest.NewRequest(http.MethodOptions, "/api/auth/session", nil)
	req.Header.Set("Origin", "https://canvas.example")
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, req)

	if recorder.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusNoContent)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Origin"); got != "https://canvas.example" {
		t.Fatalf("allow origin = %q", got)
	}
	if got := recorder.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
		t.Fatalf("allow credentials = %q", got)
	}
}

func TestSessionWithoutValidCookieIsUnauthorizedAndClearsMalformedCookie(t *testing.T) {
	server := &Server{cfg: Config{CookieSecure: true}}
	req := httptest.NewRequest(http.MethodGet, "/api/auth/session", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "not-a-session-token"})
	recorder := httptest.NewRecorder()

	server.session(recorder, req)

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
	assertClearedSessionCookie(t, recorder.Result().Cookies())
}

func TestLogoutAlwaysClearsSessionCookieWithSecurityAttributes(t *testing.T) {
	server := &Server{cfg: Config{CookieSecure: true}}
	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	req.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "not-a-session-token"})
	recorder := httptest.NewRecorder()

	server.logout(recorder, req)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusOK)
	}
	assertClearedSessionCookie(t, recorder.Result().Cookies())
}

func assertClearedSessionCookie(t *testing.T, cookies []*http.Cookie) {
	t.Helper()
	for _, cookie := range cookies {
		if cookie.Name != sessionCookieName {
			continue
		}
		if !cookie.HttpOnly || !cookie.Secure || cookie.SameSite != http.SameSiteLaxMode || cookie.Path != "/" || cookie.MaxAge != -1 {
			t.Fatalf("unsafe cleared session cookie: %+v", cookie)
		}
		return
	}
	t.Fatal("session clearing cookie was not set")
}

func TestExchangeTicketUsesServerCredentialAndReturnsMinimalIdentity(t *testing.T) {
	validTicket := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Method != http.MethodPost || r.URL.Path != "/api/v1/auth/canvas-sso/exchange" {
			t.Fatalf("unexpected upstream request: %s %s", r.Method, r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer canvas-secret" {
			t.Fatalf("authorization = %q", got)
		}
		var body map[string]string
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body["ticket"] != validTicket {
			t.Fatalf("ticket = %q", body["ticket"])
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"code": 0,
			"data": map[string]any{"identity": map[string]any{
				"sub": "hajimi-user-7", "email": "user@example.com", "email_verified": true,
				"name": "测试用户", "avatar": "https://cdn.example/avatar.png",
			}},
		})
	}))
	defer upstream.Close()

	server := &Server{
		cfg:        Config{HajimiBaseURL: upstream.URL, HajimiSSOClientSecret: "canvas-secret"},
		httpClient: &http.Client{Timeout: time.Second},
	}
	identity, err := server.exchangeTicket(t.Context(), validTicket)
	if err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 1 {
		t.Fatalf("upstream requests = %d", requests.Load())
	}
	if identity.Subject != "hajimi-user-7" || identity.Email != "user@example.com" || !identity.EmailVerified || identity.Name != "测试用户" {
		t.Fatalf("unexpected identity: %+v", identity)
	}
}

func TestExchangeTicketRejectsMalformedTicketBeforeCallingHajimi(t *testing.T) {
	var requests atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests.Add(1) }))
	defer upstream.Close()
	server := &Server{cfg: Config{HajimiBaseURL: upstream.URL}, httpClient: upstream.Client()}

	for _, ticket := range []string{"", "raw-secret", base64.RawURLEncoding.EncodeToString(make([]byte, 31))} {
		if _, err := server.exchangeTicket(t.Context(), ticket); err == nil {
			t.Fatalf("ticket %q was accepted", ticket)
		}
	}
	if requests.Load() != 0 {
		t.Fatalf("malformed tickets caused %d upstream requests", requests.Load())
	}
}

func TestDecodeJSONRejectsUnknownFieldsAndOversizedBodies(t *testing.T) {
	for _, test := range []struct {
		name string
		body []byte
	}{
		{name: "unknown field", body: []byte(`{"email":"user@example.com","password":"password","admin":true}`)},
		{name: "oversized", body: bytes.Repeat([]byte("x"), 17<<10)},
	} {
		t.Run(test.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(test.body))
			req.Header.Set("Content-Type", "application/json")
			recorder := httptest.NewRecorder()
			var target struct {
				Email    string `json:"email"`
				Password string `json:"password"`
			}
			if decodeJSON(recorder, req, &target) {
				t.Fatal("invalid body was accepted")
			}
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
		})
	}
}
