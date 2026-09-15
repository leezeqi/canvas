"use client";

import { useMemo, type ReactNode } from "react";
import { ArrowUp, Brain, FolderOpen, ImageIcon, Menu, Square, Upload, Video } from "lucide-react";
import { Button, Dropdown } from "antd";
import { cn } from "@/lib/utils";

import { canvasThemes } from "@/lib/canvas-theme";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasAgentConfig, type CanvasAgentSkillSelection, type CanvasAssistantReference } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasAgentSkillPopover } from "./canvas-agent-skill-popover";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptChipInput } from "./canvas-prompt-chip-input";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";

export type CanvasAssistantComposerProps = {
    prompt: string;
    isRunning: boolean;
    codexControls?: ReactNode;
    references: CanvasAssistantReference[];
    availableReferences?: CanvasResourceReference[];
    pendingReferences?: CanvasResourceReference[];
    selectedSkills?: CanvasAgentSkillSelection[];
    agentConfig: CanvasAgentConfig;
    onAgentConfigChange: (patch: Partial<CanvasAgentConfig>) => void;
    onPromptChange: (prompt: string) => void;
    onReferenceIdsChange: (ids: string[]) => void;
    onSkillSelect?: (skill: CanvasAgentSkillSelection) => void;
    onSkillRemove?: (id: string, source: CanvasAgentSkillSelection["source"]) => void;
    onSubmit: (prompt?: string, referenceIds?: string[]) => void | Promise<void>;
    onStop?: () => void;
    onOpenUpload: () => void;
    onOpenAssets: () => void;
    onPasteImage: (file: File) => void;
};

