package handler

import (
	"testing"

	"github.com/tigerowo/infinite-canvas/model"
)

// Expectations characterize the protocol registry routing behavior.
func TestModelProtocolProxyPathContract(t *testing.T) {
	tests := []struct {
		name, protocol, baseURL, model, path, want string
	}{
		{"gemini chat", "gemini", "", "models/gemini-test", "/chat/completions", "/v1beta/models/gemini-test:streamGenerateContent?alt=sse"},
		{"gemini speech before mimo", "gemini", "", "mimo-v2.5-tts", "/audio/speech", "/v1beta/models/mimo-v2.5-tts:generateContent"},
		{"gemini video before cog", " GEMINI ", "https://api.example", "cogvideox-3", "/videos", "/v1beta/models/cogvideox-3:predictLongRunning"},
		{"gemini operation", "gemini", "", "veo", "/videos/operations/task", "/v1beta/operations/task"},
		{"minimax create", "metaso", "https://api.example", "MiniMax-H3", "/videos", "/v2/video_generation"},
		{"minimax other endpoint unchanged", "metaso", "https://api.example", "MiniMax-H3", "/images/generations", "/images/generations"},
		{"cog video", "openai", "", " COGVIDEOX-3 ", "/videos", "/videos/generations"},
		{"grok2api 1.5 before ark URL", " GROK2API ", "https://api.example/api/plan/v3", " GROK-IMAGINE-VIDEO-1.5 ", "/videos", "/videos/generations"},
		{"sub2api create", "sub2api", "", "grok-imagine-video", "/videos", "/videos"},
		{"sub2api content", "sub2api", "", "grok-imagine-video-1.5", "/videos/task_xxx/content", "/videos/generations/task_xxx/content"},
		{"grok2api content unchanged", "grok2api", "", "grok-imagine-video-1.5", "/videos/task_xxx/content", "/videos/task_xxx/content"},
		{"openai seedance unchanged", "openai", "", "doubao-seedance-2", "/videos", "/videos"},
		{"openai plan URL unchanged", "openai", "https://api.example/API/PLAN/V3", "deployment-id", "/videos", "/videos"},
		{"ark create", "ark", "https://ark.cn-beijing.volces.com/api/v3", "doubao-seedance-2.0", "/videos", "/contents/generations/tasks"},
		{"ark poll", "ark", "https://ark.cn-beijing.volces.com/api/plan/v3", "doubao-seedance-2.0", "/videos/task a?b", "/contents/generations/tasks/task a?b"},
		{"jimeng image", "jimeng", "https://visual.volcengineapi.com", "jimeng_high_aes_general_v21_L", "/images/generations", "/?Action=CVProcess&Version=2022-08-31"},
		{"jimeng video", "jimeng", "https://visual.volcengineapi.com", "jimeng_vgfm_t2v_l20", "/videos", "/?Action=CVSync2AsyncSubmitTask&Version=2022-08-31"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := model.ModelChannel{Protocol: test.protocol, BaseURL: test.baseURL}
			if got := resolveAIProxyPath(channel, test.model, test.path); got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
	for _, protocol := range []string{"", "openai", "grok2api", "canvas-openapi-video", "metaso", "mimo", "future-protocol"} {
		for _, path := range []string{"/chat/completions", "/responses", "/images/generations", "/images/edits", "/audio/speech", "/videos", "/videos/task", "/models"} {
			if got := resolveAIProxyPath(model.ModelChannel{Protocol: protocol}, "future-model", path); got != path {
				t.Errorf("passthrough %q %q: got %q", protocol, path, got)
			}
		}
	}
}
func TestModelProtocolProxyURLContract(t *testing.T) {
	tests := []struct {
		name, protocol, baseURL, model, path, want string
	}{
		{"default version", "openai", " https://api.example/ ", "model", "/models", "https://api.example/v1/models"},
		{"existing v1", "openai", "https://api.example/v1/", "model", "/videos", "https://api.example/v1/videos"},
		{"gemini base version", "gemini", "https://api.example/v1beta/", "model", "/v1beta/models/model:generateContent", "https://api.example/v1beta/models/model:generateContent"},
		{"metaso no v1", "metaso", "https://api.example/", "MiniMax-H3", "/v2/video_generation", "https://api.example/v2/video_generation"},
		{"agnes query", "openai", "https://api.example/v1/", "agnes-video-2.5", "/videos/video_a b", "https://api.example/agnesapi?model_name=agnes-video-2.5&video_id=video_a+b"},
		{"agnes wins protocol URL builder", "gemini", "https://api.example/v1", "agnes-video-2.5", "/videos/video_task", "https://api.example/agnesapi?model_name=agnes-video-2.5&video_id=video_task"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := model.ModelChannel{Protocol: test.protocol, BaseURL: test.baseURL}
			if got := resolveAIProxyURL(channel, test.model, test.path); got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}
func TestModelProtocolProxyPreparationOrder(t *testing.T) {
	blockProtocolNetwork(t)
	tests := []struct {
		name, protocol, baseURL, model, endpoint, path, body string
		wantPath, wantBody, wantLabel, wantError             string
		mode                                                 aiProtocolRequestMode
	}{
		{
			name: "Gemini continues MiMo and retains Gemini path", protocol: "gemini", baseURL: "https://api.example", model: "mimo-v2.5-tts", endpoint: "/audio/speech",
			body:     `{"model":"discarded-by-Gemini","stream":true,"input":" hello ","instructions":" calm ","response_format":"MP3"}`,
			wantPath: "/v1beta/models/mimo-v2.5-tts:generateContent", wantLabel: "MiMo TTS",
			wantBody: `{"model":"mimo-v2.5-tts","messages":[{"role":"user","content":"calm"},{"role":"assistant","content":"hello"}],"audio":{"format":"mp3","voice":"冰糖"}}`,
		},
		{
			name: "Gemini malformed body stops before MiMo", protocol: "gemini", model: "mimo-v2.5-tts", endpoint: "/audio/speech", body: `{`,
			wantPath: "/v1beta/models/mimo-v2.5-tts:generateContent", wantLabel: "Gemini", wantError: "unexpected end of JSON input",
		},
		{
			name: "Gemini video uses supplied path", protocol: "gemini", baseURL: "https://api.example", model: "future-model", path: "/custom-video", mode: aiProtocolVideoRequest,
			body:     `{"model":"inner","stream":true,"prompt":"scene","seconds":7}`,
			wantPath: "/custom-video", wantLabel: "Gemini", wantBody: `{"prompt":"scene","seconds":7}`,
		},
		{
			name: "compatible passthrough", protocol: "unknown", model: "future-model", endpoint: "/chat/completions", body: `not JSON`,
			wantPath: "/chat/completions", wantBody: `not JSON`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			channel := model.ModelChannel{Protocol: test.protocol, BaseURL: test.baseURL}
			path := test.path
			if path == "" {
				path = resolveAIProxyPath(channel, test.model, test.endpoint)
			}
			// Exercise the pure stage extracted from proxyAIRequest, without its
			// database selection, billing, upstream request or logging side effects.
			got, _, err := prepareAIProtocolRequest(aiProtocolRequest{
				mode: test.mode, channel: channel, modelName: test.model,
				endpoint: test.endpoint, path: path, contentType: "application/json", body: []byte(test.body),
			})
			if got.path != test.wantPath || got.failureLabel != test.wantLabel {
				t.Fatalf("got path %q, stage %q; want %q, %q", got.path, got.failureLabel, test.wantPath, test.wantLabel)
			}
			if test.wantError != "" {
				if err == nil || err.Error() != test.wantError {
					t.Fatalf("got error %v; want %q", err, test.wantError)
				}
				return
			}
			if err != nil || got.contentType != "application/json" {
				t.Fatalf("got content type %q, error %v", got.contentType, err)
			}
			assertProtocolBytes(t, got.body, []byte(test.wantBody))
		})
	}
}
