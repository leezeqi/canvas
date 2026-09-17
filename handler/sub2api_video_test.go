package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/tigerowo/infinite-canvas/model"
)

func TestSub2APIVideoPayload(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "https://gateway.example/v1/videos/task_xxx", nil)
	payload := []byte(`{"id":"task_xxx","task_id":"task_xxx","status":"done","video":{"url":"/v1/videos/task_xxx/content","duration":5}}`)
	transformed := transformAIProtocolVideoPayload(payload, request, model.ModelChannel{Protocol: "sub2api"}, "grok-imagine-video-1.5", true)
	parsed := parseVideoTaskPayload(transformed, "grok-imagine-video-1.5")
	if parsed.Status != "completed" || parsed.UpstreamTaskID != "task_xxx" || parsed.Seconds != "5" || parsed.VideoURL != "https://gateway.example/v1/videos/task_xxx/content" {
		t.Fatalf("unexpected parsed task: %#v", parsed)
	}
	for _, protocol := range []string{"grok2api", "openai"} {
		unchanged := transformAIProtocolVideoPayload(payload, request, model.ModelChannel{Protocol: protocol}, "grok-imagine-video-1.5", true)
		assertProtocolBytes(t, unchanged, payload)
	}
}

func TestSub2APIVideoContentPath(t *testing.T) {
	for _, path := range []string{"/v1/videos/task_xxx/content", "/v1/videos/generations/task_xxx/content"} {
		if !sub2APIVideoContentPath(path) {
			t.Fatalf("expected content path: %s", path)
		}
	}
	for _, path := range []string{"/v1/videos/task_xxx", "/v1/videos/task_xxx/other/content", "/v1/files/task_xxx/content"} {
		if sub2APIVideoContentPath(path) {
			t.Fatalf("unexpected content path: %s", path)
		}
	}
}

func TestSub2APIVideoPollErrorPolicy(t *testing.T) {
	channel := model.ModelChannel{Protocol: "sub2api"}
	current := time.Date(2026, 9, 17, 0, 0, 0, 0, time.UTC)
	task := model.VideoTask{Status: "processing"}
	for attempt := 1; attempt <= 5; attempt++ {
		update, handled := sub2APIVideoPollError(task, channel, http.StatusNotFound, "", current, "not found", `{}`)
		if !handled || update.Poll404Count != attempt || (attempt < 5 && update.Status == "failed") || (attempt == 5 && update.Status != "failed") {
			t.Fatalf("404 attempt %d: %#v handled=%v", attempt, update, handled)
		}
		task.Poll404Count = update.Poll404Count
	}

	update, _ := sub2APIVideoPollError(model.VideoTask{Status: "processing"}, channel, http.StatusTooManyRequests, "20", current, "limited", `{}`)
	if update.Status != "processing" || update.NextPollAt != current.Add(20*time.Second).Format(time.RFC3339Nano) {
		t.Fatalf("429 retry: %#v", update)
	}

	task = model.VideoTask{Status: "processing"}
	for attempt := 1; attempt <= 4; attempt++ {
		update, _ = sub2APIVideoPollError(task, channel, http.StatusBadGateway, "", current, "upstream", `{}`)
		if (attempt <= 3 && update.Status == "failed") || (attempt == 4 && update.Status != "failed") {
			t.Fatalf("5xx attempt %d: %#v", attempt, update)
		}
		task.PollRetryCount = update.PollRetryCount
	}

	if _, handled := sub2APIVideoPollError(model.VideoTask{}, model.ModelChannel{Protocol: "openai"}, http.StatusNotFound, "", current, "", ""); handled {
		t.Fatal("non-Sub2API error must not be handled")
	}
}
