package service

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/tigerowo/infinite-canvas/model"
)

var userModelHTTPClient = newUserModelHTTPClient()

func newUserModelHTTPClient() *http.Client {
	safeClient := SafeProxyHTTPClient()
	return &http.Client{
		Transport:     safeClient.Transport,
		Timeout:       30 * time.Second,
		CheckRedirect: safeClient.CheckRedirect,
	}
}

func CurrentUserCanvasOpenAPIModels(ctx context.Context, channel model.ModelChannel) ([]string, error) {
	user, ok := UserFromContext(ctx)
	if !ok || strings.TrimSpace(user.ID) == "" {
		return nil, safeMessageError{message: "请先登录"}
	}
	if !strings.EqualFold(strings.TrimSpace(channel.Protocol), ModelChannelProtocolCanvasOpenAPIVideo) {
		return nil, safeMessageError{message: "该接口仅支持 Canvas OpenAPI 视频渠道"}
	}
	channel.BaseURL = strings.TrimSpace(channel.BaseURL)
	channel.APIKey = strings.TrimSpace(channel.APIKey)
	parsed, err := url.Parse(channel.BaseURL)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, safeMessageError{message: "渠道地址格式错误"}
	}
	if channel.APIKey == "" {
		return nil, safeMessageError{message: "缺少 API Key"}
	}
	return fetchOpenAIChannelModels(userModelHTTPClient, channel)
}
