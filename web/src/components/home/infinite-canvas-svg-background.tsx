"use client";

import { useEffect, useState } from "react";

export function InfiniteCanvasSvgBackground() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            {/* Ambient Radial Vignette - Clears the central workspace for crisp contrast */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_35%,transparent_15%,var(--background)_80%)]" />

            {/* Living Infinite Canvas Spatial Vector Streamlines */}
            <svg
                className="absolute inset-0 size-full transition-opacity duration-1000 opacity-35 dark:opacity-25"
                viewBox="0 0 1920 1080"
                preserveAspectRatio="xMidYMid slice"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    {/* Infinite Coordinate Dot Grid */}
                    <pattern id="canvas-grid-dots" width="40" height="40" patternUnits="userSpaceOnUse">
                        <circle cx="20" cy="20" r="0.8" fill="currentColor" className="text-foreground/15 dark:text-white/10" />
                    </pattern>

                    {/* Smooth Linear Fade Gradients for Flowlines */}
                    <linearGradient id="stream-flow-1" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                        <stop offset="25%" stopColor="currentColor" stopOpacity="0.22" />
                        <stop offset="70%" stopColor="currentColor" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>

                    <linearGradient id="stream-flow-2" x1="0%" y1="100%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                        <stop offset="30%" stopColor="currentColor" stopOpacity="0.18" />
                        <stop offset="75%" stopColor="currentColor" stopOpacity="0.20" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>

                    <linearGradient id="stream-flow-subtle" x1="0%" y1="50%" x2="100%" y2="50%">
                        <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
                        <stop offset="50%" stopColor="currentColor" stopOpacity="0.12" />
                        <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Base Precision Dot Grid */}
                <rect width="100%" height="100%" fill="url(#canvas-grid-dots)" />

                {/* Coordinate Crosshairs & Minimal Axis Markers */}
                <g className="text-foreground/25 dark:text-white/15 font-mono text-[9px] tracking-wider select-none">
                    <g transform="translate(180, 140)">
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" strokeWidth="0.8" />
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" strokeWidth="0.8" />
                        <text x="10" y="3" fill="currentColor" opacity="0.6">CANVAS // 0,0</text>
                    </g>
                    <g transform="translate(1740, 140)">
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" strokeWidth="0.8" />
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" strokeWidth="0.8" />
                        <text x="-76" y="3" fill="currentColor" opacity="0.6">VEC // +1.0</text>
                    </g>
                    <g transform="translate(180, 920)">
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" strokeWidth="0.8" />
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" strokeWidth="0.8" />
                        <text x="10" y="3" fill="currentColor" opacity="0.6">LAT // Y-AXIS</text>
                    </g>
                    <g transform="translate(1740, 920)">
                        <line x1="-6" y1="0" x2="6" y2="0" stroke="currentColor" strokeWidth="0.8" />
                        <line x1="0" y1="-6" x2="0" y2="6" stroke="currentColor" strokeWidth="0.8" />
                        <text x="-76" y="3" fill="currentColor" opacity="0.6">FIELD // INF</text>
                    </g>
                </g>

                {/* Silky Smooth Generative Streamlines - Naturally Framing the Stage */}
                <g className="text-foreground dark:text-white">
                    {/* Upper Canopy Streamlines (Sweeping gently above the workspace) */}
                    <path
                        d="M -120 160 C 400 160, 620 260, 960 260 C 1300 260, 1520 160, 2040 160"
                        fill="none"
                        stroke="url(#stream-flow-1)"
                        strokeWidth="1.2"
                    />
                    <path
                        d="M -120 160 C 400 160, 620 260, 960 260 C 1300 260, 1520 160, 2040 160"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeDasharray="14 260"
                        className="animate-canvas-flow opacity-60 dark:opacity-40"
                    />

                    {/* Upper Harmonic Parallel */}
                    <path
                        d="M -120 190 C 380 190, 600 290, 960 290 C 1320 290, 1540 190, 2040 190"
                        fill="none"
                        stroke="url(#stream-flow-1)"
                        strokeWidth="0.9"
                    />
                    <path
                        d="M -120 190 C 380 190, 600 290, 960 290 C 1320 290, 1540 190, 2040 190"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="10 320"
                        className="animate-canvas-flow-reverse opacity-40 dark:opacity-25"
                    />

                    {/* Lower Horizon Streamlines (Framing below the main workspace) */}
                    <path
                        d="M -120 860 C 460 860, 720 740, 1140 740 C 1560 740, 1720 860, 2040 860"
                        fill="none"
                        stroke="url(#stream-flow-2)"
                        strokeWidth="1.2"
                    />
                    <path
                        d="M -120 860 C 460 860, 720 740, 1140 740 C 1560 740, 1720 860, 2040 860"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeDasharray="16 300"
                        className="animate-canvas-flow-reverse opacity-55 dark:opacity-35"
                    />

                    {/* Lower Harmonic Parallel */}
                    <path
                        d="M -120 890 C 440 890, 700 770, 1140 770 C 1580 770, 1740 890, 2040 890"
                        fill="none"
                        stroke="url(#stream-flow-2)"
                        strokeWidth="0.9"
                    />
                    <path
                        d="M -120 890 C 440 890, 700 770, 1140 770 C 1580 770, 1740 890, 2040 890"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1"
                        strokeDasharray="12 360"
                        className="animate-canvas-flow opacity-35 dark:opacity-20"
                    />

                    {/* Subtle Anchor Vector Junctions */}
                    <g className="opacity-30 dark:opacity-20">
                        <circle cx="960" cy="260" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
                        <circle cx="960" cy="260" r="1" fill="currentColor" />

                        <circle cx="1140" cy="740" r="2.5" fill="none" stroke="currentColor" strokeWidth="0.8" />
                        <circle cx="1140" cy="740" r="1" fill="currentColor" />
                    </g>
                </g>
            </svg>
        </div>
    );
}
