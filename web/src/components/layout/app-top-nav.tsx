"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";

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
                <header className="relative sticky top-0 z-40 flex h-14 w-full shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 backdrop-blur-xl sm:px-6 md:px-8">
                    {/* Left: Brand Logo & Title */}
                    <div className="flex items-center min-w-[160px]">
                        <Link href="/" className="group flex items-center gap-2.5 text-foreground">
                            <span className="grid size-7 place-items-center rounded-lg border border-border/60 bg-foreground/5 text-foreground transition-all duration-200 group-hover:border-foreground/30 group-hover:bg-foreground/10">
                                <svg className="size-4" viewBox="0 0 32 32" fill="none">
                                    <path
                                        d="M10.5 11C7.46243 11 5 13.2386 5 16C5 18.7614 7.46243 21 10.5 21C13.0116 21 15.148 19.3404 15.8601 17.0278C15.922 16.8267 16.078 16.8267 16.1399 17.0278C16.852 19.3404 18.9884 21 21.5 21C24.5376 21 27 18.7614 27 16C27 13.2386 24.5376 11 21.5 11C18.9884 11 16.852 12.6596 16.1399 14.9722C16.078 15.1733 15.922 15.1733 15.8601 14.9722C15.148 12.6596 13.0116 11 10.5 11Z"
                                        stroke="currentColor"
                                        strokeWidth="2.2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                            <span className="text-[14px] font-medium tracking-tight text-foreground">无限画布</span>
                        </Link>
                    </div>

                    {/* Center: Centered Navigation Links */}
                    <nav className="absolute left-1/2 -translate-x-1/2 hidden items-center gap-1 md:flex">
                        <Link
                            href="/"
                            className={cn(
                                "relative rounded-md px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors",
                                homeActive
                                    ? "text-foreground font-semibold after:absolute after:inset-x-3.5 after:-bottom-[14px] after:h-[2px] after:bg-foreground"
                                    : "text-foreground/50 hover:text-foreground hover:bg-foreground/5",
                            )}
                        >
                            首页
                        </Link>
                        {navigationTools.map((tool) => {
                            const active = tool.slug === activeToolSlug;
                            return (
                                <Link
                                    key={tool.slug}
                                    href={`/${tool.slug}`}
                                    className={cn(
                                        "relative rounded-md px-3.5 py-1.5 text-xs font-medium tracking-wide transition-colors",
                                        active
                                            ? "text-foreground font-semibold after:absolute after:inset-x-3.5 after:-bottom-[14px] after:h-[2px] after:bg-foreground"
                                            : "text-foreground/50 hover:text-foreground hover:bg-foreground/5",
                                    )}
                                >
                                    {tool.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Right Controls */}
                    <div className="flex items-center gap-2 min-w-[160px] justify-end">
                        <Link
                            href="/canvas"
                            className="hidden items-center rounded-lg border border-border bg-card px-3 py-1 text-xs font-medium text-foreground/80 shadow-[0_1px_3px_rgba(0,0,0,0.05)] transition hover:border-foreground/30 hover:text-foreground sm:inline-flex"
                        >
                            快速创建
                        </Link>
                        <UserStatusActions compact />
                        <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-foreground/70 transition hover:bg-foreground/5 hover:text-foreground md:hidden"
                            onClick={() => setMobileNavOpen(true)}
                            aria-label="打开导航菜单"
                            title="导航菜单"
                        >
                            <Menu className="size-4" />
                        </button>
                    </div>
                </header>
            ) : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
        </>
    );
}
