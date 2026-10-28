import type { ComponentType } from "react";
import { Bot, Library, Maximize2, Settings2, WandSparkles } from "lucide-react";

export type NavigationTool = { slug: string; label: string; icon: ComponentType<{ className?: string }>; href: string; tabs: Array<{ href: string; label: string }> };

export const navigationTools: NavigationTool[] = [
    { slug: "agent", label: "Agent", icon: Bot, href: "/", tabs: [] },
    { slug: "canvas", label: "我的画布", icon: Maximize2, href: "/canvas", tabs: [] },
    {
        slug: "create",
        label: "创作工具",
        icon: WandSparkles,
        href: "/image",
        tabs: [
            { href: "/image", label: "生图" },
            { href: "/video", label: "视频" },
            { href: "/workflows", label: "工作流" },
        ],
    },
    {
        slug: "library",
        label: "知识库",
        icon: Library,
        href: "/prompts",
        tabs: [
            { href: "/prompts", label: "提示词库" },
            { href: "/assets", label: "我的素材" },
            { href: "/asset-library", label: "素材库" },
        ],
    },
    { slug: "settings", label: "设置", icon: Settings2, href: "/settings", tabs: [] },
];

export function findNavigationTool(pathname: string) {
    if (pathname === "/") return navigationTools[0];
    return navigationTools.find((tool) => tool.href !== "/" && [tool.href, ...tool.tabs.map((tab) => tab.href)].some((href) => pathname === href || pathname.startsWith(`${href}/`)));
}
