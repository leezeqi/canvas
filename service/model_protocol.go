package service

import (
	"net/http"
	"sort"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

const (
	ModelChannelProtocolOpenAI             = "openai"
	ModelChannelProtocolGrok2API           = "grok2api"
	ModelChannelProtocolSub2API            = "sub2api"
	ModelChannelProtocolCanvasOpenAPIVideo = "canvas-openapi-video"
	ModelChannelProtocolArk                = "ark"
	ModelChannelProtocolJimeng             = "jimeng"
)

type modelProtocolAdapter struct {
	buildURL  func(model.ModelChannel, string) string
	setAuth   func(*http.Request, model.ModelChannel)
	models    func(model.ModelChannel) ([]string, error)
	testModel func(model.ModelChannel, string) (string, error)
}

type modelProtocolRule struct {
	id      string
	matches func(model.ModelChannel, string) bool
}

var modelProtocolRegistry map[string]modelProtocolAdapter
var modelProtocolIDs = []string{ModelChannelProtocolOpenAI, ModelChannelProtocolGemini, ModelChannelProtocolGrok2API, ModelChannelProtocolSub2API, ModelChannelProtocolCanvasOpenAPIVideo, ModelChannelProtocolMiniMax, ModelChannelProtocolMiMo, ModelChannelProtocolArk, ModelChannelProtocolJimeng}

func init() {
	compatible := modelProtocolAdapter{
		buildURL: buildOpenAIModelChannelURL,
		setAuth: func(request *http.Request, channel model.ModelChannel) {
			request.Header.Set("Authorization", "Bearer "+channel.APIKey)
		},
		models:    fetchOpenAIAdminChannelModels,
		testModel: testOpenAIChannelModel,
	}
	modelProtocolRegistry = make(map[string]modelProtocolAdapter, 6)
	for _, id := range modelProtocolIDs {
		modelProtocolRegistry[id] = compatible
	}
	gemini := compatible
	gemini.buildURL = BuildGeminiChannelURL
	gemini.setAuth = func(request *http.Request, channel model.ModelChannel) {
		request.Header.Set("x-goog-api-key", channel.APIKey)
	}
	gemini.models = fetchGeminiAdminChannelModels
	gemini.testModel = testGeminiChannelModel
	modelProtocolRegistry[ModelChannelProtocolGemini] = gemini

	sub2api := compatible
	sub2api.models = func(model.ModelChannel) ([]string, error) {
		return []string{"grok-imagine-video", "grok-imagine-video-1.5"}, nil
	}
	sub2api.testModel = func(model.ModelChannel, string) (string, error) {
		return "Sub2API Grok 视频渠道配置格式已通过；尚未验证 API Key、分组权限或余额，请使用【GROK】视频分组的 Key 在画布中测试生成。", nil
	}
	modelProtocolRegistry[ModelChannelProtocolSub2API] = sub2api

	canvasOpenAPIVideo := compatible
	canvasOpenAPIVideo.testModel = func(model.ModelChannel, string) (string, error) {
		return "Canvas OpenAPI 视频渠道配置格式已通过；后台测试不会提交付费视频任务，请在视频创作台验证模型权限、余额和生成参数。", nil
	}
	modelProtocolRegistry[ModelChannelProtocolCanvasOpenAPIVideo] = canvasOpenAPIVideo

	minimax := compatible
	minimax.buildURL = func(channel model.ModelChannel, path string) string {
		return normalizeModelChannelBaseURL(channel.BaseURL) + path
	}
	minimax.models = func(model.ModelChannel) ([]string, error) { return MiniMaxModels(), nil }
	minimax.testModel = func(model.ModelChannel, string) (string, error) {
		return "MiniMax-H3 是异步视频模型，请在视频创作台测试生成。", nil
	}
	modelProtocolRegistry[ModelChannelProtocolMiniMax] = minimax

	mimo := compatible
	mimo.models = func(model.ModelChannel) ([]string, error) {
		result := MiMoModels()
		sort.Strings(result)
		return result, nil
	}
	mimo.testModel = testMiMoTTSChannelModel
	modelProtocolRegistry[ModelChannelProtocolMiMo] = mimo

	ark := compatible
	ark.testModel = testArkSeedanceChannelModel
	modelProtocolRegistry[ModelChannelProtocolArk] = ark

	jimeng := compatible
	jimeng.buildURL = func(channel model.ModelChannel, path string) string {
		return strings.TrimRight(strings.TrimSpace(channel.BaseURL), "/") + path
	}
	jimeng.models = func(model.ModelChannel) ([]string, error) { return JimengModels(), nil }
	jimeng.testModel = func(model.ModelChannel, string) (string, error) {
		return "即梦是异步图片/视频模型，请在画布中测试生成。", nil
	}
	modelProtocolRegistry[ModelChannelProtocolJimeng] = jimeng
	glm := compatible
	glm.testModel = testGLMTTSChannelModel
	modelProtocolRegistry["model:glm-tts"] = glm
}

// 发现模型、配置测试与生成的命中规则不同，分别保留原有优先级。
var modelDiscoveryRules = []modelProtocolRule{
	{ModelChannelProtocolSub2API, func(channel model.ModelChannel, _ string) bool { return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolSub2API) }},
	{ModelChannelProtocolGemini, func(channel model.ModelChannel, _ string) bool { return IsGeminiChannel(channel) }},
	{ModelChannelProtocolMiniMax, func(channel model.ModelChannel, _ string) bool { return IsMiniMaxChannel(channel) }},
	{ModelChannelProtocolMiMo, func(channel model.ModelChannel, _ string) bool { return IsMiMoChannel(channel) }},
	{ModelChannelProtocolArk, func(channel model.ModelChannel, _ string) bool { return IsArkChannel(channel) }},
	{ModelChannelProtocolJimeng, func(channel model.ModelChannel, _ string) bool { return IsJimengChannel(channel) }},
}

