package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/tigerowo/infinite-canvas/model"
)

func TestCurrentUserCanvasOpenAPIModels(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatalf("unexpected authorization: %s", r.Header.Get("Authorization"))
		}
		_, _ = w.Write([]byte(`{"data":[{"id":"video-z"},{"id":"video-a"}]}`))
	}))
	defer server.Close()

	previous := userModelHTTPClient
	userModelHTTPClient = &http.Client{Transport: server.Client().Transport, Timeout: time.Second}
	t.Cleanup(func() { userModelHTTPClient = previous })

	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-1"})
	models, err := CurrentUserCanvasOpenAPIModels(ctx, model.ModelChannel{
		Protocol: ModelChannelProtocolCanvasOpenAPIVideo,
		BaseURL:  server.URL,
		APIKey:   "test-key",
	})
	if err != nil {
		t.Fatalf("CurrentUserCanvasOpenAPIModels returned error: %v", err)
	}
	if want := []string{"video-a", "video-z"}; !reflect.DeepEqual(models, want) {
		t.Fatalf("models = %#v, want %#v", models, want)
	}
}

func TestCurrentUserCanvasOpenAPIModelsRequiresUserAndProtocol(t *testing.T) {
	channel := model.ModelChannel{
		Protocol: ModelChannelProtocolCanvasOpenAPIVideo,
		BaseURL:  "https://api.example.com",
		APIKey:   "test-key",
	}
	if _, err := CurrentUserCanvasOpenAPIModels(context.Background(), channel); err == nil || !strings.Contains(err.Error(), "请先登录") {
		t.Fatalf("missing user error = %v", err)
	}

	ctx := WithUser(context.Background(), model.AuthUser{ID: "user-1"})
	channel.Protocol = ModelChannelProtocolOpenAI
	if _, err := CurrentUserCanvasOpenAPIModels(ctx, channel); err == nil || !strings.Contains(err.Error(), "仅支持 Canvas OpenAPI") {
		t.Fatalf("wrong protocol error = %v", err)
	}
}
