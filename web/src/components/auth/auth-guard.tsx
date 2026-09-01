import { useEffect, useState } from "react";
import { Button } from "antd";
import { RefreshCw } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthLoadingScreen } from "@/components/auth/auth-loading-screen";
import { startAccountSync, stopAccountSync } from "@/services/server-sync";
import { useUserStore } from "@/stores/use-user-store";

export function AuthGuard() {
    const { t } = useTranslation();
    const location = useLocation();
    const user = useUserStore((state) => state.user);
    const status = useUserStore((state) => state.status);
    const restoreSession = useUserStore((state) => state.restoreSession);
    const [syncStatus, setSyncStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
    const [syncError, setSyncError] = useState<unknown>(null);

    useEffect(() => {
        if (status === "idle") void restoreSession().catch(() => undefined);
    }, [restoreSession, status]);

    useEffect(() => {
        if (status !== "authenticated" || !user) {
            setSyncStatus("idle");
            setSyncError(null);
            return;
        }
        let cancelled = false;
        setSyncStatus("loading");
        setSyncError(null);
        void startAccountSync(user)
            .then(() => {
                if (!cancelled) setSyncStatus("ready");
            })
            .catch((error) => {
                if (!cancelled) {
                    setSyncError(error);
                    setSyncStatus("error");
                }
            });
        return () => {
            cancelled = true;
            void stopAccountSync();
        };
    }, [status, user]);

    if (status === "idle" || status === "loading") return <AuthLoadingScreen />;
    if (status === "anonymous") {
        const returnTo = `${location.pathname}${location.search}${location.hash}`;
        return <Navigate to={`/login?${new URLSearchParams({ returnTo })}`} replace />;
    }
    if (status === "error") {
        return (
            <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
                <div className="max-w-sm text-center">
                    <h1 className="text-lg font-semibold">{t("auth.sessionFailed")}</h1>
                    <p className="mt-2 text-sm leading-6 text-stone-500 dark:text-stone-400">{t("auth.sessionFailedDescription")}</p>
                    <Button className="mt-5" icon={<RefreshCw className="size-4" />} onClick={() => void restoreSession(true).catch(() => undefined)}>
                        {t("auth.retry")}
                    </Button>
                </div>
            </div>
        );
    }
    if (status === "authenticated") {
        const retrySync = () => {
            if (!user) return;
            setSyncStatus("loading");
            void startAccountSync(user)
                .then(() => setSyncStatus("ready"))
                .catch((error) => {
                    setSyncError(error);
                    setSyncStatus("error");
                });
        };
        return (
            <>
                <Outlet />
                {syncStatus === "loading" && (
                    <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm" role="status">
                        {t("auth.syncing")}
                    </div>
                )}
                {syncStatus === "error" && (
                    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border border-destructive/30 bg-background/95 px-3 py-2 text-xs text-destructive shadow-sm" role="status">
                        <span>{syncError instanceof Error ? syncError.message : t("auth.syncFailedDescription")}</span>
                        <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={retrySync} aria-label={t("auth.retry")} />
                    </div>
                )}
            </>
        );
    }
    return <Outlet />;
}
