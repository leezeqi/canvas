"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { App, Segmented, Tooltip } from "antd";
import { FolderPlus, Check, ChevronRight, Copy, MessageSquare, Download, LoaderCircle, Maximize2, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

import { ImageGenerationPending } from "@/components/image-generation-pending";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";
import { resolveMediaUrl, uploadAssetMediaFile } from "@/services/file-storage";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import { useAgentChatStore, type AgentChatMedia, type AgentChatMessage, type AgentChatStep } from "@/stores/use-agent-chat-store";
import { useAgentSkillStore } from "@/stores/use-agent-skill-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import { runAgentChat, type AgentMediaSource } from "./agent-runtime";
import { AssetPickerModal } from "./canvas/components/asset-picker-modal";
import { ASSISTANT_MARKDOWN_COMPONENTS, AssistantMarkdown } from "./canvas/components/canvas-assistant-panel";
import { CanvasAssistantComposer } from "./canvas/components/canvas-assistant-composer";
import { useCanvasStore } from "./canvas/stores/use-canvas-store";
import { canvasResourceLabel } from "./canvas/utils/canvas-resource-references";
import {
    MAX_CANVAS_AGENT_SKILLS,
    CanvasNodeType,
    type CanvasAgentConfig,
    type CanvasAgentSkillSelection,
    type CanvasAssistantReference,
    type InsertAssetPayload,
    type PendingAgentAsset,
} from "./canvas/types";

const SUGGESTIONS = ["生成一张赛博朋克风格的城市夜景海报", "帮我写一段新品发布的宣传文案", "把上传的图片改成水彩插画风格", "为 30 秒短视频写一个分镜脚本"];
const MEDIA_LABEL = { image: "图片", video: "视频", audio: "语音" } as const;

function toPendingAgentAsset(payload: InsertAssetPayload, label: string): PendingAgentAsset {
    const nodeId = nanoid();
    let reference: CanvasAssistantReference;
    if (payload.kind === "text") {
        reference = { id: nodeId, type: CanvasNodeType.Text, title: payload.title, label, text: payload.content };
    } else {
        const common = { id: nodeId, title: payload.title, label, storageKey: payload.storageKey, mimeType: payload.mimeType };
        if (payload.kind === "image") reference = { ...common, type: CanvasNodeType.Image, dataUrl: payload.dataUrl };
        else if (payload.kind === "video") reference = { ...common, type: CanvasNodeType.Video, url: payload.url };
        else reference = { ...common, type: CanvasNodeType.Audio, url: payload.url };
    }
    return { nodeId, payload, reference };
}

function collectSources(messages: AgentChatMessage[]): AgentMediaSource[] {
    return messages.flatMap((message) => [
        ...(message.references || []).map((reference) => ({
            id: reference.id,
            kind: reference.type === CanvasNodeType.Video ? ("video" as const) : reference.type === CanvasNodeType.Audio ? ("audio" as const) : reference.type === CanvasNodeType.Text ? ("text" as const) : ("image" as const),
            label: `用户附件「${reference.label || reference.title}」`,
            url: reference.dataUrl || reference.url,
            storageKey: reference.storageKey,
            mimeType: reference.mimeType,
        })),
        ...(message.media || []).filter((media) => media.status === "success").map((media) => ({ ...media, label: `生成的${MEDIA_LABEL[media.kind]}「${media.prompt.slice(0, 24)}」` })),
    ]);
}

function upsert<T extends { id: string }>(items: T[] = [], item: T) {
    return items.some((current) => current.id === item.id) ? items.map((current) => (current.id === item.id ? { ...current, ...item } : current)) : [...items, item];
}

function useResolvedUrl(kind: "image" | "video" | "audio", url?: string, storageKey?: string) {
    const [src, setSrc] = useState(url || "");
    useEffect(() => {
        let alive = true;
        (kind === "image" ? resolveImageUrl(storageKey, url || "") : resolveMediaUrl(storageKey, url || "")).then((next) => alive && setSrc(next)).catch(() => {});
        return () => {
            alive = false;
        };
    }, [kind, storageKey, url]);
    return src;
}

export default function AgentPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const copyText = useCopyText();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const createProject = useCanvasStore((state) => state.createProject);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const { sessions, activeId, createSession, updateSession } = useAgentChatStore();
    const session = sessions.find((item) => item.id === activeId);
    const [mode, setMode] = useState<"chat" | "canvas">("chat");
    const [prompt, setPrompt] = useState("");
    const [pendingAssets, setPendingAssets] = useState<PendingAgentAsset[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<CanvasAgentSkillSelection[]>([]);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [running, setRunning] = useState(false);
    const [agentConfig, setAgentConfig] = useState<CanvasAgentConfig>(() => ({
        textApiMode: "chat",
        autoGenerateMedia: false,
        imageQuality: effectiveConfig.quality,
        imageSize: effectiveConfig.size,
        videoQuality: effectiveConfig.vquality,
        videoSize: effectiveConfig.videoSize,
    }));
    const abortRef = useRef<AbortController | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const pendingAssetCountsRef = useRef<Record<InsertAssetPayload["kind"], number>>({ text: 0, image: 0, video: 0, audio: 0 });
    const messages = session?.messages || [];

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, [messages]);

    const addPendingAsset = (payload: InsertAssetPayload) => {
        const asset = toPendingAgentAsset(payload, canvasResourceLabel(payload.kind, pendingAssetCountsRef.current[payload.kind]++));
        setPendingAssets((current) => [...current, asset]);
        setPrompt((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${asset.reference.label} `);
    };

    const uploadFile = async (file: File) => {
        try {
            if (file.type.startsWith("image/")) {
                const uploaded = await uploadImage(file);
                addPendingAsset({ kind: "image", dataUrl: uploaded.url, title: file.name, ...uploaded });
            } else if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
                const uploaded = await uploadAssetMediaFile(file);
                if (file.type.startsWith("video/")) addPendingAsset({ kind: "video", title: file.name, ...uploaded });
                else addPendingAsset({ kind: "audio", title: file.name, ...uploaded });
            } else {
                throw new Error("仅支持图片、视频和音频文件");
            }
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材上传失败");
        }
    };

    const onUploadInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void uploadFile(file);
    };

    const selectSkill = (skill: CanvasAgentSkillSelection) => {
        const existingIndex = selectedSkills.findIndex((selected) => selected.id === skill.id && selected.source === skill.source);
        if (existingIndex >= 0) return setSelectedSkills(selectedSkills.map((selected, index) => (index === existingIndex ? skill : selected)));
        if (selectedSkills.length >= MAX_CANVAS_AGENT_SKILLS) return void message.warning(`最多选择 ${MAX_CANVAS_AGENT_SKILLS} 个 Skill`);
        setSelectedSkills([...selectedSkills, skill]);
    };

    const loadSkillPrompt = async (skills: CanvasAgentSkillSelection[]) => {
        if (!skills.length) return "";
        const store = useAgentSkillStore.getState();
        if (!store.systemSkills.length && !store.userSkills.length) await store.loadSkills();
        const available = [...useAgentSkillStore.getState().systemSkills, ...useAgentSkillStore.getState().userSkills];
        return skills
            .map((selected, index) => {
                const skill = available.find((item) => item.id === selected.id && item.source === selected.source && item.enabled);
                if (!skill) throw new Error(`Skill「${selected.name}」已不可用，请重新选择`);
                return `【完整 Skill ${index + 1}：${skill.name}】\n${skill.content}`;
            })
            .join("\n\n");
    };

    const startCanvas = (text: string, assets: PendingAgentAsset[]) => {
        if (!canvasHydrated) return void message.info("画布数据正在加载，请稍后再试");
        const titles = new Set(useCanvasStore.getState().projects.map(({ title }) => title));
        let title = "无限画布";
        for (let i = 1; titles.has(title); i++) title = `无限画布 ${i}`;
        router.push(`/canvas/${createProject(title, { agentConfig, pendingAgentRequest: { prompt: text, assets, skills: selectedSkills } })}`);
    };

    const submit = async (nextPrompt = prompt, referenceIds = pendingAssets.map((asset) => asset.nodeId)) => {
        const text = nextPrompt.trim();
        if (!text || abortRef.current) return;
        const assets = pendingAssets.filter((asset) => referenceIds.includes(asset.nodeId));
        if (mode === "canvas") {
            startCanvas(text, assets);
            return;
        }

        const config = {
            ...effectiveConfig,
            model: effectiveConfig.textModel || effectiveConfig.model,
            apiMode: agentConfig.textApiMode,
            textReasoningEnabled: agentConfig.textReasoningEnabled === true,
            activeChannelId: effectiveConfig.textChannelId || effectiveConfig.activeChannelId,
            textChannelId: effectiveConfig.textChannelId,
        };
        if (!isAiConfigReady(config, config.model)) {
            message.warning("请先在设置中配置文本模型和渠道");
            openConfigDialog(false);
            return;
        }
        let skillPrompt = "";
        try {
            skillPrompt = await loadSkillPrompt(selectedSkills);
        } catch (error) {
            return void message.error(error instanceof Error ? error.message : "Skill 加载失败");
        }

        const sessionId = session ? session.id : createSession(text.slice(0, 24));
        const history = useAgentChatStore.getState().sessions.find((item) => item.id === sessionId);
        const references = assets.map((asset) => asset.reference);
        const userMessage: AgentChatMessage = { id: nanoid(), role: "user", text, references, skills: selectedSkills };
        const assistantId = nanoid();
        const patchAssistant = (patch: (current: AgentChatMessage) => AgentChatMessage) =>
            updateSession(sessionId, (current) => ({ ...current, messages: current.messages.map((item) => (item.id === assistantId ? patch(item) : item)) }));
        updateSession(sessionId, (current) => ({ ...current, messages: [...current.messages, userMessage, { id: assistantId, role: "assistant", text: "", status: "running", steps: [], media: [], startedAt: Date.now() }] }));
        setPrompt("");
        setPendingAssets([]);
        setSelectedSkills([]);

        const controller = new AbortController();
        abortRef.current = controller;
        setRunning(true);
        try {
            const textReferences = references.filter((reference) => reference.text).map((reference) => `\n\n【${reference.label || reference.title}】\n${reference.text}`).join("");
            const result = await runAgentChat({
                sessionId,
                config,
                mediaConfig: { ...effectiveConfig, quality: agentConfig.imageQuality, size: agentConfig.imageSize, vquality: agentConfig.videoQuality, videoSize: agentConfig.videoSize },
                protocolMessages: history?.protocolMessages || [],
                userText: text + textReferences,
                sources: collectSources([...(history?.messages || []), userMessage]),
                turnSourceIds: references.map((reference) => reference.id),
                skillPrompt,
                signal: controller.signal,
                onStep: (step) => patchAssistant((current) => ({ ...current, steps: upsert<AgentChatStep>(current.steps, { ...step, startedAt: current.steps?.find((item) => item.id === step.id)?.startedAt || Date.now(), endedAt: step.status === "running" ? undefined : Date.now() }) })),
                onMedia: (media) => patchAssistant((current) => ({ ...current, media: upsert(current.media, media) })),
            });
            updateSession(sessionId, (current) => ({
                ...current,
                protocolMessages: result.protocolMessages,
                messages: current.messages.map((item) => (item.id === assistantId ? { ...item, text: result.reply, status: "success", endedAt: Date.now() } : item)),
            }));
        } catch (error) {
            const stopped = controller.signal.aborted;
            patchAssistant((current) => ({
                ...current,
                text: stopped ? current.text || "已停止。" : `出错了：${error instanceof Error ? error.message : "请求失败"}`,
                status: stopped ? "success" : "error",
                endedAt: Date.now(),
                steps: current.steps?.map((step) => (step.status === "running" ? { ...step, status: "error", endedAt: Date.now() } : step)),
            }));
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    };

    const reuseMedia = (payload: InsertAssetPayload, toCanvas: boolean) => {
        addPendingAsset(payload);
        if (toCanvas) {
            setMode("canvas");
            message.info("已放入输入框，描述下一步后会在新画布中继续");
        }
    };

    const composer = (
        <div className="w-full">
            <div className="mb-2 flex items-center justify-between gap-3 px-2">
                <Segmented size="small" value={mode} onChange={(value) => setMode(value as "chat" | "canvas")} options={[{ label: "对话", value: "chat" }, { label: "画布", value: "canvas" }]} />
                <span className="truncate text-xs text-foreground/45">{mode === "chat" ? "生成结果直接显示在对话里" : "新建画布，由 Agent 编排节点"}</span>
            </div>
            <CanvasAssistantComposer
                prompt={prompt}
                isRunning={running}
                references={pendingAssets.map((asset) => asset.reference)}
                selectedSkills={selectedSkills}
                agentConfig={agentConfig}
                onAgentConfigChange={(patch) => setAgentConfig((current) => ({ ...current, ...patch }))}
                onPromptChange={setPrompt}
                onReferenceIdsChange={(ids) => setPendingAssets((current) => current.filter((asset) => ids.includes(asset.nodeId)))}
                onSkillSelect={selectSkill}
                onSkillRemove={(id, source) => setSelectedSkills((current) => current.filter((skill) => skill.id !== id || skill.source !== source))}
                onSubmit={submit}
                onStop={() => abortRef.current?.abort()}
                onOpenUpload={() => uploadInputRef.current?.click()}
                onOpenAssets={() => setAssetPickerOpen(true)}
                onPasteImage={(file) => void uploadFile(file)}
            />
            <p className="mt-2 text-center text-[11px] text-foreground/35">Agent 可能会犯错，请核查重要信息和生成内容 · Enter 发送，Shift + Enter 换行</p>
        </div>
    );

    return (
        <main className="relative flex h-full flex-col overflow-hidden text-foreground">
            {messages.length ? (
                <>
                    <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
                        <div className="mx-auto w-full max-w-[860px] space-y-8 px-4 py-8 sm:px-6">
                            {messages.map((item) =>
                                item.role === "user" ? (
                                    <UserMessage key={item.id} message={item} />
                                ) : (
                                    <div key={item.id} className="space-y-3">
                                        <AssistantMeta message={item} />
                                        {item.media?.length ? (
                                            <div className={cn("grid gap-3", item.media.length > 1 ? "grid-cols-2" : "max-w-[440px] grid-cols-1")}>
                                                {item.media.map((media) => <AgentMediaView key={media.id} media={media} onUse={reuseMedia} />)}
                                            </div>
                                        ) : null}
                                        {item.text ? (
                                            <div className={cn("text-[15px] leading-relaxed", item.status === "error" && "text-destructive")}>
                                                <AssistantMarkdown components={ASSISTANT_MARKDOWN_COMPONENTS}>{item.text}</AssistantMarkdown>
                                            </div>
                                        ) : null}
                                        {item.text && item.status !== "running" ? (
                                            <button type="button" className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-foreground/40 transition hover:bg-foreground/5 hover:text-foreground" onClick={() => copyText(item.text)}>
                                                <Copy className="size-3.5" />
                                                复制
                                            </button>
                                        ) : null}
                                    </div>
                                ),
                            )}
                        </div>
                    </div>
                    <div className="mx-auto w-full max-w-[860px] shrink-0 px-4 pb-4 sm:px-6">{composer}</div>
                </>
            ) : (
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
                    <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">你好，想创作点什么？</h1>
                    <p className="mt-3 text-center text-sm text-foreground/50">聊天、写作、生图改图、生成视频和语音，都可以直接告诉我</p>
                    <div className="mt-10 w-full max-w-[820px]">{composer}</div>
                    <div className="mt-6 flex max-w-[820px] flex-wrap justify-center gap-2">
                        {SUGGESTIONS.map((suggestion) => (
                            <button key={suggestion} type="button" className="rounded-full border border-border/60 bg-card/70 px-4 py-2 text-xs text-foreground/65 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:bg-card hover:text-foreground" onClick={() => setPrompt(suggestion)}>
                                {suggestion}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*" onChange={onUploadInputChange} />
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                onInsert={(payload) => {
                    addPendingAsset(payload);
                    setAssetPickerOpen(false);
                }}
                onClose={() => setAssetPickerOpen(false)}
            />
        </main>
    );
}

function UserMessage({ message }: { message: AgentChatMessage }) {
    return (
        <div className="flex flex-col items-end gap-2">
            {message.references?.length ? (
                <div className="flex flex-wrap justify-end gap-2">
                    {message.references.map((reference) => <ReferenceThumb key={reference.id} reference={reference} />)}
                </div>
            ) : null}
            <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-card px-4 py-2.5 text-[15px] leading-relaxed shadow-[0_1px_3px_rgba(0,0,0,0.06)]">{message.text}</div>
            {message.skills?.length ? <div className="text-xs text-foreground/40">Skill：{message.skills.map((skill) => skill.name).join("、")}</div> : null}
        </div>
    );
}

function ReferenceThumb({ reference }: { reference: CanvasAssistantReference }) {
    const isImage = reference.type === CanvasNodeType.Image;
    const src = useResolvedUrl("image", isImage ? reference.dataUrl : undefined, isImage ? reference.storageKey : undefined);
    if (isImage && src) return <img src={src} alt={reference.title} className="size-16 rounded-xl object-cover shadow-[0_1px_3px_rgba(0,0,0,0.08)]" />;
    return <span className="rounded-full bg-card px-3 py-1 text-xs text-foreground/60 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">{reference.label || reference.title}</span>;
}

function AssistantMeta({ message }: { message: AgentChatMessage }) {
    const [now, setNow] = useState(() => Date.now());
    const running = message.status === "running";
    useEffect(() => {
        if (!running) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [running]);
    const seconds = message.startedAt ? Math.max(1, Math.round(((running ? now : message.endedAt || now) - message.startedAt) / 1000)) : 0;
    const steps = message.steps || [];

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-foreground/45">
                {running ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
                <span>{running ? `${steps.at(-1)?.label || "处理中"} · ${seconds} 秒` : `已处理 ${seconds} 秒`}</span>
            </div>
            {steps.length ? (
                <details className="group rounded-2xl border border-border/50 bg-card/60 px-4 py-2.5">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-foreground/70">
                        <ChevronRight className="size-3.5 transition group-open:rotate-90" />
                        执行轨迹
                        <span className="font-normal text-foreground/40">{steps.length} 条记录</span>
                    </summary>
                    <ol className="mt-2 space-y-1.5 pl-5">
                        {steps.map((step) => (
                            <li key={step.id} className="flex items-center gap-2 text-xs text-foreground/60">
                                {step.status === "running" ? <LoaderCircle className="size-3 animate-spin" /> : step.status === "error" ? <X className="size-3 text-destructive" /> : <Check className="size-3 text-emerald-500" />}
                                <span>{step.label}</span>
                                {step.endedAt ? <span className="text-foreground/35">{Math.max(1, Math.round((step.endedAt - step.startedAt) / 1000))} 秒</span> : null}
                            </li>
                        ))}
                    </ol>
                </details>
            ) : null}
        </div>
    );
}

function AgentMediaView({ media, onUse }: { media: AgentChatMedia; onUse: (payload: InsertAssetPayload, toCanvas: boolean) => void }) {
    const { message } = App.useApp();
    const addAsset = useAssetStore((state) => state.addAsset);
    const src = useResolvedUrl(media.kind, media.url, media.storageKey);
    const title = media.prompt.slice(0, 30) || `Agent ${MEDIA_LABEL[media.kind]}`;

    if (media.status === "running") {
        return media.kind === "image" ? (
            <ImageGenerationPending className="aspect-square w-full rounded-2xl" label="正在生成图片" />
        ) : (
            <div className="flex h-28 items-center justify-center gap-2 rounded-2xl bg-card/70 text-xs text-foreground/50">
                <LoaderCircle className="size-4 animate-spin" />
                正在生成{MEDIA_LABEL[media.kind]}
            </div>
        );
    }
    if (media.status === "error") return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{MEDIA_LABEL[media.kind]}生成失败：{media.error || "未知错误"}</div>;

    const common = { title, storageKey: media.storageKey, mimeType: media.mimeType };
    const payload: InsertAssetPayload = media.kind === "image" ? { kind: "image", dataUrl: src, ...common } : media.kind === "video" ? { kind: "video", url: src, ...common } : { kind: "audio", url: src, ...common };
    const saveAsset = () => {
        const base = { title, coverUrl: media.kind === "image" ? src : "", tags: ["Agent"], source: "agent" };
        if (media.kind === "image") addAsset({ ...base, kind: "image", data: { dataUrl: src, storageKey: media.storageKey, width: 0, height: 0, bytes: 0, mimeType: media.mimeType || "image/png" } });
        else if (media.kind === "video") addAsset({ ...base, kind: "video", data: { url: src, storageKey: media.storageKey, width: 0, height: 0, bytes: 0, mimeType: media.mimeType || "video/mp4" } });
        else addAsset({ ...base, kind: "audio", data: { url: src, storageKey: media.storageKey, mimeType: media.mimeType || "audio/mpeg" } });
        message.success("已存入我的素材");
    };
    const actions = [
        { label: "引用到输入框", icon: MessageSquare, onClick: () => onUse(payload, false) },
        { label: "发到画布继续", icon: Maximize2, onClick: () => onUse(payload, true) },
        { label: "存入我的素材", icon: FolderPlus, onClick: saveAsset },
    ];

    return (
        <div className="group overflow-hidden rounded-2xl border border-border/40 bg-card shadow-[0_12px_32px_-16px_rgba(15,23,42,0.18)]">
            {media.kind === "image" ? <img src={src} alt={media.prompt} className="block w-full object-cover" /> : media.kind === "video" ? <video src={src} controls className="block w-full" /> : <audio src={src} controls className="block w-full p-2" />}
            <div className="flex items-center gap-1 px-2 py-1.5 opacity-60 transition group-hover:opacity-100">
                {actions.map(({ label, icon: Icon, onClick }) => (
                    <Tooltip key={label} title={label}>
                        <button type="button" className="inline-flex size-7 items-center justify-center rounded-lg text-foreground/60 transition hover:bg-foreground/5 hover:text-foreground" onClick={onClick} aria-label={label}>
                            <Icon className="size-3.5" />
                        </button>
                    </Tooltip>
                ))}
                <Tooltip title="下载">
                    <a href={src} download target="_blank" rel="noreferrer" className="inline-flex size-7 items-center justify-center rounded-lg text-foreground/60 transition hover:bg-foreground/5 hover:text-foreground" aria-label="下载">
                        <Download className="size-3.5" />
                    </a>
                </Tooltip>
            </div>
        </div>
    );
}
