"use client";

import { Drawer } from "antd";
import Link from "next/link";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    return (
        <Drawer title="创作工具" placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-1">
                {navigationTools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            href={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-xl px-3 py-3 text-base transition",
                                active ? "bg-violet-500/12 font-medium text-violet-700 dark:text-violet-300" : "text-slate-600 hover:bg-violet-500/8 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
            </div>
        </Drawer>
    );
}
