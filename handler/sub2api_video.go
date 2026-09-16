package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

func sub2APIVideoPath(channel model.ModelChannel, modelName, path string) (string, bool) {
	if !strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolSub2API) {
		return path, false
	}
	if modelName != "grok-imagine-video" && modelName != "grok-imagine-video-1.5" {
		return path, false
	}
	if strings.HasPrefix(path, "/videos/") && strings.HasSuffix(path, "/content") {
		id := strings.TrimSuffix(strings.TrimPrefix(path, "/videos/"), "/content")
		if id != "" && !strings.Contains(id, "/") {
			return "/videos/generations/" + url.PathEscape(id) + "/content", true
		}
	}
	return path, true
}

func transformSub2APIVideoPayload(payload []byte, request *http.Request, channel model.ModelChannel, _ string, _ bool) ([]byte, bool) {
	if !strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolSub2API) {
		return payload, false
	}
	var data map[string]any
	if json.Unmarshal(payload, &data) != nil {
		return payload, true
	}
	videoURL := readStringPath(data, "video.url")
	if videoURL == "" {
		return payload, true
	}
	reference, err := url.Parse(videoURL)
	if err != nil {
		return payload, true
	}
	data["video_url"] = request.URL.ResolveReference(reference).String()
	if duration := readStringPath(data, "video.duration"); duration != "" {
		data["seconds"] = duration
	}
	result, err := json.Marshal(data)
	if err != nil {
		return payload, true
	}
	return result, true
}
