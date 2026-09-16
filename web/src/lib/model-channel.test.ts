import assert from "node:assert/strict";
import test from "node:test";
import { directAIProviderForProtocol, modelChannelApiKeyUrls, modelChannelDefaultBaseUrls, modelChannelProtocolOptions } from "./model-channel";

test("built-in protocol options retain both settings panels' labels and order", () => {
    assert.deepEqual(modelChannelProtocolOptions, [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
        { label: "Grok2API", value: "grok2api" },
        { label: "Sub2API（Grok 视频）", value: "sub2api" },
        { label: "火山方舟", value: "ark" },
        { label: "即梦", value: "jimeng" },
        { label: "MiMo", value: "mimo" },
    ]);
});

test("built-in protocols retain all existing default URLs and API Key links", () => {
    assert.deepEqual(modelChannelDefaultBaseUrls, {
        openai: "https://api.openai.com",
        gemini: "https://generativelanguage.googleapis.com",
        grok2api: "",
        sub2api: "https://sub2api.dk996.top",
        metaso: "https://metaso.cn/api/minimax",
        ark: "https://ark.cn-beijing.volces.com/api/v3",
        jimeng: "https://visual.volcengineapi.com",
        mimo: "https://api.xiaomimimo.com",
    });
    assert.deepEqual(modelChannelApiKeyUrls, {
        metaso: "https://metaso.cn/minimax-h3/?s=tt",
        mimo: "https://platform.xiaomimimo.com/?ref=JFZQR2",
    });
});

test("public parameter translation eligibility keeps exact protocol matching", () => {
    assert.equal(directAIProviderForProtocol("ark"), "ark");
    for (const protocol of ["openai", "gemini", "grok2api", "metaso", "jimeng", "mimo", "ARK", " ark ", "", "unknown"]) {
        assert.equal(directAIProviderForProtocol(protocol), null, protocol);
    }
});
