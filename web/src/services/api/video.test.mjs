import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import vm from "node:vm";

// Run the real API module with only network, account and media storage replaced.
function fixture(protocol = "sub2api", token = "", channelMode = "local", pollSequence = []) {
    const calls = [];
    const channel = { id: "channel", baseUrl: "https://gateway.example/v1", apiKey: "channel-key" };
    const config = { protocol, channelMode, model: "grok-imagine-video-1.5", videoModel: "grok-imagine-video-1.5", videoSeconds: "5", vquality: "720", size: "1280x720", systemPrompts: { video: "" }, systemPrompt: "" };
    const payload = { id: "task_xxx", task_id: "task_xxx", status: "done", video: { url: "/v1/videos/task_xxx/content", duration: 5 } };
    const modules = {
        axios: { post: async (url, body, options) => { calls.push({ url, body, ...options }); return { data: { id: "task_xxx", status: "queued" } }; }, get: async (url, options) => { calls.push({ url, ...options }); const next = pollSequence.shift(); if (next instanceof Error) throw next; return { data: next || payload }; }, isAxiosError: (error) => Boolean(error?.isAxiosError) },
        "@/lib/model-channel": { CANVAS_OPENAPI_VIDEO_PROTOCOL: "canvas-openapi-video" },
        "@/stores/use-config-store": { channelProtocolForConfig: (value) => value.protocol, localChannelForActiveModel: () => channel, channelIdForActiveModel: () => channel.id, directAIProviderForConfig: () => null, buildApiUrl: (base, path) => base.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1" + path },
        "@/stores/use-user-store": { useUserStore: { getState: () => ({ token, hydrateUser: async () => {} }) } },
        "@/services/image-storage": { imageToDataUrl: async (reference) => reference.dataUrl, imageToPublicUrl: async (reference) => reference.url || (() => { throw new Error("需要公网图片地址"); })(), resolveImageUrl: async (_storageKey, url) => url, autoSyncToCloud: async () => null },
        "@/services/file-storage": { resolveMediaUrl: async (_storageKey, url) => url, uploadMediaFile: async (blob) => { assert.equal(await blob.text(), "mp4-bytes"); return { url: "blob:cached", storageKey: "cached" }; } },
    };
    const load = (path) => {
        const exports = {};
        const bindings = {};
        let source = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), "utf8"));
        source = source.replace(/^import\s+([\s\S]*?)\s+from\s+"([^"]+)";\s*/gm, (_, imports, name) => {
            if (imports.startsWith("{")) for (const key of imports.slice(1, -1).split(",").map((item) => item.trim()).filter(Boolean)) bindings[key] = modules[name]?.[key] || (() => false);
            else bindings[imports] = modules[name];
            return "";
        });
        const names = [...source.matchAll(/^export (?:async )?(?:function|class|const) (\w+)/gm)].map((match) => match[1]);
        source = source.replace(/^export /gm, "") + `\nObject.assign(exports, {${names.join(",")}});`;
        vm.runInNewContext(source, {
            exports, ...bindings,
            URL, FormData, Blob, File, setTimeout: (callback) => { callback(); return 0; },
            fetch: async (url, options) => { calls.push({ url, ...options }); return new Response("mp4-bytes", { headers: { "Content-Type": "video/mp4" } }); },
        }, { filename: path });
        return exports;
    };
    modules["@/lib/seedance-video"] = load("../../lib/seedance-video.ts");
    modules["@/lib/video-model-capabilities"] = load("../../lib/video-model-capabilities.ts");
    return { api: load("./video.ts"), calls, config, payload };
}

test("Canvas OpenAPI video sends documented JSON fields for public references", async () => {
    const { api, calls, config } = fixture("canvas-openapi-video");
    config.model = config.videoModel = "5306c539-741f-4bf6-bac6-415d5c39bca1";
    await api.createVideoGenerationTask(config, "电影感运镜", {
        references: [{ url: "https://media.example/ref.png", dataUrl: "" }],
        videoReferences: [{ url: "https://media.example/ref.mp4" }],
        audioReferences: [{ url: "https://media.example/ref.mp3" }],
        firstFrame: { url: "https://media.example/first.png", dataUrl: "" },
        lastFrame: { url: "https://media.example/last.png", dataUrl: "" },
    });
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0].body)), {
        model: config.model,
        prompt: "电影感运镜",
        aspect_ratio: "16:9",
        seconds: 5,
        resolution: "720p",
        reference_image_urls: ["https://media.example/ref.png"],
        reference_videos: ["https://media.example/ref.mp4"],
        reference_audios: ["https://media.example/ref.mp3"],
        first_frame_url: "https://media.example/first.png",
        last_frame_url: "https://media.example/last.png",
    });
});

