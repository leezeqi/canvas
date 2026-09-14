export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f5f7fb",
            dot: "rgba(99,102,241,.22)",
            line: "rgba(79,70,229,.09)",
            selectionStroke: "#7c3aed",
            selectionFill: "rgba(124,58,237,.08)",
        },
        node: {
            label: "#475569",
            fill: "rgba(255,255,255,.88)",
            panel: "rgba(248,250,252,.82)",
            stroke: "rgba(71,85,105,.16)",
            activeStroke: "#7c3aed",
            placeholder: "#94a3b8",
            text: "#172033",
            muted: "#64748b",
            faint: "#a3adc0",
        },
        toolbar: {
            panel: "rgba(255,255,255,.78)",
            border: "rgba(71,85,105,.14)",
            item: "#526078",
            itemHover: "rgba(99,102,241,.09)",
            activeBg: "rgba(124,58,237,.13)",
            activeText: "#6d28d9",
        },
    },
    dark: {
        canvas: {
            background: "#05070d",
            dot: "rgba(165,180,252,.23)",
            line: "rgba(129,140,248,.10)",
            selectionStroke: "#a78bfa",
            selectionFill: "rgba(139,92,246,.13)",
        },
        node: {
            label: "#c4cbe0",
            fill: "rgba(13,18,32,.88)",
            panel: "rgba(10,15,28,.78)",
            stroke: "rgba(255,255,255,.10)",
            activeStroke: "#a78bfa",
            placeholder: "#79849f",
            text: "#f3f5fb",
            muted: "#a3acc2",
            faint: "#626d86",
        },
        toolbar: {
            panel: "rgba(10,15,28,.76)",
            border: "rgba(255,255,255,.10)",
            item: "#bdc5d9",
            itemHover: "rgba(139,92,246,.13)",
            activeBg: "rgba(139,92,246,.22)",
            activeText: "#ddd6fe",
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
