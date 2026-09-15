package handler

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

func isMiniMaxH3Channel(channel model.ModelChannel, modelName string) bool {
	return service.IsMiniMaxChannel(channel) && service.IsMiniMaxH3ModelName(modelName)
}

func isMiniMaxVideoModel(channel model.ModelChannel, modelName string) bool {
	return service.IsMiniMaxChannel(channel) && (service.IsMiniMaxH3ModelName(modelName) || service.IsMiniMaxHailuoModelName(modelName))
}

func transformMiniMaxVideoTaskResponse(payload []byte, request *http.Request) ([]byte, bool) {
	var root map[string]any
	if json.Unmarshal(payload, &root) != nil {
		return nil, false
	}
	task := root
	if nested, ok := root["task"].(map[string]any); ok { task = nested }
	result := map[string]any{}
	for key, value := range task { result[key] = value }
	result["task_id"] = firstNonEmpty(readStringPath(task, "id"), readStringPath(task, "task_id"))
	result["video_url"] = firstNonEmpty(readStringPath(task, "content.url"), readStringPath(task, "video_url"), readStringPath(task, "url"))
	result["size"] = firstNonEmpty(readStringPath(task, "resolution"), readStringPath(task, "size"))
	if fileID := firstNonEmpty(readStringPath(task, "file_id"), readStringPath(task, "fileId")); fileID != "" && result["video_url"] == "" {
		result["file_id"] = fileID
		result["video_url"] = hailuoContentURL(request, fileID)
	}
	if baseResp, ok := root["base_resp"].(map[string]any); ok {
		if code := readIntPath(baseResp, "status_code"); code != 0 { result["error"] = map[string]any{"message": firstNonEmpty(readStringPath(baseResp, "status_msg"), "MiniMax 视频任务失败")} }
	}
	transformed, err := json.Marshal(result)
	return transformed, err == nil
}

func hailuoContentURL(request *http.Request, fileID string) string {
	if request == nil || strings.TrimSpace(fileID) == "" { return "" }
	base := *request.URL
	base.Path = "/v1/files/download"
	base.RawQuery = url.Values{"file_id": []string{fileID}}.Encode()
	return base.String()
}
