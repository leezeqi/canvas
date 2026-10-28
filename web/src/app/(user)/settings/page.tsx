"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";

const TABS = [
    { key: "model", label: "模型渠道", title: "模型与渠道", description: "选择本地直连或云端渠道，为生图、视频、文本、音频分别指定默认模型。" },
    { key: "generation", label: "生成偏好", title: "生成偏好", description: "画布默认张数、再次生成方式、请求开关、音频默认参数和系统提示词。" },
    { key: "storage", label: "存储", title: "存储", description: "把新生成的图片和媒体保存到你自己的 S3/R2 或 WebDAV。" },
    { key: "personal", label: "个性化", title: "界面主题", description: "主题跟随当前浏览器保存。" },
    { key: "about", label: "关于", title: "版本与更新", description: "当前版本和历次更新记录。" },
] as const;

const THEMES = [
    { value: "light", label: "浅色", description: "浅灰渐变背景，适合白天使用", icon: Sun },
    { value: "dark", label: "深色", description: "深色背景，适合夜间使用", icon: Moon },
] as const;

export default function SettingsPage() {
    const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("model");
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const current = TABS.find((item) => item.key === tab) || TABS[0];

    return (
        <main className="relative h-full overflow-hidden text-foreground">
            <div className="thin-scrollbar h-full overflow-y-auto">
                <div className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-8 sm:px-8">
                    <h1 className="text-3xl font-semibold tracking-tight">设置</h1>
                    <section className="mt-6 rounded-[28px] border border-border/50 bg-card/90 p-5 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.16)] sm:p-7">
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold">{current.title}</h2>
                            <p className="mt-1 text-xs text-foreground/50">{current.description}</p>
                        </div>
                        {tab === "model" || tab === "generation" || tab === "storage" ? <AppConfigModal key={tab} section={tab} /> : null}
                        {tab === "personal" ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {THEMES.map(({ value, label, description, icon: Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        className={cn("flex items-center gap-4 rounded-2xl border p-5 text-left transition", theme === value ? "border-foreground bg-foreground text-background" : "border-border/60 hover:border-foreground/30")}
                                        onClick={() => setTheme(value)}
                                    >
                                        <Icon className="size-5 shrink-0" />
                                        <span>
                                            <span className="block text-sm font-medium">{label}</span>
                                            <span className="mt-0.5 block text-xs opacity-60">{description}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : null}
                        {tab === "about" ? (
                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 p-5">
                                <div>
                                    <div className="text-xs text-foreground/50">当前版本</div>
                                    <p className="mt-1 text-sm text-foreground/70">点击右侧版本号查看历次更新记录</p>
                                </div>
                                <VersionReleaseModal className="rounded-full border border-border/60 px-4 py-2 text-sm font-semibold" />
                            </div>
                        ) : null}
                    </section>
                </div>
            </div>
            <nav className="thin-scrollbar absolute bottom-5 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full border border-border/50 bg-card/85 p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.25)] backdrop-blur-xl">
                {TABS.map((item) => (
                    <button
                        key={item.key}
                        type="button"
                        className={cn("shrink-0 rounded-full px-4 py-2 text-xs font-medium transition", item.key === tab ? "bg-foreground text-background shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]" : "text-foreground/60 hover:text-foreground")}
                        onClick={() => setTab(item.key)}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
        </main>
    );
}