var modelConfigTestRules = []modelProtocolRule{
	{ModelChannelProtocolSub2API, func(channel model.ModelChannel, _ string) bool { return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolSub2API) }},
	{ModelChannelProtocolCanvasOpenAPIVideo, func(channel model.ModelChannel, _ string) bool {
		return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolCanvasOpenAPIVideo)
	}},
	{ModelChannelProtocolMiniMax, func(channel model.ModelChannel, _ string) bool { return IsMiniMaxChannel(channel) }},
	{ModelChannelProtocolArk, func(channel model.ModelChannel, _ string) bool { return IsArkChannel(channel) }},
	{ModelChannelProtocolJimeng, func(channel model.ModelChannel, _ string) bool { return IsJimengChannel(channel) }},
}

var modelGenerationTestRules = []modelProtocolRule{
	{"model:glm-tts", func(_ model.ModelChannel, modelName string) bool {
		return strings.EqualFold(strings.TrimSpace(modelName), "glm-tts")
	}},
	{ModelChannelProtocolMiMo, func(_ model.ModelChannel, modelName string) bool { return IsMiMoTTSModelName(modelName) }},
	{ModelChannelProtocolGemini, func(channel model.ModelChannel, _ string) bool { return IsGeminiChannel(channel) }},
}

func modelProtocolForChannel(channel model.ModelChannel) modelProtocolAdapter {
	protocol := strings.TrimSpace(channel.Protocol)
	if adapter, ok := modelProtocolRegistry[protocol]; ok {
		return adapter
	}
	for _, id := range modelProtocolIDs {
		if strings.EqualFold(protocol, id) {
			return modelProtocolRegistry[id]
		}
	}
	return modelProtocolRegistry[ModelChannelProtocolOpenAI]
}

func IsArkChannel(channel model.ModelChannel) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolArk)
}

func IsJimengChannel(channel model.ModelChannel) bool {
	return strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolJimeng)
}

func matchModelProtocol(rules []modelProtocolRule, channel model.ModelChannel, modelName string) (modelProtocolAdapter, bool) {
	for _, rule := range rules {
		if rule.matches(channel, modelName) {
			return modelProtocolRegistry[rule.id], true
		}
	}
	return modelProtocolRegistry[ModelChannelProtocolOpenAI], false
}
