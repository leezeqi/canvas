package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

func jimengProtocolPath(channel model.ModelChannel, modelName, path string) (string, bool) {
	if !service.IsJimengChannel(channel) { return path, false }
	switch {
	case path == "/images/generations":
		return service.JimengEndpoint("CVProcess"), true
	case path == "/videos":
		return service.JimengEndpoint("CVSync2AsyncSubmitTask"), true
	case strings.HasPrefix(path, "/videos/") && !strings.HasSuffix(path, "/content"):
		return service.JimengEndpoint("CVSync2AsyncGetResult"), true
	default:
		return path, true
	}
}

func prepareJimengProtocolRequest(input aiProtocolRequest) (aiProtocolRequest, bool, error) {
	if !service.IsJimengChannel(input.channel) { return input, false, nil }
	input.failureLabel = "即梦"
	if input.endpoint == "/images/generations" {
		body, err := normalizeJimengImageBody(input.body, input.modelName)
		input.body, input.contentType = body, "application/json"
		return input, true, err
	}
	if input.mode == aiProtocolVideoRequest && input.endpoint == "/videos" {
		body, err := normalizeJimengVideoBody(input.body, input.modelName)
		input.body, input.contentType = body, "application/json"
		return input, true, err
	}
	if input.mode == aiProtocolVideoRequest && strings.HasPrefix(input.endpoint, "/videos/") {
		input.body, input.contentType = []byte(`{"task_id":"`+strings.TrimPrefix(input.endpoint, "/videos/")+`"}`), "application/json"
		return input, true, nil
	}
	return input, false, nil
}

func normalizeJimengImageBody(body []byte, modelName string) ([]byte, error) {
	var input map[string]any
	if err := json.Unmarshal(body, &input); err != nil { return nil, err }
	result := map[string]any{"req_key": firstNonEmpty(modelName, toStringSafe(input["model"]), "jimeng_high_aes_general_v21_L"), "prompt": strings.TrimSpace(toStringSafe(input["prompt"]))}
	for _, key := range []string{"seed", "width", "height", "use_pre_llm", "use_sr", "return_url", "logo_info", "image_urls", "binary_data_base64"} {
		if value, ok := input[key]; ok { result[key] = value }
	}
	if n, ok := input["n"]; ok && len(readAnySlice(n)) > 0 { result["n"] = n }
	return json.Marshal(result)
}

func normalizeJimengVideoBody(body []byte, modelName string) ([]byte, error) {
	var input map[string]any
	if err := json.Unmarshal(body, &input); err != nil { return nil, err }
	baseReqKey := firstNonEmpty(modelName, toStringSafe(input["model"]), "jimeng_vgfm_t2v_l20")
	images := append([]any{}, readAnySlice(input["images"])...)
	if len(images) == 0 { images = append(images, readAnySlice(input["input_reference[]"])...) }
	result := map[string]any{"req_key": jimengReqKey(baseReqKey, len(images)), "prompt": strings.TrimSpace(toStringSafe(input["prompt"]))}
	if len(images) > 0 {
		urls, base64Data := []any{}, []any{}
		for _, item := range images {
			value := strings.TrimSpace(toStringSafe(item))
			if strings.HasPrefix(value, "http://") || strings.HasPrefix(value, "https://") { urls = append(urls, value) } else if strings.HasPrefix(value, "data:") { base64Data = append(base64Data, strings.SplitN(value, ",", 2)[1]) } else if value != "" { base64Data = append(base64Data, value) }
		}
		if len(urls) > 0 { result["image_urls"] = urls }
		if len(base64Data) > 0 { result["binary_data_base64"] = base64Data }
	}
	for _, key := range []string{"seed", "aspect_ratio", "frames"} { if value, ok := input[key]; ok { result[key] = value } }
	if _, ok := result["aspect_ratio"]; !ok {
		if ratio := jimengAspectRatio(toStringSafe(input["size"])); ratio != "" { result["aspect_ratio"] = ratio }
	}
	if seconds := toStringSafe(input["seconds"]); seconds != "" { result["frames"] = jimengFrames(seconds) }
	if strings.Contains(strings.ToLower(toStringSafe(result["req_key"])), "v30") {
		if _, ok := result["frames"]; !ok { result["frames"] = jimengFrames(toStringSafe(input["seconds"])) }
	}
	return json.Marshal(result)
}

func jimengReqKey(modelName string, imageCount int) string {
	key := strings.TrimSpace(modelName)
	if key == "jimeng_vgfm_t2v_l20" && imageCount > 0 { return "jimeng_vgfm_i2v_l20" }
	if key == "jimeng_v30_pro" { return "jimeng_ti2v_v30_pro" }
	if !strings.Contains(key, "jimeng_v30") { return key }
	if imageCount > 1 { return jimengTrimReqKey(strings.Replace(key, "jimeng_v30", "jimeng_i2v_first_tail_v30", 1)) }
	if imageCount == 1 { return jimengTrimReqKey(strings.Replace(key, "jimeng_v30", "jimeng_i2v_first_v30", 1)) }
	return strings.Replace(key, "jimeng_v30", "jimeng_t2v_v30", 1)
}

