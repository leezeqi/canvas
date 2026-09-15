package handler

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

type aiProtocolRequestMode uint8

const (
	aiProtocolProxyRequest aiProtocolRequestMode = iota
	aiProtocolVideoRequest
	aiProtocolDirectRequest
)

type aiProtocolRequest struct {
	mode         aiProtocolRequestMode
	body         []byte
	contentType  string
	modelName    string
	channel      model.ModelChannel
	endpoint     string
	path         string
	failureLabel string
}

type aiProtocolAdapter struct {
	id            string
	path          func(model.ModelChannel, string, string) (string, bool)
	url           func(model.ModelChannel, string, string) (string, bool)
	prepare       func(aiProtocolRequest) (aiProtocolRequest, bool, error)
	copyResponse  func(http.ResponseWriter, *http.Response, *http.Request, model.ModelChannel, aiLogContext, func()) bool
	videoResponse func([]byte, *http.Request, model.ModelChannel, string, bool) ([]byte, bool)
	videoContent  func(http.ResponseWriter, *http.Request, string) bool
	videoID       func(string, string) bool
	uploads       func(model.ModelChannel, map[string]bool) (map[string]directAIUpload, error)
	videoPoll     func(model.ModelChannel, string, string, string) (string, string, []byte, string, bool)
}

// HTTP 混合钩子留在原 handler 包边界，避免 service 反向依赖 handler。
// 表只初始化一次；每阶段只执行自身钩子，bool 表示停止匹配，不表示字段是否改变。
var builtinAIProtocols = []aiProtocolAdapter{
	{
		id:           service.ModelChannelProtocolGemini,
		videoContent: serveGeminiVideoTaskContent,
		path: func(channel model.ModelChannel, modelName string, path string) (string, bool) {
			if !service.IsGeminiChannel(channel) {
				return path, false
			}
			switch path {
			case "/chat/completions":
				return service.GeminiModelActionPath(modelName, "streamGenerateContent") + "?alt=sse", true
			case "/images/generations", "/images/edits", "/audio/speech":
				return service.GeminiModelActionPath(modelName, "generateContent"), true
			case "/videos":
				return service.GeminiModelActionPath(modelName, "predictLongRunning"), true
			}
			if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
				return service.GeminiOperationPath(strings.TrimPrefix(path, "/videos/")), true
			}
			return path, false
		},
		prepare: func(input aiProtocolRequest) (aiProtocolRequest, bool, error) {
			if input.mode == aiProtocolDirectRequest || !service.IsGeminiChannel(input.channel) {
				return input, false, nil
			}
			input.failureLabel = "Gemini"
			if input.mode == aiProtocolProxyRequest && input.endpoint == "/chat/completions" && !geminiStreamRequested(input.body) {
				input.path = service.GeminiModelActionPath(input.modelName, "generateContent")
			}
			var err error
			input.body, err = service.StripGeminiModelField(input.body, input.contentType)
			return input, input.mode == aiProtocolVideoRequest, err
		},
		videoResponse: func(payload []byte, _ *http.Request, channel model.ModelChannel, _ string, _ bool) ([]byte, bool) {
			if service.IsGeminiChannel(channel) {
				return transformGeminiVideoTaskResponse(payload)
			}
			return nil, false
		},
	},
	{
		id: service.ModelChannelProtocolMiMo,
		path: func(_ model.ModelChannel, modelName string, path string) (string, bool) {
			if service.IsMiMoTTSModelName(modelName) && path == "/audio/speech" {
				return "/chat/completions", true
			}
			return path, false
		},
		prepare: func(input aiProtocolRequest) (aiProtocolRequest, bool, error) {
			if input.mode != aiProtocolProxyRequest || !service.IsMiMoTTSModelName(input.modelName) || input.endpoint != "/audio/speech" {
				return input, false, nil
			}
			input.failureLabel = "MiMo TTS"
			var err error
			input.body, input.contentType, err = normalizeMiMoTTSBody(input.body, input.contentType, input.modelName)
			return input, true, err
		},
		copyResponse: func(w http.ResponseWriter, response *http.Response, _ *http.Request, _ model.ModelChannel, context aiLogContext, onFailure func()) bool {
			return copyMiMoTTSResponse(w, response, context, onFailure)
		},
	},
	{
		id: service.ModelChannelProtocolMiniMax,
		path: func(channel model.ModelChannel, modelName string, path string) (string, bool) {
			if !isMiniMaxVideoModel(channel, modelName) {
				return path, false
			}
			if path == "/videos" && service.IsMiniMaxH3ModelName(modelName) {
				return "/v2/video_generation", true
			}
			if path == "/videos" && service.IsMiniMaxHailuoModelName(modelName) { return "/v1/video_generation", true }
			if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
				taskID := strings.TrimSpace(strings.TrimPrefix(path, "/videos/"))
				if taskID != "" && !strings.Contains(taskID, "/") {
					if service.IsMiniMaxH3ModelName(modelName) { return "/v2/query/video_generation/" + url.PathEscape(taskID), true }
					return "/v1/query/video_generation?task_id=" + url.QueryEscape(taskID), true
				}
			}
			return path, true
		},
		videoResponse: func(payload []byte, request *http.Request, channel model.ModelChannel, modelName string, status bool) ([]byte, bool) {
			if status && isMiniMaxVideoModel(channel, modelName) && (strings.Contains(request.URL.Path, "/v2/query/video_generation/") || strings.Contains(request.URL.Path, "/v1/query/video_generation")) {
				return transformMiniMaxVideoTaskResponse(payload, request)
			}
			return nil, false
		},
	},
	{
		id: service.ModelChannelProtocolJimeng,
		path: jimengProtocolPath,
		prepare: prepareJimengProtocolRequest,
		copyResponse: copyJimengImageResponse,
		videoResponse: transformJimengVideoPayload,
		videoPoll: jimengVideoPollRequest,
	},
	{
		id: "model:cogvideox3",
		path: func(_ model.ModelChannel, modelName string, path string) (string, bool) {
			if !isCogVideoX3Model(modelName) {
				return path, false
			}
			if path == "/videos" {
				return "/videos/generations", true
			}
			if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
				taskID := strings.TrimSpace(strings.TrimPrefix(path, "/videos/"))
				if taskID != "" && !strings.Contains(taskID, "/") {
					return "/async-result/" + url.PathEscape(taskID), true
				}
			}
			return path, true
		},
	},
	{
		id: service.ModelChannelProtocolGrok2API,
		path: func(channel model.ModelChannel, modelName string, path string) (string, bool) {
			if strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolGrok2API) && (strings.EqualFold(strings.TrimSpace(modelName), "grok-imagine-video") || strings.EqualFold(strings.TrimSpace(modelName), "grok-imagine-video-1.5")) && path == "/videos" {
				return "/videos/generations", true
			}
			return path, false
		},
	},
	{
		id: service.ModelChannelProtocolArk,
		path: func(channel model.ModelChannel, _ string, path string) (string, bool) {
			if !service.IsArkChannel(channel) {
				return path, false
			}
			if path == "/videos" {
				return "/contents/generations/tasks", true
			}
			if strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content") {
				return "/contents/generations/tasks/" + strings.TrimPrefix(path, "/videos/"), true
			}
			return path, true
		},
		prepare: prepareArkSeedanceRequest,
		uploads: func(model.ModelChannel, map[string]bool) (map[string]directAIUpload, error) {
			return nil, nil
		},
	},
	{
		id: "model:agnes",
		videoID: func(modelName string, id string) bool {
			return isAgnesVideoModel(modelName) && strings.HasPrefix(id, "video_")
		},
		url: func(channel model.ModelChannel, modelName string, path string) (string, bool) {
			videoID, ok := agnesVideoQueryID(modelName, path)
			if !ok {
				return "", false
			}
			baseURL := strings.TrimRight(strings.TrimSpace(channel.BaseURL), "/")
			if strings.HasSuffix(strings.ToLower(baseURL), "/v1") {
				baseURL = strings.TrimRight(baseURL[:len(baseURL)-len("/v1")], "/")
			}
			values := url.Values{}
			values.Set("video_id", videoID)
			values.Set("model_name", modelName)
			return baseURL + "/agnesapi?" + values.Encode(), true
		},
	},
	{
		id:   service.ModelChannelProtocolOpenAI,
		path: func(_ model.ModelChannel, _ string, path string) (string, bool) { return path, true },
	},
}

