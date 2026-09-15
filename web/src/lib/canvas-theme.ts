export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2f4f5",
            dot: "rgba(0,0,0,.12)",
            line: "rgba(0,0,0,.05)",
            selectionStroke: "#000000",
            selectionFill: "rgba(0,0,0,.06)",
        },
        node: {
            label: "#525252",
            fill: "#ffffff",
            panel: "#f8f9fa",
            stroke: "rgba(0,0,0,.14)",
            activeStroke: "#000000",
            placeholder: "#a3a3a3",
            text: "#000000",
            muted: "#787574",
            faint: "#a8a8a8",
        },
        toolbar: {
            panel: "#ffffff",
            border: "rgba(0,0,0,.10)",
            item: "#404040",
            itemHover: "rgba(0,0,0,.05)",
            activeBg: "rgba(0,0,0,.09)",
            activeText: "#000000",
        },
    },
    dark: {
        canvas: {
            background: "#07080a",
            dot: "rgba(255,255,255,.07)",
            line: "rgba(255,255,255,.04)",
            selectionStroke: "#ffffff",
            selectionFill: "rgba(255,255,255,.08)",
        },
        node: {
            label: "#dcdce2",
            fill: "#0d0e13",
            panel: "#121319",
            stroke: "rgba(255,255,255,.08)",
            activeStroke: "#ffffff",
            placeholder: "#636674",
            text: "#f4f4f6",
            muted: "#8c8f9b",
            faint: "#515462",
        },
        toolbar: {
            panel: "#0d0e13",
            border: "rgba(255,255,255,.09)",
            item: "#9b9ea8",
            itemHover: "rgba(255,255,255,.08)",
            activeBg: "rgba(255,255,255,.14)",
            activeText: "#ffffff",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
