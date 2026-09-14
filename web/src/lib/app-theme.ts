import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#7c3aed",
        primaryHover: "#6d28d9",
        primaryText: "#ffffff",
        background: "#f7f8fc",
        container: "rgba(255, 255, 255, 0.82)",
        elevated: "rgba(255, 255, 255, 0.96)",
        text: "#172033",
        textSecondary: "#667085",
        border: "rgba(45, 55, 72, 0.12)",
        menuBg: "rgba(124, 58, 237, 0.09)",
        menuText: "#6d28d9",
        selectActiveBg: "rgba(124, 58, 237, 0.07)",
        selectSelectedBg: "rgba(124, 58, 237, 0.12)",
        selectText: "#5b21b6",
        tableSelectedBg: "rgba(124, 58, 237, 0.06)",
        tableSelectedHoverBg: "rgba(124, 58, 237, 0.10)",
    },
    dark: {
        primary: "#8b5cf6",
        primaryHover: "#a78bfa",
        primaryText: "#ffffff",
        background: "#02040a",
        container: "rgba(10, 15, 28, 0.82)",
        elevated: "rgba(17, 24, 39, 0.96)",
        text: "#f8fafc",
        textSecondary: "#94a3b8",
        border: "rgba(255, 255, 255, 0.09)",
        menuBg: "rgba(139, 92, 246, 0.14)",
        menuText: "#ddd6fe",
        selectActiveBg: "rgba(139, 92, 246, 0.12)",
        selectSelectedBg: "rgba(139, 92, 246, 0.18)",
        selectText: "#ede9fe",
        tableSelectedBg: "rgba(139, 92, 246, 0.10)",
        tableSelectedHoverBg: "rgba(139, 92, 246, 0.15)",
    },
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 64,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 8 } satisfies CSSProperties,
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgBase: color.background,
            colorBgLayout: color.background,
            colorBgContainer: color.container,
            colorBgElevated: color.elevated,
            colorText: color.text,
            colorTextSecondary: color.textSecondary,
            colorBorder: color.border,
            colorBorderSecondary: color.border,
            borderRadius: 12,
            borderRadiusLG: 16,
            controlHeight: 40,
            boxShadow: dark ? "0 18px 48px rgba(0, 0, 0, 0.34)" : "0 18px 48px rgba(31, 38, 58, 0.12)",
            boxShadowSecondary: dark ? "0 12px 32px rgba(0, 0, 0, 0.28)" : "0 12px 32px rgba(31, 38, 58, 0.10)",
        },
        components: {
            Button: {
                primaryShadow: "none",
                borderRadius: 12,
            },
            Card: {
                borderRadiusLG: 16,
            },
            Drawer: {
                colorBgElevated: color.elevated,
            },
            Modal: {
                contentBg: color.elevated,
                headerBg: "transparent",
            },
            Menu: {
                itemBorderRadius: 12,
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                headerBg: dark ? "rgba(255, 255, 255, 0.035)" : "rgba(124, 58, 237, 0.035)",
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
