import { useEffect } from "react";
import { Button } from "antd";
import { RefreshCw } from "lucide-react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthLoadingScreen } from "@/components/auth/auth-loading-screen";
import { useUserStore } from "@/stores/use-user-store";

export function AuthGuard() {
    const { t } = useTranslation();
    const location = useLocation();
    const status = useUserStore((state) => state.status);
    const restoreSession = useUserStore((state) => state.restoreSession);

    useEffect(() => {
        if (status === "idle") void restoreSession().catch(() => undefined);
    }, [restoreSession, status]);

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
    return <Outlet />;
}
