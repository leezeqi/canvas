package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

// Literal fixtures were derived from HEAD before introducing the registry.
// Keep representative field, reference and model-specific normalization contracts.
func TestModelProtocolRequestGoldens(t *testing.T) {
	blockProtocolNetwork(t)
	tests := []struct {
		name, protocol, model, endpoint, body, want, uploads string
	}{
		{
			name: "ark seedance", protocol: "ark", model: "doubao-seedance-2.0",
			body: `{"prompt":"scene","seconds":15,"size":"16:9","resolution_name":"4k","video_generate_audio":true,"video_watermark":false,"input_reference[]":["https://media.invalid/image.png"],"first_frame_url":"https://media.invalid/first.png","last_frame_url":"https://media.invalid/last.png","video_reference[]":["https://media.invalid/video.mp4"],"audio_reference[]":["https://media.invalid/audio.mp3"]}`,
			want: `{"model":"doubao-seedance-2.0","content":[{"type":"text","text":"scene"},{"type":"image_url","image_url":{"url":"https://media.invalid/image.png"},"role":"reference_image"},{"type":"image_url","image_url":{"url":"https://media.invalid/first.png"},"role":"first_frame"},{"type":"image_url","image_url":{"url":"https://media.invalid/last.png"},"role":"last_frame"},{"type":"video_url","video_url":{"url":"https://media.invalid/video.mp4"},"role":"reference_video"},{"type":"audio_url","audio_url":{"url":"https://media.invalid/audio.mp3"},"role":"reference_audio"}],"duration":15,"ratio":"16:9","resolution":"4k","generate_audio":true,"watermark":false}`,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			endpoint := test.endpoint
			if endpoint == "" {
				endpoint = "/videos"
			}
			input := directAIRequestInput{
				Channel: directAIChannelInput{Protocol: test.protocol, BaseURL: "https://upstream.invalid"},
				Model:   test.model, Endpoint: endpoint, Body: protocolJSON(t, test.body),
			}
			plan, err := prepareDirectAIRequest(input)
			if err != nil {
				t.Fatal(err)
			}
			if plan.Provider != test.protocol || plan.ContentType != "application/json" {
				t.Fatalf("unexpected direct plan: %#v", plan)
			}
			if test.want != "" {
				assertProtocolJSONValue(t, plan.Body, test.want)
			}
			if test.uploads != "" {
				assertProtocolJSONValue(t, plan.Uploads, test.uploads)
			} else if len(plan.Uploads) != 0 {
				t.Fatalf("unexpected upload instructions: %#v", plan.Uploads)
			}
			assertProtocolJSONValue(t, input.Body, test.body)
		})
	}
}

func TestModelProtocolDirectSecurityContract(t *testing.T) {
	blockProtocolNetwork(t)
	tests := []struct {
		name, protocol, baseURL, model, endpoint string
		body                                     any
		want                                     string
	}{
		{"missing model first", "ark", "bad", "", "/bad", nil, "缺少模型名称"},
		{"unsupported endpoint", "ark", "bad", "model", "/audio/speech", nil, "当前接口不支持本地参数转译"},
		{"invalid base", "ark", "ftp://api.example", "model", "/videos", nil, "渠道地址格式错误"},
		{"nested key", "ark", "", "model", "", map[string]any{"input": []any{map[string]any{" API_KEY ": "secret"}}}, "参数转译请求不能包含 API Key"},
		{"nested data URL", "ark", "", "model", "", map[string]any{"input": []any{" DATA:image/png;base64,AAAA "}}, "参考文件不能传给参数转译接口"},
		{"nested blob URL", "ark", "", "model", "", map[string]any{"input": []any{"blob:https://local.invalid/id"}}, "参考文件不能传给参数转译接口"},
		{"unsupported protocol", "openai", "", "model", "", map[string]any{"prompt": "scene"}, "当前渠道不支持本地复用后端转译"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			baseURL, endpoint := test.baseURL, test.endpoint
			if baseURL == "" {
				baseURL = "https://upstream.invalid"
			}
			if endpoint == "" {
				endpoint = "/videos"
			}
			_, err := prepareDirectAIRequest(directAIRequestInput{
				Channel: directAIChannelInput{Protocol: test.protocol, BaseURL: baseURL},
				Model:   test.model, Endpoint: endpoint, Body: test.body,
			})
			if err == nil || err.Error() != test.want {
				t.Fatalf("got error %v, want %q", err, test.want)
			}
		})
	}
}

