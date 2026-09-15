import assert from "node:assert/strict";
import test from "node:test";
import { directProtocolAdapters } from "./direct-registry";
import { normalizeDirectStatus, readDirectError } from "./shared";

test("direct protocol registry contains only Ark", () => {
    assert.deepEqual(Object.keys(directProtocolAdapters), ["ark"]);
    assert.equal(directProtocolAdapters.ark.pollPath("task/a b?"), "/contents/generations/tasks/task%2Fa%20b%3F");
    assert.equal(directProtocolAdapters.ark.readTaskId({ id: " ark-task " }), "ark-task");
    assert.equal(directProtocolAdapters.ark.readCreatedVideoStatus({ status: "queued" }), "processing");
});

test("Ark video polling keeps task, status and result URL", () => {
    assert.deepEqual(directProtocolAdapters.ark.readVideoPoll({
        id: "ark-task",
        status: "succeeded",
        content: { video_url: "https://media.example/ark.mp4" },
    }, "fallback", "seedance"), {
        id: "ark-task",
        task_id: "ark-task",
        status: "completed",
        video_url: "https://media.example/ark.mp4",
        url: "https://media.example/ark.mp4",
        model: "seedance",
    });
});

test("shared parsing keeps business errors and does not treat plain messages as failures", () => {
    for (const payload of [{}, { code: 0, message: "ok" }, { code: "200", msg: "ok" }, { message: "raw upstream text" }]) {
        assert.equal(readDirectError(payload), "");
    }
    assert.equal(readDirectError({ code: "429", msg: " slow down ", message: "fallback" }), "slow down");
    assert.equal(readDirectError({ code: 500 }), "上游请求失败：500");
    assert.equal(readDirectError({ error: { message: "outer" }, data: { error: { message: "inner" }, failMsg: "task" } }), "outer");
    assert.equal(readDirectError({ data: { failCode: "task-code" } }), "task-code");
    assert.equal(normalizeDirectStatus(" SUCCESS "), "completed");
    assert.equal(normalizeDirectStatus("unknown"), "processing");
    assert.equal(directProtocolAdapters.ark.readError({ code: 500 }), "上游请求失败：500");
});