test("Canvas OpenAPI video uses multipart field names for local files", async () => {
    const { api, calls, config } = fixture("canvas-openapi-video");
    config.model = config.videoModel = "5306c539-741f-4bf6-bac6-415d5c39bca1";
    await api.createVideoGenerationTask(config, "参考视频", { videoReferences: [{ name: "ref.mp4", type: "video/mp4", url: "blob:ref" }] });
    const body = calls.find((call) => call.body)?.body;
    assert.ok(body instanceof FormData);
    assert.equal(body.get("model"), config.model);
    assert.equal(body.get("aspect_ratio"), "16:9");
    assert.equal(body.get("resolution"), "720p");
    assert.equal(body.get("reference_videos")?.name, "ref.mp4");
    assert.equal(body.has("video_reference[]"), false);
});

test("Canvas OpenAPI video unwraps nested success and failure responses", async () => {
    const success = fixture("canvas-openapi-video");
    success.config.model = success.config.videoModel = "5306c539-741f-4bf6-bac6-415d5c39bca1";
    Object.assign(success.payload, { ok: true, data: { task_id: "task_xxx", status: "succeeded", result_url: "https://media.example/result.mp4" } });
    delete success.payload.id;
    delete success.payload.task_id;
    delete success.payload.status;
    delete success.payload.video;
    const result = await success.api.pollCreatedVideoGenerationTask(success.config, { id: "task_xxx" });
    assert.equal(result.task.status, "succeeded");
    assert.equal(result.task.video_url, "https://media.example/result.mp4");

    const failure = fixture("canvas-openapi-video");
    failure.config.model = failure.config.videoModel = success.config.model;
    Object.assign(failure.payload, { ok: true, data: { task_id: "task_xxx", status: "failed", error: "生成失败", upstream_error: "上游拒绝" } });
    delete failure.payload.id;
    delete failure.payload.task_id;
    delete failure.payload.status;
    delete failure.payload.video;
    await assert.rejects(failure.api.pollCreatedVideoGenerationTask(failure.config, { id: "task_xxx" }), /生成失败：上游拒绝/);
    assert.equal(failure.calls.length, 1);
});

test("Sub2API sends the documented JSON for text and reference-image video", async () => {
    for (const model of ["grok-imagine-video", "grok-imagine-video-1.5"]) {
        const { api, calls, config } = fixture();
        config.model = config.videoModel = model;
        const references = model.endsWith("1.5") ? [{ url: "https://media.example/ref.png" }] : [];
        await api.createVideoGenerationTask(config, "镜头平稳推进", references);
        assert.equal(calls[0].url, "https://gateway.example/v1/videos");
        assert.equal(calls[0].headers.Authorization, "Bearer channel-key");
        assert.deepEqual(JSON.parse(JSON.stringify(calls[0].body)), { model, prompt: "镜头平稳推进", seconds: "5", duration: 5, resolution: "720p", aspect_ratio: "16:9", ratio: "16:9", ...(references.length ? { images: [references[0].url] } : {}) });
    }
});

test("Sub2API completes relative-URL polling and authenticated download in all channel modes", async () => {
    for (const [token, mode] of [["", "local"], ["session", "local"], ["session", "remote"]]) {
        const { api, calls, config, payload } = fixture("sub2api", token, mode);
        if (token) Object.assign(payload, { id: "client_video_task_local", video_url: "https://gateway.example/v1/videos/task_xxx/content" });
        const task = { id: token ? "client_video_task_local" : "task_xxx", task_id: "task_xxx" };
        const result = await api.pollCreatedVideoGenerationTask(config, task);
        assert.equal(result.url, "blob:cached");
        assert.equal(calls[0].url, token ? "/api/v1/videos/client_video_task_local" : "https://gateway.example/v1/videos/task_xxx");
        assert.equal(calls[1].url, (token ? "/api/v1/videos/task_xxx/content" : "https://gateway.example/v1/videos/task_xxx/content") + "?model=grok-imagine-video-1.5");
        assert.equal(calls[1].headers.Authorization, token ? "Bearer session" : "Bearer channel-key");
        if (token) assert.equal(calls[1].headers[mode === "local" ? "X-User-Model-Channel-ID" : "X-Model-Channel-ID"], "channel");
    }
});

test("Sub2API rejects unsupported inputs before submitting a paid task", async () => {
    const reference = { url: "https://media.example/ref.png" };
    for (const [settings, input] of [
        [{}, [reference, reference]],
        [{ model: "grok-imagine-video" }, Array.from({ length: 8 }, () => reference)],
        [{}, { lastFrame: reference }],
        [{}, { videoReferences: [{ url: "https://media.example/ref.mp4" }] }],
        [{}, { audioReferences: [{ url: "https://media.example/ref.mp3" }] }],
        [{ vquality: "4k" }, []],
        [{ size: "4:3" }, []],
        [{ videoSeconds: "-1" }, []],
        [{ videoSeconds: "16" }, []],
        [{ model: "seedance" }, []],
    ]) {
        const { api, calls, config } = fixture();
        Object.assign(config, settings);
        await assert.rejects(api.createVideoGenerationTask(config, "scene", input));
        assert.equal(calls.length, 0);
    }
});