func jimengTrimReqKey(value string) string {
	return strings.TrimSuffix(value, "p")
}

func jimengAspectRatio(size string) string {
	parts := strings.Split(strings.ToLower(strings.TrimSpace(size)), "x")
	if len(parts) != 2 { return "" }
	width, height := 0.0, 0.0
	_, _ = fmt.Sscanf(parts[0], "%f", &width)
	_, _ = fmt.Sscanf(parts[1], "%f", &height)
	if width <= 0 || height <= 0 { return "" }
	ratio := width / height
	best, diff := "16:9", 1e9
	for _, item := range []struct{name string; value float64}{{"16:9",16.0/9},{"9:16",9.0/16},{"1:1",1},{"4:3",4.0/3},{"3:4",3.0/4},{"21:9",21.0/9}} {
		if d := ratio - item.value; d < 0 { d = -d; if d < diff { diff, best = d, item.name } } else if d < diff { diff, best = d, item.name }
	}
	return best
}

func jimengFrames(seconds string) int { if strings.TrimSpace(seconds) == "10" { return 241 }; return 121 }

func readAnySlice(value any) []any {
	if values, ok := value.([]any); ok { return values }
	if value == nil { return nil }
	return []any{value}
}

func copyJimengImageResponse(w http.ResponseWriter, response *http.Response, _ *http.Request, channel model.ModelChannel, context aiLogContext, _ func()) bool {
	if !service.IsJimengChannel(channel) { return false }
	payload, err := io.ReadAll(response.Body)
	if err != nil { return false }
	var root struct { Code int `json:"code"`; Message string `json:"message"`; Data struct { Binary []string `json:"binary_data_base64"`; URLs []string `json:"image_urls"` } `json:"data"` }
	if json.Unmarshal(payload, &root) != nil { return false }
	if root.Code != 0 && root.Code != 10000 { w.WriteHeader(http.StatusBadGateway); _, _ = w.Write([]byte(fmt.Sprintf(`{"error":{"message":%q}}`, root.Message))); return true }
	items := []map[string]string{}
	for _, value := range root.Data.URLs { items = append(items, map[string]string{"url": value}) }
	for _, value := range root.Data.Binary { items = append(items, map[string]string{"b64_json": value}) }
	created := int64(0)
	if !context.StartedAt.IsZero() { created = context.StartedAt.Unix() }
	result, _ := json.Marshal(map[string]any{"created": created, "data": items})
	w.Header().Set("Content-Type", "application/json"); w.WriteHeader(response.StatusCode); _, _ = w.Write(result)
	return true
}

func transformJimengVideoPayload(payload []byte, request *http.Request, channel model.ModelChannel, modelName string, status bool) ([]byte, bool) {
	if !service.IsJimengChannel(channel) || request == nil { return nil, false }
	var root map[string]any
	if json.Unmarshal(payload, &root) != nil { return nil, false }
	data, _ := root["data"].(map[string]any)
	if data == nil { data = root }
	result := map[string]any{"id": firstNonEmpty(readStringPath(data, "task_id"), readStringPath(data, "id")), "task_id": firstNonEmpty(readStringPath(data, "task_id"), readStringPath(data, "id")), "status": "processing", "progress": 0, "model": modelName}
	statusValue := strings.ToLower(firstNonEmpty(readStringPath(data, "status"), readStringPath(root, "status")))
	switch statusValue {
	case "done", "success", "completed":
		result["status"], result["progress"] = "completed", 100
	case "failed", "failure", "cancelled", "canceled":
		result["status"] = "failed"
	case "in_queue", "queued", "queue":
		result["status"], result["progress"] = "queued", 10
	case "processing", "running", "in_progress":
		result["status"], result["progress"] = "processing", 50
	}
	if readStringPath(data, "video_url") != "" { result["status"], result["progress"] = "completed", 100 }
	if result["status"] == "failed" { result["error"] = map[string]any{"message": firstNonEmpty(readStringPath(root, "message"), "即梦视频任务失败")} }
	if videoURL := firstNonEmpty(readStringPath(data, "video_url"), readStringPath(data, "url")); videoURL != "" { result["video_url"] = videoURL; result["url"] = videoURL }
	encoded, err := json.Marshal(result)
	return encoded, err == nil
}

func jimengVideoPollRequest(channel model.ModelChannel, modelName string, pollID string, requestBody string) (string, string, []byte, string, bool) {
	if !service.IsJimengChannel(channel) { return "", "", nil, "", false }
	reqKey := jimengReqKey(firstNonEmpty(modelName, "jimeng_vgfm_t2v_l20"), jimengRequestImageCount(requestBody))
	body, _ := json.Marshal(map[string]string{"req_key": reqKey, "task_id": pollID})
	return http.MethodPost, service.JimengEndpoint("CVSync2AsyncGetResult"), body, "application/json", true
}

func jimengRequestImageCount(requestBody string) int {
	var body map[string]any
	if json.Unmarshal([]byte(requestBody), &body) != nil { return 0 }
	for _, key := range []string{"image_urls", "binary_data_base64", "images", "input_reference[]"} {
		if values := readAnySlice(body[key]); len(values) > 0 { return len(values) }
	}
	return 0
}
