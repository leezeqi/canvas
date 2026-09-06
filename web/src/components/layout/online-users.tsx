import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button, Popover, Spin } from "antd";
import { RefreshCw, UserRound } from "lucide-react";

import { fetchOnlineUsers, heartbeatPresence } from "@/services/api/presence";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function OnlineUsers({ hidden = false }: { hidden?: boolean }) {
    const { t } = useTranslation();
    const [online, setOnline] = useState<number | null>(null);
    const [open, setOpen] = useState(false);
    const usersQuery = useQuery({
        queryKey: ["presence", "users"],
        queryFn: ({ signal }) => fetchOnlineUsers(signal),
        enabled: open && !hidden && online !== null,
        staleTime: 0,
    });

    useEffect(() => {
        let active = true;
        const heartbeat = () =>
            void heartbeatPresence()
                .then((result) => {
                    if (active) setOnline(result.online);
                })
                .catch(() => {
                    if (active) {
                        setOnline(null);
                        setOpen(false);
                    }
                });
        heartbeat();
        const timer = window.setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open]);

    if (hidden || online === null) return null;
    return (
        <Popover
            trigger="click"
            placement="bottomRight"
            arrow={false}
            open={open}
            onOpenChange={setOpen}
            destroyOnHidden
            title={t("topNav.onlineUsersTitle")}
            content={
                <div className="w-60 max-w-[calc(100vw-48px)] whitespace-normal">
                    {usersQuery.isFetching || usersQuery.isPending ? (
                        <div className="grid h-20 place-items-center" aria-label={t("topNav.onlineUsersLoading")}>
                            <Spin size="small" />
                        </div>
                    ) : usersQuery.isError ? (
                        <div className="flex min-h-20 items-center justify-between gap-3">
                            <span className="text-xs opacity-60" role="alert">
                                {t("topNav.onlineUsersFailed")}
                            </span>
                            <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => void usersQuery.refetch()}>
                                {t("common.retry")}
                            </Button>
                        </div>
                    ) : usersQuery.data.users.length ? (
                        <ul className="m-0 max-h-64 list-none overflow-y-auto p-0" aria-label={t("topNav.onlineUsersTitle")}>
                            {usersQuery.data.users.map((label, index) => (
                                <li key={index} className="flex items-center gap-2.5 py-2 text-sm">
                                    <UserRound className="size-4 shrink-0 opacity-50" aria-hidden="true" />
                                    <span className="min-w-0 break-all">{label}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="py-6 text-center text-xs opacity-60">{t("topNav.onlineUsersEmpty")}</div>
                    )}
                </div>
            }
        >
            <button
                type="button"
                className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded px-1.5 text-xs text-stone-500 transition-colors hover:bg-black/5 dark:text-stone-400 dark:hover:bg-white/10"
                aria-label={t("topNav.onlineUsers", { count: online })}
                aria-expanded={open}
            >
                <span className="inline-flex items-center gap-1.5" role="status" aria-live="polite">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    {t("topNav.onlineUsers", { count: online })}
                </span>
            </button>
        </Popover>
    );
}
