import type { CSSProperties } from "react";
import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#0a0a0c",
        primaryHover: "#222226",
        primaryText: "#ffffff",
        background: "#f8f8f9",
        container: "#ffffff",
        elevated: "#ffffff",
        text: "#0a0a0c",
        textSecondary: "#73737c",
        border: "rgba(0, 0, 0, 0.08)",
        menuBg: "rgba(0, 0, 0, 0.04)",
        menuText: "#0a0a0c",
        selectActiveBg: "rgba(0, 0, 0, 0.04)",
        selectSelectedBg: "rgba(0, 0, 0, 0.08)",
        selectText: "#0a0a0c",
        tableSelectedBg: "rgba(0, 0, 0, 0.03)",
        tableSelectedHoverBg: "rgba(0, 0, 0, 0.06)",
    },
    dark: {
        primary: "#f4f4f6",
        primaryHover: "#ffffff",
        primaryText: "#07080a",
        background: "#07080a",
        container: "#0d0e13",
        elevated: "#121319",
        text: "#f4f4f6",
        textSecondary: "#8c8f9b",
        border: "rgba(255, 255, 255, 0.08)",
        menuBg: "rgba(255, 255, 255, 0.05)",
        menuText: "#f4f4f6",
        selectActiveBg: "rgba(255, 255, 255, 0.06)",
        selectSelectedBg: "rgba(255, 255, 255, 0.10)",
        selectText: "#ffffff",
        tableSelectedBg: "rgba(255, 255, 255, 0.04)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.08)",
    },
};

export const adminLayoutStyle = {
    siderWidth: 232,
    headerHeight: 56,
    brandHeight: 64,
    menu: { borderInlineEnd: 0, padding: "18px 12px", fontSize: 15 } satisfies CSSProperties,
    menuItem: { height: 44, lineHeight: "44px", marginBlock: 4, borderRadius: 12 } satisfies CSSProperties,
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
            borderRadius: 14,
            borderRadiusLG: 20,
            borderRadiusSM: 10,
            controlHeight: 40,
            boxShadow: "rgba(0, 0, 0, 0.10) 0px 4px 6px -1px, rgba(0, 0, 0, 0.10) 0px 2px 4px -2px",
            boxShadowSecondary: "rgba(0, 0, 0, 0.08) 0px 12px 32px -8px",
            fontFamily:
                '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
            Button: {
                primaryShadow: "rgba(0, 0, 0, 0.22) 0px 4px 14px -2px",
                borderRadius: 9999,
                fontWeight: 500,
            },
            Card: {
                borderRadiusLG: 28,
            },
            Drawer: {
                colorBgElevated: color.elevated,
            },
            Modal: {
                contentBg: color.elevated,
                headerBg: "transparent",
                borderRadiusLG: 28,
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
                headerBg: dark ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)",
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
            Input: {
                activeBorderColor: "#000000",
                hoverBorderColor: "rgba(0, 0, 0, 0.4)",
                activeShadow: "0 0 0 3px rgba(0, 0, 0, 0.08)",
                borderRadius: 14,
            },
            InputNumber: {
                activeBorderColor: "#000000",
                hoverBorderColor: "rgba(0, 0, 0, 0.4)",
                activeShadow: "0 0 0 3px rgba(0, 0, 0, 0.08)",
                borderRadius: 14,
            },
            Segmented: {
                itemSelectedBg: "#ffffff",
                itemSelectedColor: "#000000",
                trackBg: "rgba(0, 0, 0, 0.06)",
                borderRadius: 9999,
                trackPadding: 4,
                itemColor: "#787574",
            },
            Tabs: {
                inkBarColor: color.primary,
                itemSelectedColor: color.primary,
                itemHoverColor: color.primaryHover,
            },
            Tooltip: {
                borderRadius: 10,
            },
        },
    };
}
