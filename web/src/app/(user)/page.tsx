"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { useRouter } from "next/navigation";

import { uploadAssetMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { AssetPickerModal } from "./canvas/components/asset-picker-modal";
import { CanvasAssistantComposer } from "./canvas/components/canvas-assistant-composer";
import { useCanvasStore } from "./canvas/stores/use-canvas-store";
import { canvasResourceLabel } from "./canvas/utils/canvas-resource-references";
import { HomeBannerCarousel, type HomeBanner } from "./home-banner-carousel";
import { HomeRecentProjects } from "./home-recent-projects";
import { InfiniteCanvasSvgBackground } from "@/components/home/infinite-canvas-svg-background";
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
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.5/img/infinite-canvas/3ddirectortl.webp", videoUrl: "", linkUrl: "", alt: "3D导演台与时间轴", title: "3D 导演台 // 镜头轨迹与运镜时间轴", desc: "空间机位走向、画面节奏与全焦段精准调度" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webp", videoUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/agent.webm", linkUrl: "", alt: "序列故事版编排", title: "序列推演 // 多模态节点连续编排", desc: "围绕视觉目标推演完整分镜与连续多模态作品" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/panorama.webp", videoUrl: "", linkUrl: "", alt: "全景环境生成", title: "全景空间 // 360° 穹顶环境构建", desc: "2:1 空间环境贴图生成，直接作为三维场景光照与底景" },
    { imageUrl: "https://gcore.jsdelivr.net/gh/tigerowo/cdn-tdeh@v0.4/img/infinite-canvas/3ddirector.webp", videoUrl: "", linkUrl: "", alt: "空间构图与机位控制", title: "空间机位 // 构图锁定与姿态调度", desc: "角色空间站位、视角焦段与姿态严谨把控" },
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
            {/* Infinite Canvas Living SVG Animated Background */}
            <InfiniteCanvasSvgBackground />

            <div className="relative mx-auto w-full max-w-[1400px] px-4 sm:px-6 md:px-10 xl:px-12">
                {/* Central Creation Stage */}
                <section className="relative flex flex-col items-center pt-12 pb-16 sm:pt-20 sm:pb-24">
                    {/* Studio Precision Eyebrow */}
                    <div className="mb-5 flex items-center gap-2.5 font-mono text-[10px] tracking-[0.24em] uppercase text-foreground/45 select-none">
                        <span className="size-1.5 rounded-full bg-emerald-500/80 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        <span>ATELIER // INFINITE CANVAS · 01</span>
                    </div>
                    
                    {/* The Pure Central Creation Island (Midjourney / Linear Clean) */}
                    <div className="atelier-composer relative z-10 min-w-0 w-full max-w-[840px]">
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
                        <div className="mt-3.5 flex items-center justify-between px-3 font-mono text-[11px] text-foreground/40 select-none">
                            <span>按 Enter 构思推演 · Shift + Enter 换行</span>
                            <span>多模态节点流式编排</span>
                        </div>
                    </div>

                    <input ref={uploadInputRef} hidden type="file" accept="image/*,video/*,audio/*" onChange={onUploadInputChange} />

                    <div className="mt-20 w-full space-y-24">
                        <HomeRecentProjects />
                        <HomeBannerCarousel banners={HOME_BANNERS} />
                    </div>
                </section>
            </div>
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
