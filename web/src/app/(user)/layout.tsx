"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { AppConfigModal } from "@/components/layout/app-config-modal";
import { AppSideNav } from "@/components/layout/app-side-nav";
import { findNavigationTool } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { fetchUserConfig } from "@/services/api/user-config";
import { useAgentChatStore } from "@/stores/use-agent-chat-store";
import { useUserStore } from "@/stores/use-user-store";

const protectedPrefixes = ["/asset-library"];

export default function UserLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const isReady = useUserStore((state) => state.isReady);
    const wasLoggedOutRef = useRef(false);
    const isProtectedPage = protectedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

    useEffect(() => {
        if (!isReady || !isProtectedPage || user) return;
        router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
    }, [isProtectedPage, isReady, pathname, router, user]);

    useEffect(() => {
        if (!isReady) return;
        if (!user) {
            wasLoggedOutRef.current = true;
            useAgentChatStore.getState().stopAccountSync();
            return;
        }
        const syncCanvasAfterLogin = wasLoggedOutRef.current;
        const token = useUserStore.getState().token;
        if (!token) return;
        wasLoggedOutRef.current = false;
        fetchUserConfig(token).then(async (config) => {
            const syncEnabled = config.syncCapabilities?.userData === true;
            const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
            const canvasStore = useCanvasStore.getState();
            canvasStore.setSyncEnabled(syncEnabled);
            if (
                syncCanvasAfterLogin &&
                syncEnabled &&
                canvasStore.hydrated
            ) {
                void canvasStore.syncWithRemote(token, true);
            }
            const { useAssetStore } = await import("@/stores/use-asset-store");
            void useAssetStore.getState().hydrateAccountAssets(token, syncEnabled);
            if (syncEnabled) void useAgentChatStore.getState().hydrateAccountSessions(token).catch(() => { });
        }).catch(() => { });
    }, [isReady, user]);

    const tabs = /^\/canvas\/[^/]+/.test(pathname) ? [] : findNavigationTool(pathname)?.tabs || [];

    return (
        <div className="aurora-app flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
            <AppSideNav />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {tabs.length ? (
                    <div className="flex shrink-0 justify-center px-4 pt-3">
                        <nav className="inline-flex gap-1 rounded-full border border-border/50 bg-card/80 p-1 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)] backdrop-blur-xl">
                            {tabs.map((tab) => (
                                <Link
                                    key={tab.href}
                                    href={tab.href}
                                    className={cn(
                                        "rounded-full px-4 py-1.5 text-xs font-medium transition",
                                        pathname === tab.href || pathname.startsWith(`${tab.href}/`) ? "!bg-foreground !text-background shadow-[0_4px_12px_-4px_rgba(0,0,0,0.3)]" : "!text-foreground/60 hover:!text-foreground",
                                    )}
                                >
                                    {tab.label}
                                </Link>
                            ))}
                        </nav>
                    </div>
                ) : null}
                <div className="min-h-0 flex-1 overflow-hidden">{isProtectedPage && (!isReady || !user) ? null : children}</div>
            </div>
            <AppConfigModal />
        </div>
    );
}
