package auth

import (
	"encoding/json"
	"net/http"
	"slices"
	"testing"
)

func TestPresenceUsersReturnsOnlyMaskedActiveUsers(t *testing.T) {
	handler, _ := newIntegrationAuthServer(t, "")
	var cookies []*http.Cookie
	for _, account := range []struct{ name, email string }{
		{"\u5c0f\u660e\u540c\u5b66", "private-name@example.com"},
		{"", "zhangsan@qq.com"},
		{"Offline", "offline@example.com"},
	} {
		registered := authJSONRequest(t, handler, http.MethodPost, "/api/auth/register", map[string]string{
			"name": account.name, "email": account.email, "password": "strong-password",
		}, nil)
		if registered.Code != http.StatusCreated {
			t.Fatalf("register status = %d, body = %s", registered.Code, registered.Body.String())
		}
		cookies = append(cookies, findSessionCookie(t, registered.Result().Cookies()))
	}

	empty := authJSONRequest(t, handler, http.MethodGet, "/api/presence/users", nil, cookies[0])
	if empty.Code != http.StatusOK || empty.Body.String() != "{\"data\":{\"users\":[]}}\n" {
		t.Fatalf("empty presence response = %d %s", empty.Code, empty.Body.String())
	}
	for i, cookie := range []*http.Cookie{cookies[0], cookies[0], cookies[1]} {
		heartbeat := authJSONRequest(t, handler, http.MethodPost, "/api/presence/heartbeat", nil, cookie)
		var body struct {
			Data struct{ Online int } `json:"data"`
		}
		if err := json.Unmarshal(heartbeat.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		want := 1
		if i == 2 {
			want = 2
		}
		if heartbeat.Code != http.StatusOK || body.Data.Online != want {
			t.Fatalf("heartbeat response = %d %s, want online %d", heartbeat.Code, heartbeat.Body.String(), want)
		}
	}

	response := authJSONRequest(t, handler, http.MethodGet, "/api/presence/users", nil, cookies[0])
	if response.Code != http.StatusOK {
		t.Fatalf("presence status = %d, body = %s", response.Code, response.Body.String())
	}
	var body map[string]map[string][]string
	if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	users := body["data"]["users"]
	slices.Sort(users)
	if len(body) != 1 || len(body["data"]) != 1 || !slices.Equal(users, []string{"z***@qq.com", "\u5c0f***"}) {
		t.Fatalf("unexpected or unmasked presence response: %s", response.Body.String())
	}
	repeated := authJSONRequest(t, handler, http.MethodGet, "/api/presence/users", nil, cookies[0])
	if repeated.Code != http.StatusOK || repeated.Body.String() != response.Body.String() {
		t.Fatalf("presence order changed: %s -> %s", response.Body.String(), repeated.Body.String())
	}
	authJSONRequest(t, handler, http.MethodPost, "/api/auth/logout", nil, cookies[0])
	loggedOut := authJSONRequest(t, handler, http.MethodGet, "/api/presence/users", nil, cookies[0])
	if loggedOut.Code != http.StatusUnauthorized {
		t.Fatalf("logged-out presence status = %d", loggedOut.Code)
	}
}
