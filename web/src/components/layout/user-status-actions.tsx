import type { CSSProperties } from "react";
import { App, Avatar, Dropdown, Tooltip } from "antd";
import { Keyboard, LogOut, Puzzle, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { HajimiLink } from "@/components/layout/hajimi-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { canvasThemes } from "@/lib/canvas-theme";
import { useConfigStore } from "@/stores/use-config-store";
import { useThemeStore } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";

type UserStatusActionsProps = {
    showConfig?: boolean;
    variant?: "default" | "canvas";
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

export function UserStatusActions({ showConfig = true, variant = "default", onOpenShortcuts, onOpenPlugins }: UserStatusActionsProps) {
    const { message } = App.useApp();
    const { i18n, t } = useTranslation();
    const navigate = useNavigate();
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const user = useUserStore((state) => state.user);
    const logout = useUserStore((state) => state.logout);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const canvasTheme = canvasThemes[theme];
    const naturalIconClass =
        "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-black/5 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white [&_svg]:size-4";
    const iconStyle: CSSProperties | undefined = variant === "canvas" ? { color: canvasTheme.node.text } : undefined;
    const versionStyle = iconStyle;
    const hajimiClassName = "size-7 text-base";
    const hajimiStyle = iconStyle;
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const languageLabel = t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") });
    const userLabel = user?.name?.trim() || user?.email || t("auth.account");
    const userInitial = userLabel.slice(0, 1).toUpperCase();

    const handleLogout = async () => {
        try {
            await logout();
            navigate("/login", { replace: true });
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("auth.logoutFailed"));
        }
    };

    return (
        <div className="inline-flex shrink-0 items-center gap-1">
            {onOpenPlugins ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenPlugins} aria-label={t("topNav.plugins")} title={t("topNav.plugins")}>
                    <Puzzle className="size-4" />
                </button>
            ) : null}
            {showConfig ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={() => openConfigDialog(false)} aria-label={t("navigation.config")} title={t("navigation.config")}>
                    <Settings2 className="size-4" />
                </button>
            ) : null}
            <Tooltip title={languageLabel} mouseEnterDelay={0.2}>
                <button type="button" className={`${naturalIconClass} text-[11px] font-semibold tracking-tight`} style={iconStyle} onClick={() => void changeAppLocale(nextLocale)} aria-label={languageLabel}>
                    {locale === "zh-CN" ? "中" : "EN"}
                </button>
            </Tooltip>
            <AnimatedThemeToggler
                theme={theme}
                onThemeChange={setTheme}
                className={naturalIconClass}
                style={iconStyle}
                aria-label={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
                title={t(theme === "dark" ? "topNav.lightTheme" : "topNav.darkTheme")}
            />
            <VersionReleaseModal style={versionStyle} />
            <HajimiLink className={cn("bg-transparent hover:bg-transparent dark:hover:bg-transparent", hajimiClassName)} style={hajimiStyle} />
            {user ? (
                <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                        items: [
                            {
                                key: "identity",
                                disabled: true,
                                label: (
                                    <div className="min-w-44 py-1">
                                        <div className="truncate text-sm font-medium text-stone-900 dark:text-stone-100">{user.name || user.email}</div>
                                        <div className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{user.email}</div>
                                        <div className="mt-1 text-xs text-stone-400">{t(user.provider === "hajimi" ? "auth.providerHajimi" : "auth.providerEmail")}</div>
                                    </div>
                                ),
                            },
                            { type: "divider" },
                            { key: "logout", icon: <LogOut className="size-4" />, label: t("auth.logout"), onClick: () => void handleLogout() },
                        ],
                    }}
                >
                    <button type="button" className="ml-0.5 grid size-7 shrink-0 place-items-center rounded-full transition hover:opacity-75" aria-label={t("auth.accountMenu")} title={userLabel}>
                        <Avatar
                            size={28}
                            src={user.avatarUrl || undefined}
                            className="!bg-stone-900 !text-xs !text-white dark:!bg-stone-100 dark:!text-stone-900"
                            style={variant === "canvas" ? { border: `1px solid ${canvasTheme.toolbar.border}` } : undefined}
                        >
                            {userInitial}
                        </Avatar>
                    </button>
                </Dropdown>
            ) : null}
            {onOpenShortcuts ? (
                <button type="button" className={naturalIconClass} style={iconStyle} onClick={onOpenShortcuts} aria-label={t("topNav.shortcuts")} title={t("topNav.shortcuts")}>
                    <Keyboard className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
