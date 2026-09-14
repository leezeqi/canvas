"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { App, Button, Image, Tag } from "antd";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { cn } from "@/lib/utils";
import { uploadAssetMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { AssetPickerModal } from "./canvas/components/asset-picker-modal";
import { CanvasAssistantComposer } from "./canvas/components/canvas-assistant-composer";
import { useCanvasStore } from "./canvas/stores/use-canvas-store";
import { canvasResourceLabel } from "./canvas/utils/canvas-resource-references";
import { HomeBannerCarousel, type HomeBanner } from "./home-banner-carousel";
import {
    MAX_CANVAS_AGENT_SKILLS,
    CanvasNodeType,
    type CanvasAgentConfig,
    type CanvasAgentSkillSelection,
    type CanvasAssistantReference,
    type InsertAssetPayload,
    type PendingAgentAsset,
} from "./canvas/types";


const HOME_BANNERS: HomeBanner[] = [
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.5/img/infinite-canvas/3ddirectortl.webp", videoUrl: "", linkUrl: "", alt: "3" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webp", videoUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webm", linkUrl: "", alt: "4" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/panorama.webp", videoUrl: "", linkUrl: "", alt: "5" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/3ddirector.webp", videoUrl: "", linkUrl: "", alt: "6" },
];

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

export default function IndexPage() {
    const { message } = App.useApp();
    const router = useRouter();
    const effectiveConfig = useEffectiveConfig();
    const createProject = useCanvasStore((state) => state.createProject);
    const hydrated = useCanvasStore((state) => state.hydrated);
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [pendingAssets, setPendingAssets] = useState<PendingAgentAsset[]>([]);
    const [selectedSkills, setSelectedSkills] = useState<CanvasAgentSkillSelection[]>([]);
    const [assetPickerOpen, setAssetPickerOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [agentConfig, setAgentConfig] = useState<CanvasAgentConfig>(() => ({
        textApiMode: "chat",
        autoGenerateMedia: false,
        imageQuality: effectiveConfig.quality,
        imageSize: effectiveConfig.size,
        videoQuality: effectiveConfig.vquality,
        videoSize: effectiveConfig.videoSize,
    }));
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const pendingAssetCountsRef = useRef<Record<InsertAssetPayload["kind"], number>>({ text: 0, image: 0, video: 0, audio: 0 });

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    const addPendingAsset = (payload: InsertAssetPayload) => {
        const asset = toPendingAgentAsset(payload, canvasResourceLabel(payload.kind, pendingAssetCountsRef.current[payload.kind]++));
        setPendingAssets((current) => [...current, asset]);
        setPrompt((current) => `${current}${current.endsWith(" ") ? "" : " "}${asset.reference.label} `);
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

    const submit = (nextPrompt = prompt, referenceIds = pendingAssets.map((asset) => asset.nodeId)) => {
        const text = nextPrompt.trim();
        if (!text || submitting) return;
        if (!hydrated) {
            message.info("画布数据正在加载，请稍后再试");
            return;
        }
        setSubmitting(true);
        const titles = new Set(useCanvasStore.getState().projects.map(({ title }) => title));
        let title = "无限画布";
        for (let i = 1; titles.has(title); i++) title = `无限画布 ${i}`;
        const projectId = createProject(title, {
            agentConfig,
            pendingAgentRequest: { prompt: text, assets: pendingAssets.filter((asset) => referenceIds.includes(asset.nodeId)), skills: selectedSkills },
        });
        router.push(`/canvas/${projectId}`);
    };

    const selectSkill = (skill: CanvasAgentSkillSelection) => {
        const existingIndex = selectedSkills.findIndex((selected) => selected.id === skill.id && selected.source === skill.source);
        if (existingIndex >= 0) return setSelectedSkills(selectedSkills.map((selected, index) => index === existingIndex ? skill : selected));
        if (selectedSkills.length >= MAX_CANVAS_AGENT_SKILLS) return void message.warning(`最多选择 ${MAX_CANVAS_AGENT_SKILLS} 个 Skill`);
        setSelectedSkills([...selectedSkills, skill]);
    };

    return (
        <main className="relative h-full overflow-x-hidden overflow-y-auto bg-transparent text-foreground">
            <section className="relative mx-auto max-w-7xl px-4 sm:px-6 md:px-24 xl:px-6">
                <section className="relative flex flex-col items-center py-8 sm:py-10 lg:py-12">
                    <div className="mx-auto max-w-3xl text-center">
                        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-white/55 px-3 py-1.5 text-xs font-medium text-violet-700 shadow-[0_10px_30px_rgba(124,58,237,.10)] backdrop-blur-xl dark:bg-white/5 dark:text-violet-200">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                            </span>
                            AI 创意工作台
                        </div>
                        <h1 className="text-[3.5rem] font-black leading-[1.05]">
                            <span className="aurora-title">无限画布</span>
                            <span className="mt-2 block text-[.55em] font-semibold text-slate-600 dark:text-slate-300">让创意自由无界</span>
                        </h1>
                        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-500 sm:text-base dark:text-slate-400">
                            从一个念头出发，抵达完整作品。
                        </p>
                    </div>

                    <div className="aurora-composer relative z-10 mt-8 min-w-0 w-full max-w-[860px] rounded-2xl">
                        <CanvasAssistantComposer
                            prompt={prompt}
                            isRunning={false}
                            references={pendingAssets.map((asset) => asset.reference)}
                            selectedSkills={selectedSkills}
                            agentConfig={agentConfig}
                            onAgentConfigChange={(patch) => setAgentConfig((current) => ({ ...current, ...patch }))}
                            onPromptChange={setPrompt}
                            onReferenceIdsChange={(ids) => setPendingAssets((current) => current.filter((asset) => ids.includes(asset.nodeId)))}
                            onSkillSelect={selectSkill}
                            onSkillRemove={(id, source) => setSelectedSkills((current) => current.filter((skill) => skill.id !== id || skill.source !== source))}
                            onSubmit={submit}
                            onOpenUpload={() => uploadInputRef.current?.click()}
                            onOpenAssets={() => setAssetPickerOpen(true)}
                            onPasteImage={(file) => void uploadFile(file)}
                        />
                    </div>
                    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*" onChange={onUploadInputChange} />

                    <div className="mt-10 w-full sm:mt-12">
                        <HomeBannerCarousel banners={HOME_BANNERS} />
                    </div>
                </section>

                <section className="relative mx-auto mb-20 max-w-6xl border-t border-slate-900/10 pt-12 dark:border-white/10 sm:pt-16">
                    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-2xl">
                            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-violet-600 dark:text-violet-300">
                                <Sparkles className="size-4" />
                                灵感档案
                            </div>
                            <h2 className="text-3xl font-semibold text-slate-950 dark:text-white">沉淀每一次好结果</h2>
                            <p className="mt-3 text-sm leading-7 text-slate-500 sm:text-base dark:text-slate-400">收藏值得复用的表达，让下一次创作从经验开始。</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button href="https://prompts.tdeh.top/" target="_blank">提示词仓库</Button>
                            <Button type="primary" href="/prompts" icon={<ArrowRight className="size-4" />} iconPlacement="end">浏览提示词库</Button>
                        </div>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                    setPreviewIndex(index);
                                    setPreviewOpen(true);
                                }}
                                className={cn(
                                    "group relative cursor-pointer overflow-hidden rounded-lg border border-slate-900/10 bg-white/55 text-left shadow-[0_16px_40px_rgba(31,38,58,.08)] outline-none backdrop-blur-xl transition duration-300 hover:-translate-y-0.5 hover:border-violet-500/35 hover:shadow-[0_22px_54px_rgba(124,58,237,.14)] focus-visible:ring-2 focus-visible:ring-violet-400/70 dark:border-white/10 dark:bg-white/5 dark:shadow-[0_16px_40px_rgba(0,0,0,.28)]",
                                    index === 0 && "md:col-span-2 md:row-span-2",
                                    index === 3 && "md:col-span-2",
                                )}
                            >
                                <img src={item.coverUrl} alt={item.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.04]" />
                                <div className="absolute inset-0 bg-black/0 transition duration-300 group-hover:bg-violet-950/10" />
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 via-slate-950/45 to-transparent p-4 text-white">
                                    <div className="mb-2 flex flex-wrap gap-1.5">
                                        {item.tags.slice(0, 2).map((tag) => (
                                            <Tag key={tag} variant="filled" className="m-0 border-white/10 bg-white/15 text-[11px] text-white backdrop-blur-md">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                    <h3 className="line-clamp-1 text-sm font-medium">{item.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/70">{item.prompt}</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </section>
            </section>
            <AssetPickerModal
                open={assetPickerOpen}
                defaultTab="my-assets"
                onInsert={(payload) => {
                    addPendingAsset(payload);
                    setAssetPickerOpen(false);
                }}
                onClose={() => setAssetPickerOpen(false)}
            />
            <Image.PreviewGroup
                items={promptShowcase.map((item) => ({
                    src: item.coverUrl,
                    alt: item.title,
                }))}
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            />
        </main>
    );
}
