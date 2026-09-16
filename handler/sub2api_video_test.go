package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tigerowo/infinite-canvas/model"
)

func TestSub2APIVideoPayload(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/videos/task_xxx", nil)
	payload := []byte(`{"id":"task_xxx","task_id":"task_xxx","status":"done","video":{"url":"/v1/videos/generations/task_xxx/content","duration":5}}`)
	transformed := transformAIProtocolVideoPayload(payload, request, model.ModelChannel{Protocol: "sub2api"}, "grok-imagine-video-1.5", true)
	parsed := parseVideoTaskPayload(transformed, "grok-imagine-video-1.5")
	if parsed.Status != "completed" || parsed.UpstreamTaskID != "task_xxx" || parsed.Seconds != "5" || parsed.VideoURL != "https://gateway.example/v1/videos/generations/task_xxx/content" {
		t.Fatalf("unexpected parsed task: %#v", parsed)
	}
	for _, protocol := range []string{"grok2api", "openai"} {
		unchanged := transformAIProtocolVideoPayload(payload, request, model.ModelChannel{Protocol: protocol}, "grok-imagine-video-1.5", true)
		assertProtocolBytes(t, unchanged, payload)
	}
}
