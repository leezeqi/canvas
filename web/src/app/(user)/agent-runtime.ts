import { nanoid } from "nanoid";

import { createCanvasAudioTask, pollCanvasAudioTaskStatus } from "@/services/api/audio";
import { CANVAS_AGENT_JSON_FALLBACK_SIGNAL, requestCanvasAgentTurn } from "@/services/api/canvas-agent";
import { createCanvasImageTask, pollCanvasImageTaskStatus } from "@/services/api/image";
import { createVideoGenerationTask, pollCreatedVideoGenerationTask } from "@/services/api/video";
import { imageToDataUrl, uploadImage } from "@/services/image-storage";
import type { AgentChatMedia, AgentChatMediaKind, AgentChatStatus } from "@/stores/use-agent-chat-store";
import { defaultConfig, useConfigStore, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import { CANVAS_AGENT_TOOLS, normalizeCanvasAgentAction, parseCanvasAgentJson, type CanvasAgentAction, type CanvasAgentToolDefinition, type CanvasAgentToolResult } from "./canvas/agent/canvas-agent-tools";
import type { CanvasAgentContent, CanvasAgentProtocolMessage, CanvasAgentToolMode } from "./canvas/types";

export type AgentMediaSource = { id: string; kind: AgentChatMediaKind | "text"; label: string; url?: string; storageKey?: string; mimeType?: string };

export type RunAgentChatInput = {
    sessionId: string;
    config: AiConfig;
    mediaConfig: AiConfig;
    protocolMessages: CanvasAgentProtocolMessage[];
    userText: string;
    sources: AgentMediaSource[];
    turnSourceIds: string[];
    skillPrompt?: string;
    signal: AbortSignal;
    onStep: (step: { id: string; label: string; status: AgentChatStatus }) => void;
    onMedia: (media: AgentChatMedia) => void;
};

const MAX_STEPS = 8;
const KIND_LABEL: Record<AgentChatMediaKind, string> = { image: "图片", video: "视频", audio: "语音" };
const DONE_STATUS = ["completed", "complete", "done", "succeeded", "success"];
const FAILED_STATUS = ["failed", "error", "cancelled", "canceled"];
const TOOL_DESCRIPTIONS: Partial<Record<CanvasAgentAction["name"], string>> = {
    generate_image: "根据提示词生成图片，结果会直接展示在对话中。sourceNodeIds 放参考图片的素材 ID，独立生成传空数组；图片按数组顺序编号为图片1、图片2。",
    edit_image: "基于已有图片修改或重绘，结果会直接展示在对话中。sourceNodeIds 至少包含一个图片素材 ID，按数组顺序编号。",
    generate_video: "根据提示词生成视频，结果会直接展示在对话中。sourceNodeIds 放参考图片的素材 ID，独立生成传空数组。",
    generate_audio: "把 prompt 中的文本合成为语音，instructions 写音色与演绎说明，结果会直接展示在对话中；sourceNodeIds 传空数组。",
};
const AGENT_TOOLS: CanvasAgentToolDefinition[] = CANVAS_AGENT_TOOLS.flatMap((tool) => {
    const description = TOOL_DESCRIPTIONS[tool.function.name];
    return description ? [{ ...tool, function: { ...tool.function, description } }] : [];
});
const SYSTEM_PROMPT = `你是「无限画布」的创作助手，负责日常交流、写作、方案策划，以及图片、视频、语音的生成和修改。
- 问答、写作、分析类需求直接用 Markdown 文字回答，简洁清楚。
- 用户要生成或修改图片、视频、语音时调用对应工具。提示词要具体完整：补全主体、风格、构图、光线、镜头等细节，用户已给出的要求不得删减。
- 工具结果会自动展示给用户，回复里不要贴链接或 base64，只需简短说明做了什么。
- 引用素材时，把素材 ID 放进 sourceNodeIds，只能使用下方素材列表中真实存在的 ID。
- 工具失败时如实说明原因和建议，不要声称已经完成。`;

export async function runAgentChat(input: RunAgentChatInput) {
    let toolMode: CanvasAgentToolMode = "native";
    let messages: CanvasAgentProtocolMessage[] = [...input.protocolMessages, { role: "user", content: await buildUserContent(input) }];
    const sourceText = input.sources.length ? "\n\n【当前对话可引用的素材】\n" + input.sources.map((source) => `- ${source.label}：ID ${source.id}（${source.kind}）`).join("\n") : "";
    const systemPrompt = SYSTEM_PROMPT + sourceText + (input.skillPrompt ? "\n\n" + input.skillPrompt : "");

    for (let step = 0; step < MAX_STEPS; step++) {
        input.signal.throwIfAborted();
        const thinkingId = nanoid();
        input.onStep({ id: thinkingId, label: step ? "根据结果继续处理" : "理解需求", status: "running" });
        const turn = await requestCanvasAgentTurn({ config: input.config, systemPrompt, messages, tools: AGENT_TOOLS, toolMode, signal: input.signal });
        input.onStep({ id: thinkingId, label: step ? "根据结果继续处理" : "理解需求", status: "success" });
        toolMode = turn.toolMode;
        if (toolMode === "native" && !turn.toolCalls.length && turn.content.trim() === CANVAS_AGENT_JSON_FALLBACK_SIGNAL) {
            toolMode = "structured-json";
            continue;
        }

        const parsed = turn.toolCalls.length ? null : await parseCanvasAgentJson(turn.content, { allowRepair: toolMode !== "native" });
        let error = turn.toolError || turn.toolCalls.find((call) => call.argumentsError)?.argumentsError || parsed?.error;
        let actions: CanvasAgentAction[] = [];
        if (!error) {
            try {
                actions = turn.toolCalls.length ? turn.toolCalls.map((call) => normalizeCanvasAgentAction(call.name, call.arguments, call.id)) : parsed?.actions || [];
            } catch (actionError) {
                error = actionError instanceof Error ? actionError.message : "工具参数无效";
            }
        }
        const assistant: CanvasAgentProtocolMessage = {
            role: "assistant",
            content: turn.content || undefined,
            ...(turn.reasoningContent !== undefined ? { reasoningContent: turn.reasoningContent } : {}),
            ...(turn.responseItems?.length ? { responseItems: turn.responseItems } : {}),
            ...(turn.toolCalls.length ? { toolCalls: turn.toolCalls } : {}),
        };

        if (!error && !actions.length) {
            const reply = (parsed?.parsed ? parsed.reply : turn.content).trim() || "好的，还有什么需要我做的？";
            messages = [...messages, { role: "assistant", content: reply, ...(turn.responseItems?.length ? { responseItems: turn.responseItems } : {}) }];
            return { reply, protocolMessages: persistProtocolMessages(messages) };
        }

        const results: Array<{ id: string; name: string; result: CanvasAgentToolResult }> = error
            ? turn.toolCalls.map((call) => ({ id: call.id, name: call.name, result: { ok: false, code: "invalid_tool_arguments", message: error + "。本批操作均未执行，请按工具定义修正后重试。" } as CanvasAgentToolResult }))
            : await Promise.all(actions.map(async (action) => ({ id: action.id, name: action.name, result: await executeAction(action, input) })));
        messages = [
            ...messages,
            assistant,
            ...(toolMode === "native" && turn.toolCalls.length
                ? results.map((item) => ({ role: "tool" as const, toolCallId: item.id, name: item.name, content: JSON.stringify(item.result) }))
                : [{ role: "user" as const, content: "工具执行结果（只可依据这些真实结果继续）：\n" + (error ? JSON.stringify({ ok: false, message: error }) : JSON.stringify(results)) }]),
        ];
    }

    const reply = "本轮已达到操作步数上限，已完成的结果都保留在对话里。你可以让我继续下一步。";
    return { reply, protocolMessages: persistProtocolMessages([...messages, { role: "assistant", content: reply }]) };
}

async function executeAction(action: CanvasAgentAction, input: RunAgentChatInput): Promise<CanvasAgentToolResult> {
    if (!TOOL_DESCRIPTIONS[action.name]) return { ok: false, code: "unsupported_tool", message: "当前对话不支持该工具" };
    const kind: AgentChatMediaKind = action.name === "generate_video" ? "video" : action.name === "generate_audio" ? "audio" : "image";
    const args = action.arguments;
    const prompt = String(args.prompt || "");
    const sourceIds = Array.isArray(args.sourceNodeIds) ? (args.sourceNodeIds as string[]) : [];
    const missingId = sourceIds.find((id) => !input.sources.some((source) => source.id === id));
    if (missingId) return { ok: false, code: "source_not_found", message: `找不到素材 ID：${missingId}` };
    const images: ReferenceImage[] = input.sources
        .filter((source) => sourceIds.includes(source.id) && source.kind === "image")
        .map((source) => ({ id: source.id, name: `${source.id}.png`, type: source.mimeType || "image/png", dataUrl: source.url || "", storageKey: source.storageKey }));
    if (action.name === "edit_image" && !images.length) return { ok: false, code: "image_reference_required", message: "修改图片需要至少一张参考图片" };
    const config = mediaConfig(input.mediaConfig, kind, args);
    if (!config.model || !useConfigStore.getState().isAiConfigReady(config, config.model)) return { ok: false, code: "model_not_configured", message: `请先在设置中完成${KIND_LABEL[kind]}模型配置` };

    const stepId = nanoid();
    const count = kind === "image" ? Math.min(Math.max(Number(args.count) || 1, 1), 4) : 1;
    input.onStep({ id: stepId, label: `正在生成${KIND_LABEL[kind]}`, status: "running" });
    const outcomes = await Promise.all(Array.from({ length: count }, async () => {
        const media: AgentChatMedia = { id: nanoid(), kind, prompt, status: "running" };
        input.onMedia(media);
        try {
            const result = await generateMedia(kind, config, prompt, images, input);
            input.onMedia({ ...media, ...result, status: "success" });
            return { id: media.id, ok: true };
        } catch (error) {
            const message = error instanceof Error ? error.message : `${KIND_LABEL[kind]}生成失败`;
            input.onMedia({ ...media, status: "error", error: message });
            return { id: media.id, ok: false, message };
        }
    }));
    const failed = outcomes.filter((item) => !item.ok);
    input.onStep({ id: stepId, label: failed.length ? `${KIND_LABEL[kind]}生成失败` : `已生成${KIND_LABEL[kind]}`, status: failed.length === outcomes.length ? "error" : "success" });
    return failed.length === outcomes.length
        ? { ok: false, code: "generation_failed", message: failed[0].message }
        : { ok: true, status: "completed", mediaIds: outcomes.filter((item) => item.ok).map((item) => item.id), message: `已生成 ${outcomes.length - failed.length} 个${KIND_LABEL[kind]}并展示给用户` };
}

async function generateMedia(kind: AgentChatMediaKind, config: AiConfig, prompt: string, images: ReferenceImage[], input: RunAgentChatInput): Promise<Pick<AgentChatMedia, "url" | "storageKey" | "mimeType">> {
    const { signal, sessionId } = input;
    if (kind === "video") {
        const created = await createVideoGenerationTask(config, prompt, { references: images }, undefined, { signal, source: "canvas", sourceId: sessionId });
        const result = await Promise.race([
            pollCreatedVideoGenerationTask(config, created.task, { startedAt: created.startedAt, requestBody: created.requestBody }),
            new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true })),
        ]);
        return { url: result.url, storageKey: result.task.storageKey, mimeType: result.mimeType };
    }
    if (kind === "audio") {
        let task = await createCanvasAudioTask(config, prompt, { signal, sourceId: sessionId });
        while (!isDone(task)) {
            await waitPoll(signal);
            task = await pollCanvasAudioTaskStatus(task.id, signal);
        }
        return { url: task.audio_url || task.url, storageKey: task.storageKey, mimeType: task.mimeType };
    }
    let task = await createCanvasImageTask(config, prompt, images, { signal, source: "canvas", sourceId: sessionId });
    while (!isDone(task)) {
        await waitPoll(signal);
        task = await pollCanvasImageTaskStatus(task.id, signal);
    }
    const url = task.image_url || task.url || "";
    if (!url) throw new Error("接口没有返回图片");
    if (url.startsWith("data:")) {
        const stored = await uploadImage(url);
        return { url: stored.url, storageKey: stored.storageKey, mimeType: stored.mimeType };
    }
    return { url, storageKey: task.storageKey, mimeType: task.mimeType };
}

