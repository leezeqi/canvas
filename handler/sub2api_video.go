package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/tigerowo/infinite-canvas/model"
	"github.com/tigerowo/infinite-canvas/service"
)

const sub2APIMinPollInterval = 6 * time.Second

func sub2APIVideoPollError(task model.VideoTask, channel model.ModelChannel, status int, retryAfter string, current time.Time, message, payload string) (service.VideoTaskPollUpdate, bool) {
	if !strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolSub2API) {
		return service.VideoTaskPollUpdate{}, false
	}
	update := service.VideoTaskPollUpdate{
		Status: task.Status, ErrorDetail: message, ResponseBody: payload,
		Poll404Count: task.Poll404Count, PollRetryCount: task.PollRetryCount, PollStateChanged: true,
	}
	fail := func() (service.VideoTaskPollUpdate, bool) {
		update.Status, update.Error, update.NextPollAt = "failed", message, ""
		return update, true
	}
	switch {
	case status == http.StatusNotFound:
		update.Poll404Count++
		update.PollRetryCount = 0
		if update.Poll404Count >= 5 {
			return fail()
		}
		update.NextPollAt = current.Add(sub2APIMinPollInterval).UTC().Format(time.RFC3339Nano)
	case status == http.StatusTooManyRequests:
		update.Poll404Count = 0
		update.PollRetryCount++
		if update.PollRetryCount > 5 {
			return fail()
		}
		delay := sub2APIRetryDelay(retryAfter, current, update.PollRetryCount)
		if delay < sub2APIMinPollInterval {
			delay = sub2APIMinPollInterval
		}
		update.NextPollAt = current.Add(delay).UTC().Format(time.RFC3339Nano)
	case status >= http.StatusInternalServerError:
		update.Poll404Count = 0
		update.PollRetryCount++
		if update.PollRetryCount > 3 {
			return fail()
		}
		delay := time.Duration(1<<min(update.PollRetryCount, 4)) * time.Second
		if delay < sub2APIMinPollInterval {
			delay = sub2APIMinPollInterval
		}
		update.NextPollAt = current.Add(delay).UTC().Format(time.RFC3339Nano)
	default:
		return fail()
	}
	return update, true
}

func sub2APIRetryDelay(value string, current time.Time, attempt int) time.Duration {
	if seconds, err := strconv.Atoi(strings.TrimSpace(value)); err == nil && seconds >= 0 {
		return time.Duration(seconds) * time.Second
	}
	if deadline, err := http.ParseTime(strings.TrimSpace(value)); err == nil && deadline.After(current) {
		return deadline.Sub(current)
	}
	return time.Duration(1<<min(attempt, 4)) * time.Second
}

func sub2APIVideoPath(channel model.ModelChannel, modelName, path string) (string, bool) {
	if !strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolSub2API) {
		return path, false
	}
	if modelName != "grok-imagine-video" && modelName != "grok-imagine-video-1.5" {
		return path, false
	}
	return path, true
}

func serveSub2APIVideoTaskContent(w http.ResponseWriter, r *http.Request, id string) bool {
	user, ok := service.UserFromContext(r.Context())
	if !ok {
		return false
	}
	task, found, err := service.GetUserVideoTask(user.ID, strings.TrimSpace(id))
	if err != nil || !found || strings.TrimSpace(task.VideoURL) == "" {
		return false
	}
	var channel model.ModelChannel
	if strings.TrimSpace(task.UserChannelID) != "" {
		channel, err = service.SelectUserLocalModelChannelForModel(task.UserID, task.Model, task.UserChannelID)
	} else {
		channel, err = service.SelectModelChannelForModel(task.Model, task.ChannelID)
	}
	if err != nil || !strings.EqualFold(strings.TrimSpace(channel.Protocol), service.ModelChannelProtocolSub2API) {
		return false
	}
	contentURL, contentErr := url.Parse(task.VideoURL)
	baseURL, baseErr := url.Parse(channel.BaseURL)
	if contentErr != nil || baseErr != nil || !strings.EqualFold(contentURL.Scheme, baseURL.Scheme) || !strings.EqualFold(contentURL.Host, baseURL.Host) || (contentURL.Scheme != "http" && contentURL.Scheme != "https") || !sub2APIVideoContentPath(contentURL.Path) {
		return false
	}
	request, err := http.NewRequestWithContext(r.Context(), http.MethodGet, contentURL.String(), nil)
	if err != nil {
		Fail(w, "视频内容下载失败")
		return true
	}
	service.SetModelChannelAuthHeader(request, channel)
	response, err := service.HTTPClientForChannel(channel).Do(request)
	if err != nil {
		Fail(w, "视频内容下载失败")
		return true
	}
	defer response.Body.Close()
	if response.StatusCode >= http.StatusBadRequest {
		Fail(w, readUpstreamAIErrorMessage(nil, response.StatusCode))
		return true
	}
	if contentType := response.Header.Get("Content-Type"); contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(response.StatusCode)
	_, _ = io.Copy(w, response.Body)
	return true
}

func sub2APIVideoContentPath(path string) bool {
	marker := "/videos/"
	index := strings.LastIndex(path, marker)
	if index < 0 || !strings.HasSuffix(path, "/content") {
		return false
	}
	id := strings.TrimSuffix(path[index+len(marker):], "/content")
	id = strings.TrimPrefix(id, "generations/")
	return id != "" && !strings.Contains(id, "/")
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