export function CanvasAssistantComposer({
    prompt,
    isRunning,
    codexControls,
    references,
    availableReferences,
    pendingReferences,
    selectedSkills,
    agentConfig,
    onAgentConfigChange,
    onPromptChange,
    onReferenceIdsChange,
    onSkillSelect,
    onSkillRemove,
    onSubmit,
    onStop,
    onOpenUpload,
    onOpenAssets,
    onPasteImage,
}: CanvasAssistantComposerProps) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const effectiveConfig = useEffectiveConfig();
    const reasoningEnabled = agentConfig.textReasoningEnabled === true;
    const imageConfig = useMemo(() => ({ ...effectiveConfig, quality: agentConfig.imageQuality, size: agentConfig.imageSize }), [agentConfig.imageQuality, agentConfig.imageSize, effectiveConfig]);
    const videoConfig = useMemo(() => ({ ...effectiveConfig, vquality: agentConfig.videoQuality, size: agentConfig.videoSize }), [agentConfig.videoQuality, agentConfig.videoSize, effectiveConfig]);
    const promptReferences = useMemo(() => {
        const seen = new Set<string>();
        return [...(availableReferences || []), ...references.map(assistantToPromptReference)].filter((reference) => {
            if (seen.has(reference.nodeId)) return false;
            seen.add(reference.nodeId);
            return true;
        });
    }, [availableReferences, references]);
    const submit = (nextPrompt = prompt, referenceIds = references.map((reference) => reference.id)) => onSubmit(nextPrompt, referenceIds);

    return (
        <div className="w-full px-1" onWheelCapture={(event) => event.stopPropagation()}>
            <div
                className={cn(
                    "relative group/composer rounded-[24px] border p-4 backdrop-blur-2xl transition-all duration-300",
                    colorTheme === "dark"
                        ? "bg-[#0d0e13]/90 border-white/[0.09] shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7),inset_0_1px_0_0_rgba(255,255,255,0.09)] focus-within:border-white/20 focus-within:shadow-[0_28px_72px_-16px_rgba(0,0,0,0.85)]"
                        : "bg-white/95 border-black/[0.08] shadow-[0_20px_50px_-15px_rgba(0,0,0,0.06),0_2px_8px_rgba(0,0,0,0.02)] ring-1 ring-black/[0.03] focus-within:border-black/20 focus-within:shadow-[0_24px_56px_-12px_rgba(0,0,0,0.09)]"
                )}
            >
                <CanvasPromptChipInput
                    value={prompt}
                    references={promptReferences}
                    pendingReferences={pendingReferences}
                    skills={selectedSkills}
                    onSkillRemove={onSkillRemove}
                    onChange={onPromptChange}
                    onReferenceIdsChange={onReferenceIdsChange}
                    onPasteImage={onPasteImage}
                    onSubmit={submit}
                    className="thin-scrollbar min-h-[96px] max-h-[260px] w-full px-1 py-1 text-[15px] leading-relaxed selection:bg-foreground selection:text-background"
                    style={{ color: theme.node.text }}
                    placeholder="输入构思意图、镜头调度指令，或拖拽装载参考素材..."
                    placeholderClassName="!left-1 !top-1 text-foreground/40 text-[14px]"
                />
                <div className="canvas-composer-tools @container mt-3 flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 flex-wrap">
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "upload", icon: <Upload className="size-4" />, label: "上传素材文件" },
                                    { key: "assets", icon: <FolderOpen className="size-4" />, label: "打开资产库" },
                                ],
                                onClick: ({ key }) => (key === "upload" ? onOpenUpload() : onOpenAssets()),
                            }}
                        >
                            <Button
                                type="text"
                                className="!h-8.5 !w-8.5 !min-w-8.5 !rounded-full !border !border-border/60 !bg-foreground/[0.03] hover:!bg-foreground/[0.08] hover:!border-foreground/20"
                                style={{ color: theme.node.text }}
                                icon={<Menu className="size-4" />}
                                aria-label="添加素材"
                            />
                        </Dropdown>
                        {onSkillSelect && onSkillRemove ? <CanvasAgentSkillPopover selectedSkills={selectedSkills} onSelect={onSkillSelect} onDeleteSelected={onSkillRemove} /> : null}
                        {codexControls}
                        <CanvasImageSettingsPopover
                            config={imageConfig}
                            placement="topLeft"
                            showCount={false}
                            buttonIcon={<ImageIcon className="size-3.5" />}
                            buttonClassName="canvas-composer-icon !h-8.5 !max-w-[124px] !justify-start !rounded-full !px-3 !border !border-border/60 !bg-foreground/[0.03] hover:!bg-foreground/[0.08] !text-xs font-mono"
                            onConfigChange={(key, value) => {
                                if (key === "quality") onAgentConfigChange({ imageQuality: value });
                                else if (key === "size") onAgentConfigChange({ imageSize: value });
                            }}
                        />
                        <CanvasVideoSettingsPopover
                            config={videoConfig}
                            placement="topLeft"
                            visualOnly
                            buttonIcon={<Video className="size-3.5" />}
                            buttonClassName="canvas-composer-icon !h-8.5 !max-w-[128px] !justify-start !rounded-full !px-3 !border !border-border/60 !bg-foreground/[0.03] hover:!bg-foreground/[0.08] !text-xs font-mono"
                            onConfigChange={(key, value) => {
                                if (key === "vquality") onAgentConfigChange({ videoQuality: value });
                                else if (key === "size") onAgentConfigChange({ videoSize: value });
                            }}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                        {!codexControls ? (
                            <Button
                                type="text"
                                className={cn(
                                    "!h-8.5 !w-8.5 !min-w-8.5 !rounded-full !border !border-border/60 !transition-colors",
                                    reasoningEnabled ? "!bg-foreground !text-background !border-foreground" : "!bg-foreground/[0.03] hover:!bg-foreground/[0.08]"
                                )}
                                style={{ color: reasoningEnabled ? undefined : theme.node.text }}
                                icon={<Brain className="size-4" />}
                                title={reasoningEnabled ? "深度思考已开启" : "深度思考已关闭"}
                                aria-label={reasoningEnabled ? "关闭思考" : "开启思考"}
                                aria-pressed={reasoningEnabled}
                                onClick={() => onAgentConfigChange({ textReasoningEnabled: !reasoningEnabled })}
                            />
                        ) : null}
                        <Button
                            type="primary"
                            className="!size-8.5 !min-w-8.5 !rounded-full !border-0 !bg-foreground !text-background hover:!opacity-90 active:!scale-95 transition-all shadow-[0_4px_14px_-2px_rgba(0,0,0,0.25)] dark:shadow-[0_0_16px_rgba(255,255,255,0.15)] disabled:!opacity-30 disabled:!bg-foreground"
                            disabled={!isRunning && !prompt.trim()}
                            onClick={() => (isRunning ? onStop?.() : void submit())}
                            aria-label={isRunning ? "停止" : "发送"}
                            icon={isRunning ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export function assistantToPromptReference(reference: CanvasAssistantReference): CanvasResourceReference {
    const kind = reference.type === CanvasNodeType.Video ? "video" : reference.type === CanvasNodeType.Audio ? "audio" : reference.type === CanvasNodeType.Text ? "text" : "image";
    return { id: reference.id, nodeId: reference.id, kind, label: reference.label || reference.title, title: reference.title, previewUrl: reference.dataUrl || reference.url, text: reference.text, active: true };
}
