"use client";

import { ArrowRight, History } from "lucide-react";
import Link from "next/link";

import { useCanvasStore } from "./canvas/stores/use-canvas-store";

function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return new Date(iso).toLocaleDateString("zh-CN");
}

export function HomeRecentProjects() {
    const projects = useCanvasStore((state) => state.projects);
    const recent = [...projects]
        .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
        .slice(0, 4);

    if (recent.length === 0) return null;

    return (
        <section className="mx-auto mb-24 w-full max-w-[1400px]">
            <div className="mb-8 flex items-end justify-between">
                <div>
                    <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-medium tracking-[0.24em] uppercase text-foreground/45">
                        <History className="size-3.5" />
                        ARCHIVE // RECENT CANVASES
                    </div>
                    <h2 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                        近期创作归档
                    </h2>
                </div>
                <Link
                    href="/canvas"
                    className="group flex items-center gap-1.5 font-mono text-xs tracking-wider uppercase text-foreground/50 transition hover:text-foreground"
                >
                    全部工程
                    <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </Link>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
                {recent.map((project) => {
                    const nodeCount = project.nodes.length;
                    return (
                        <Link
                            key={project.id}
                            href={`/canvas/${project.id}`}
                            className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 text-foreground shadow-[0_4px_16px_-4px_rgba(0,0,0,0.05)] transition duration-300 hover:-translate-y-1 hover:border-foreground/20 hover:shadow-[0_16px_32px_-8px_rgba(0,0,0,0.12)] dark:border-white/[0.08] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_12px_28px_-8px_rgba(0,0,0,0.6)] dark:hover:border-white/20"
                        >
                            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current/20 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                            <div className="flex items-start justify-between gap-2">
                                <h3 className="line-clamp-2 text-[15px] font-medium tracking-tight">{project.title || "未命名画布"}</h3>
                                <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-foreground/5 text-foreground/60 transition duration-300 group-hover:border-foreground/20 group-hover:bg-foreground group-hover:text-background dark:border-white/10">
                                    <ArrowRight className="size-3.5" />
                                </span>
                            </div>
                            <div className="mt-8 flex items-center gap-2 font-mono text-[11px] text-foreground/45">
                                <span>{nodeCount.toString().padStart(2, "0")} NODES</span>
                                <span className="size-0.5 rounded-full bg-foreground/30" />
                                <span>{formatRelativeTime(project.updatedAt)}</span>
                            </div>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
