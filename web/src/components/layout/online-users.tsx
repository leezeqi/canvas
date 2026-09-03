import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { heartbeatPresence } from "@/services/api/presence";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function OnlineUsers({ hidden = false }: { hidden?: boolean }) {
    const { t } = useTranslation();
    const [online, setOnline] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        const heartbeat = () =>
            void heartbeatPresence()
                .then((result) => {
                    if (active) setOnline(result.online);
                })
                .catch(() => {
                    if (active) setOnline(null);
                });
        heartbeat();
        const timer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    if (hidden || online === null) return null;
    return (
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400" role="status" aria-live="polite">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
            {t("topNav.onlineUsers", { count: online })}
        </span>
    );
}
