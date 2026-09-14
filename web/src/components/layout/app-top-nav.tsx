"use client";

import { House, Menu } from "lucide-react";
import { Tooltip } from "antd";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useState } from "react";

export function AppTopNav() {
    const pathname = usePathname();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const homeActive = pathname === "/";

    return (
        <>
            {!hideHeader ? (
                <>
                    <header className="aurora-glass z-40 flex h-14 shrink-0 items-center justify-between border-b px-4 md:hidden">
                        <Link href="/" className="flex min-w-0 items-center gap-2.5 font-medium text-slate-950 dark:text-white">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white shadow-[0_8px_20px_rgba(124,58,237,.28)]">
                                <span className="size-4 bg-current" style={{ mask: "url(/logo.svg) center / contain no-repeat", WebkitMask: "url(/logo.svg) center / contain no-repeat" }} />
                            </span>
                            <span className="truncate">无限画布</span>
                        </Link>
                        <div className="flex items-center gap-1">
                            <UserStatusActions compact />
                            <button type="button" className="inline-flex size-9 items-center justify-center rounded-xl text-slate-600 transition hover:bg-violet-500/10 hover:text-violet-600 dark:text-slate-300 dark:hover:text-violet-300" onClick={() => setMobileNavOpen(true)} aria-label="打开导航菜单" title="导航菜单">
                                <Menu className="size-5" />
                            </button>
                        </div>
                    </header>

                    <aside className="aurora-glass fixed left-5 top-1/2 z-50 hidden max-h-[calc(100vh-40px)] w-16 -translate-y-1/2 flex-col items-center gap-3 rounded-3xl border px-2 py-3 shadow-[0_24px_70px_rgba(31,38,58,.16)] md:flex dark:shadow-[0_24px_70px_rgba(0,0,0,.42)]">
                        <Tooltip title="首页" placement="right">
                            <Link
                                href="/"
                                className={cn(
                                    "flex size-10 shrink-0 items-center justify-center rounded-xl transition",
                                    homeActive
                                        ? "bg-violet-500/14 text-violet-700 shadow-[inset_0_1px_rgba(255,255,255,.18)] dark:text-violet-300"
                                        : "text-slate-500 hover:bg-violet-500/9 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
                                )}
                                aria-current={homeActive ? "page" : undefined}
                                aria-label="首页"
                            >
                                <House className="size-5" />
                            </Link>
                        </Tooltip>

                        <nav className="flex min-h-0 flex-col items-center gap-1 overflow-y-auto py-1">
                            {navigationTools.map((tool) => {
                                const Icon = tool.icon;
                                const active = tool.slug === activeToolSlug;
                                return (
                                    <Tooltip key={tool.slug} title={tool.label} placement="right">
                                        <Link
                                            href={`/${tool.slug}`}
                                            className={cn(
                                                "flex size-10 shrink-0 items-center justify-center rounded-xl transition",
                                                active
                                                    ? "bg-violet-500/14 text-violet-700 shadow-[inset_0_1px_rgba(255,255,255,.18)] dark:text-violet-300"
                                                    : "text-slate-500 hover:bg-violet-500/9 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white",
                                            )}
                                            aria-current={active ? "page" : undefined}
                                            aria-label={tool.label}
                                        >
                                            <Icon className="size-5" />
                                        </Link>
                                    </Tooltip>
                                );
                            })}
                        </nav>

                        <div className="h-px w-8 shrink-0 bg-slate-900/10 dark:bg-white/10" />
                        <UserStatusActions className="flex-col gap-1" />
                    </aside>
                </>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