func TestModelProtocolDirectHTTPEnvelope(t *testing.T) {
	blockProtocolNetwork(t)
	tests := []struct {
		name, body, want string
	}{
		{"anonymous success", `{"channel":{"protocol":"ark","baseUrl":"https://upstream.invalid"},"model":"doubao-seedance-2.0","endpoint":"/videos","body":{"prompt":"scene"}}`, `{"code":0,"data":{"provider":"ark","url":"https://upstream.invalid/v1/contents/generations/tasks","contentType":"application/json","body":{"model":"doubao-seedance-2.0","content":[{"type":"text","text":"scene"}]}},"msg":"ok"}`},
		{"empty", "", `{"code":1,"data":null,"msg":"请求参数不能为空"}`},
		{"invalid JSON", "{", `{"code":1,"data":null,"msg":"请求参数格式错误"}`},
		{"missing model", "{}", `{"code":1,"data":null,"msg":"缺少模型名称"}`},
		{"oversized", `{"body":{"prompt":"` + strings.Repeat("x", 1<<20) + `"}}`, `{"code":1,"data":null,"msg":"请求参数格式错误"}`},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/ai/direct-request", strings.NewReader(test.body))
			recorder := httptest.NewRecorder()
			PrepareDirectAIRequest(recorder, request)
			if recorder.Code != http.StatusOK || recorder.Header().Get("Content-Type") != "application/json" {
				t.Fatalf("HTTP contract changed: status %d, headers %v", recorder.Code, recorder.Header())
			}
			assertProtocolJSONValue(t, protocolJSON(t, recorder.Body.String()), test.want)
		})
	}
}

func protocolJSON(t *testing.T, text string) any {
	t.Helper()
	var value any
	if err := json.Unmarshal([]byte(text), &value); err != nil {
		t.Fatalf("invalid fixture JSON: %v", err)
	}
	return value
}

func assertProtocolJSONValue(t *testing.T, got any, want string) {
	t.Helper()
	encoded, err := json.Marshal(got)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(protocolJSON(t, string(encoded)), protocolJSON(t, want)) {
		t.Fatalf("got %s; want %s", encoded, want)
	}
}

func blockProtocolNetwork(t *testing.T) {
	t.Helper()
	protocolMockHTTP(t, func(request *http.Request) (*http.Response, error) {
		t.Errorf("unexpected upstream request: %s %s", request.Method, request.URL)
		return nil, errors.New("contract test forbids upstream network I/O")
	})
}

func assertProtocolBytes(t *testing.T, got, want []byte) {
	t.Helper()
	if json.Valid(got) && json.Valid(want) {
		assertProtocolJSONValue(t, protocolJSON(t, string(got)), string(want))
	} else if !bytes.Equal(got, want) {
		t.Fatalf("raw payload changed: got %q, want %q", got, want)
	}
}

type protocolTransport func(*http.Request) (*http.Response, error)

func (transport protocolTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func protocolMockHTTP(t *testing.T, transport protocolTransport) {
	t.Helper()
	previous := http.DefaultTransport
	http.DefaultTransport = transport
	t.Cleanup(func() { http.DefaultTransport = previous })
}

type protocolResponseBody struct {
	io.Reader
	closed *int
}

func (body *protocolResponseBody) Close() error {
	*body.closed++
	return nil
}