test("Sub2API defaults adaptive ratio to 16:9 and preserves valid seconds and resolutions", async () => {
    const { api, calls, config } = fixture();
    Object.assign(config, { size: "auto", vquality: "1080", videoSeconds: "7" });
    await api.createVideoGenerationTask(config, "scene");
    assert.equal(calls[0].body.aspect_ratio, "16:9");
    assert.equal(calls[0].body.resolution, "1080p");
    assert.equal(calls[0].body.seconds, "7");
    assert.equal(calls[0].body.duration, 7);
    assert.equal(calls[0].body.ratio, "16:9");
});

test("Sub2API requires public HTTP images", async () => {
    const { api, calls, config } = fixture();
    await assert.rejects(api.createVideoGenerationTask(config, "scene", [{ dataUrl: "data:image/png;base64,AQID" }]), /公网图片地址/);
    assert.equal(calls.length, 0);
});

test("Sub2API failed task does not start a content download", async () => {
    const { api, calls, config, payload } = fixture();
    Object.assign(payload, { status: "failed", error: { message: "上游失败" } });
    await assert.rejects(api.pollCreatedVideoGenerationTask(config, { id: "task_xxx" }), /上游失败/);
    assert.equal(calls.length, 1);
});

test("Sub2API direct polling fails only on the fifth consecutive 404", async () => {
    const notFound = () => Object.assign(new Error("not found"), { isAxiosError: true, response: { status: 404, data: {} } });
    const success = fixture("sub2api", "", "local", [notFound(), notFound(), notFound(), notFound(), { id: "task_xxx", status: "done", video_url: "https://gateway.example/v1/videos/task_xxx/content" }]);
    const result = await success.api.pollCreatedVideoGenerationTask(success.config, { id: "task_xxx" });
    assert.equal(result.url, "blob:cached");
    assert.equal(success.calls.filter((call) => !String(call.url).includes("/content?")).length, 5);

    const failure = fixture("sub2api", "", "local", [notFound(), notFound(), notFound(), notFound(), notFound()]);
    await assert.rejects(failure.api.pollCreatedVideoGenerationTask(failure.config, { id: "task_xxx" }), /404/);
    assert.equal(failure.calls.length, 5);

    const resumed = fixture("sub2api", "", "local", [notFound(), notFound(), notFound(), notFound(), { id: "task_xxx", status: "processing" }]);
    assert.equal((await resumed.api.pollVideoGenerationTaskStatus(resumed.config, { id: "task_xxx" })).status, "processing");
    assert.equal(resumed.calls.length, 5);
});

test("Sub2API direct polling bounds transient retries", async () => {
    const httpError = (status, headers = {}) => Object.assign(new Error(String(status)), { isAxiosError: true, response: { status, headers, data: {} } });
    for (const [status, retries] of [[429, 5], [502, 3]]) {
        const sequence = [...Array.from({ length: retries }, () => httpError(status)), { id: "task_xxx", status: "done", video_url: "https://gateway.example/v1/videos/task_xxx/content" }];
        const success = fixture("sub2api", "", "local", sequence);
        assert.equal((await success.api.pollCreatedVideoGenerationTask(success.config, { id: "task_xxx" })).url, "blob:cached");

        const failure = fixture("sub2api", "", "local", Array.from({ length: retries + 1 }, () => httpError(status)));
        await assert.rejects(failure.api.pollCreatedVideoGenerationTask(failure.config, { id: "task_xxx" }), new RegExp(String(status)));
        assert.equal(failure.calls.length, retries + 1);
    }

    const badRequest = fixture("sub2api", "", "local", [httpError(400)]);
    await assert.rejects(badRequest.api.pollCreatedVideoGenerationTask(badRequest.config, { id: "task_xxx" }), /400/);
    assert.equal(badRequest.calls.length, 1);
});

test("Grok2API preserves its reference shape and authenticated content endpoint", async () => {
    const { api, calls, config, payload } = fixture("grok2api");
    await api.createVideoGenerationTask(config, "scene", [{ dataUrl: "data:image/png;base64,AQID" }]);
    assert.equal(calls[0].url, "https://gateway.example/v1/videos/generations");
    assert.equal(calls[0].body.duration, 5);
    assert.equal(calls[0].body.image.url, "data:image/png;base64,AQID");
    Object.assign(payload, { status: "completed", video_url: "https://gateway.example/v1/videos/task_xxx/content" });
    await api.pollCreatedVideoGenerationTask(config, { id: "task_xxx" });
    assert.equal(calls[2].url, "https://gateway.example/v1/videos/task_xxx/content?model=grok-imagine-video-1.5");
});
