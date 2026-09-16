package handler

import "testing"

func TestParseCanvasOpenAPIVideoPayload(t *testing.T) {
	created := parseVideoTaskPayload([]byte(`{"ok":true,"data":{"task_id":"task_xxx","status":"processing"}}`), "model-id")
	if created.UpstreamTaskID != "task_xxx" || created.Status != "processing" {
		t.Fatalf("created = %#v", created)
	}

	completed := parseVideoTaskPayload([]byte(`{"ok":true,"data":{"task_id":"task_xxx","status":"succeeded","result_url":"https://media.example/video.mp4"}}`), "model-id")
	if completed.Status != "completed" || completed.VideoURL != "https://media.example/video.mp4" || completed.Progress != 100 {
		t.Fatalf("completed = %#v", completed)
	}

	failed := parseVideoTaskPayload([]byte(`{"ok":true,"data":{"task_id":"task_xxx","status":"failed","error":"生成失败","upstream_error":"上游拒绝"}}`), "model-id")
	if failed.Status != "failed" || failed.Error != "生成失败：上游拒绝" {
		t.Fatalf("failed = %#v", failed)
	}
}