func prepareAIProtocolRequest(input aiProtocolRequest) (aiProtocolRequest, string, error) {
	for _, adapter := range builtinAIProtocols {
		if adapter.prepare == nil {
			continue
		}
		var stop bool
		var err error
		input, stop, err = adapter.prepare(input)
		if err != nil || stop {
			return input, adapter.id, err
		}
	}
	return input, "", nil
}

func copyAIProtocolResponse(w http.ResponseWriter, response *http.Response, request *http.Request, channel model.ModelChannel, context aiLogContext, onFailure func()) bool {
	for _, adapter := range builtinAIProtocols {
		if adapter.copyResponse != nil && adapter.copyResponse(w, response, request, channel, context, onFailure) {
			return true
		}
	}
	return false
}

func transformAIProtocolVideoPayload(payload []byte, request *http.Request, channel model.ModelChannel, modelName string, status bool) []byte {
	for _, adapter := range builtinAIProtocols {
		if adapter.videoResponse != nil {
			if result, ok := adapter.videoResponse(payload, request, channel, modelName, status); ok {
				return result
			}
		}
	}
	return payload
}

func isAIProtocolVideoID(modelName string, id string) bool {
	for _, adapter := range builtinAIProtocols {
		if adapter.videoID != nil && adapter.videoID(modelName, id) {
			return true
		}
	}
	return false
}