function isDone(task: { status: string; error?: { message?: string }; error_detail?: string }) {
    const value = (task.status || "").toLowerCase();
    if (FAILED_STATUS.includes(value)) throw new Error(task.error?.message || task.error_detail || "生成失败");
    return DONE_STATUS.includes(value);
}

async function waitPoll(signal: AbortSignal) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    signal.throwIfAborted();
}

function mediaConfig(config: AiConfig, kind: AgentChatMediaKind, args: Record<string, unknown>): AiConfig {
    const size = typeof args.size === "string" && args.size ? args.size : undefined;
    if (kind === "image") return { ...config, model: config.imageModel || config.model, activeChannelId: config.imageChannelId, count: "1", ...(size ? { size } : {}) };
    if (kind === "video") {
        return {
            ...config,
            model: config.videoModel,
            activeChannelId: config.videoChannelId,
            size: size || config.videoSize || defaultConfig.videoSize,
            videoSeconds: typeof args.seconds === "number" ? String(args.seconds) : config.videoSeconds,
            videoGenerateAudio: typeof args.generateAudio === "boolean" ? String(args.generateAudio) : config.videoGenerateAudio,
        };
    }
    return {
        ...config,
        model: config.audioModel || defaultConfig.audioModel,
        activeChannelId: config.audioChannelId || config.activeChannelId,
        ...(typeof args.voice === "string" && args.voice ? { audioVoice: args.voice } : {}),
        ...(typeof args.instructions === "string" && args.instructions ? { audioInstructions: args.instructions } : {}),
    };
}

async function buildUserContent(input: RunAgentChatInput): Promise<CanvasAgentContent> {
    const turnSources = input.sources.filter((source) => input.turnSourceIds.includes(source.id));
    const text = input.userText + (turnSources.length ? "\n\n本次消息附带的素材：" + turnSources.map((source) => `${source.label} → ID ${source.id}`).join("；") : "");
    const images = await Promise.all(turnSources.filter((source) => source.kind === "image").map((source) => imageToDataUrl({ url: source.url, storageKey: source.storageKey }).catch(() => "")));
    const parts = images.filter(Boolean).map((url) => ({ type: "image_url" as const, image_url: { url } }));
    return parts.length ? [{ type: "text", text }, ...parts] : text;
}

function persistProtocolMessages(messages: CanvasAgentProtocolMessage[]) {
    return messages.map((message): CanvasAgentProtocolMessage =>
        (message.role === "user" || message.role === "system") && Array.isArray(message.content)
            ? { role: message.role, content: message.content.filter((item) => item.type === "text").map((item) => item.text).join("\n") || "本轮包含图片附件。" }
            : message,
    );
}
