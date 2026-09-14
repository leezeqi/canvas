"use client";

import { memo, useRef, useState, type PointerEvent } from "react";
import { Button, Modal } from "antd";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

import { cn } from "@/lib/utils";

export type HomeBanner = {
    imageUrl: string;
    videoUrl?: string;
    linkUrl?: string;
    alt: string;
};

const BANNER_WIDTH = "min(calc(100vw - 2rem), clamp(420px, 38vw, 560px))";
const SIDE_BANNER_WIDTH = "min(calc(94vw - 1.88rem), clamp(394.8px, 35.72vw, 526.4px))";

const getBannerAngle = (offset: number) => offset === 0 ? 0 : offset < 0 ? 12 : -12;
const getBannerTransform = (offset: number) => `perspective(900px) rotateY(${getBannerAngle(offset)}deg)`;

const AnimatedBannerImage = memo(function AnimatedBannerImage({ src, alt }: { src: string; alt: string }) {
    return <img src={src} alt={alt} draggable={false} decoding="async" className="block h-full w-full select-none rounded-[inherit] object-cover" />;
});

export const HomeBannerCarousel = memo(function HomeBannerCarousel({ banners }: { banners: HomeBanner[] }) {
    const [activePosition, setActivePosition] = useState(0);
    const activeIndex =
        ((activePosition % banners.length) + banners.length) % banners.length;
    const [activeVideoUrl, setActiveVideoUrl] = useState("");
    const carouselRef = useRef<HTMLDivElement>(null);
    const pointerStartRef = useRef<number | null>(null);
    const draggedRef = useRef(false);
    const visibleBanners = [-1, 0, 1].map((offset) => {
        const position = activePosition + offset;
        const index =
            ((position % banners.length) + banners.length) % banners.length;

        return {
            banner: banners[index],
            index,
            offset,
            position,
        };
    });

    const changeBanner = (step: number) => {
        setActivePosition((current) => current + step);
    };

    const selectBanner = (index: number) => {
        setActivePosition((current) => {
            const currentIndex =
                ((current % banners.length) + banners.length) % banners.length;

            return current + index - currentIndex;
        });
    };

    const setCardTransitionDuration = (duration: string) => {
        carouselRef.current?.querySelectorAll<HTMLElement>("[data-banner-card]").forEach((card) => {
            card.style.transitionDuration = duration;
        });
    };

    const setDragOffset = (distance: number) => {
        carouselRef.current?.style.setProperty("--banner-drag-x", distance + "px");
        const progress = Math.max(-1, Math.min(1, distance / 160));
        carouselRef.current?.querySelectorAll<HTMLElement>("[data-banner-offset]").forEach((card) => {
            const offset = Number(card.dataset.bannerOffset);
            const baseAngle = getBannerAngle(offset);
            card.style.transform = "perspective(900px) rotateY(" + (baseAngle - progress * 12) + "deg)";
        });
    };

    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        pointerStartRef.current = event.clientX;
        draggedRef.current = false;
        setCardTransitionDuration("0ms");
        event.currentTarget.setPointerCapture(event.pointerId);
    };

    const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
        const start = pointerStartRef.current;
        if (start === null) return;
        const distance = Math.max(-180, Math.min(180, event.clientX - start));
        draggedRef.current = Math.abs(distance) > 4;
        setDragOffset(distance);
    };

    const finishDrag = (step = 0) => {
        pointerStartRef.current = null;
        setCardTransitionDuration("300ms");
        if (step) changeBanner(step);
        window.requestAnimationFrame(() => setDragOffset(0));
    };

    const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
        const start = pointerStartRef.current;
        if (start === null) return;
        const distance = event.clientX - start;
        draggedRef.current = Math.abs(distance) > 4;
        finishDrag(Math.abs(distance) > 60 ? (distance < 0 ? 1 : -1) : 0);
    };

    const handlePointerCancel = () => {
        draggedRef.current = false;
        finishDrag();
    };

    const openBanner = (
        banner: HomeBanner,
        index: number,
        position: number,
    ) => {
        if (draggedRef.current) {
            draggedRef.current = false;
            return;
        }

        if (index !== activeIndex) {
            setActivePosition(position);
            return;
        }

        if (banner.videoUrl) setActiveVideoUrl(banner.videoUrl);
        else if (banner.linkUrl) {
            window.open(banner.linkUrl, "_blank", "noopener,noreferrer");
        }
    };

    return (
        <>
            <style>{`
                @media (max-width: 639px) {
                    .home-banner-carousel-card {
                        width: ${BANNER_WIDTH} !important;
                        transform: none !important;
                    }

                    .home-banner-carousel-card[data-banner-offset="-1"] {
                        left: calc(-50% + var(--banner-drag-x, 0px)) !important;
                    }

                    .home-banner-carousel-card[data-banner-offset="0"] {
                        left: calc(50% + var(--banner-drag-x, 0px)) !important;
                    }

                    .home-banner-carousel-card[data-banner-offset="1"] {
                        left: calc(150% + var(--banner-drag-x, 0px)) !important;
                    }
                }
            `}</style>
            <div ref={carouselRef} className="relative left-1/2 h-[calc((100vw-2rem)*.5625+56px)] w-screen -translate-x-1/2 overflow-hidden sm:h-[340px] sm:overflow-visible">
                {visibleBanners.map(({ banner, index, offset, position }) => {
                    const active = offset === 0;
                    return (
                        <button
                            key={position}
                            type="button"
                            data-banner-card
                            data-banner-offset={offset}
                            className={cn(
                                "home-banner-carousel-card group absolute top-1/2 aspect-video rounded-2xl outline-none transition-[left,width,transform,opacity] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70",
                                active ? "opacity-100" : "opacity-55 hover:opacity-80",
                                (banner.linkUrl || banner.videoUrl) && "cursor-pointer",
                            )}
                            style={{
                                left: offset === 0 ? "calc(50% + var(--banner-drag-x, 0px))" : offset < 0 ? `calc(50% - ${SIDE_BANNER_WIDTH} + 16px + var(--banner-drag-x, 0px))` : `calc(50% + ${SIDE_BANNER_WIDTH} - 16px + var(--banner-drag-x, 0px))`,
                                width: active ? BANNER_WIDTH : SIDE_BANNER_WIDTH,
                                translate: "-50% -50%",
                                zIndex: active ? 3 : 1,
                                transform: getBannerTransform(offset),
                                transformOrigin: "center center",
                                backfaceVisibility: "hidden",
                                touchAction: "pan-y",
                            }}
                            onPointerDown={handlePointerDown}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerCancel}
                            onClick={() => openBanner(banner, index, position)}
                            aria-label={banner.alt}
                        >
                            <span
                                aria-hidden
                                className={cn(
                                    "pointer-events-none absolute -inset-1 rounded-[20px] border",
                                    active
                                        ? "border-violet-400/25 bg-violet-500/10 shadow-[0_24px_70px_rgba(124,58,237,.22),0_12px_34px_rgba(37,99,235,.14)] backdrop-blur-xl dark:border-white/10 dark:shadow-[0_26px_80px_rgba(0,0,0,.50),0_0_36px_rgba(139,92,246,.18)]"
                                        : "border-slate-900/5 bg-white/20 shadow-[0_12px_30px_rgba(31,38,58,.10)] dark:border-white/5 dark:bg-white/5 dark:shadow-[0_12px_30px_rgba(0,0,0,.25)]",
                                )}
                            />
                            <span
                                className="relative isolate block size-full overflow-hidden rounded-2xl border border-white/20 bg-slate-100 dark:border-white/10 dark:bg-slate-900"
                            >
                                <AnimatedBannerImage src={banner.imageUrl} alt={banner.alt} />
                                {active && banner.videoUrl ? (
                                    <span className="absolute inset-0 grid place-items-center bg-black/15">
                                        <span className="grid size-12 place-items-center rounded-full border border-white/20 bg-slate-950/55 text-white shadow-[0_12px_36px_rgba(0,0,0,.32)] backdrop-blur-xl transition group-hover:scale-105">
                                            <Play className="ml-0.5 size-5 fill-current" />
                                        </span>
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    );
                })}
                <Button type="text" shape="circle" className="aurora-glass !absolute !top-1/2 !z-10 !hidden !-translate-y-1/2 !border !text-slate-700 hover:!text-violet-600 sm:!inline-flex dark:!text-slate-200 dark:hover:!text-violet-300" style={{ left: "calc(50% - min(742px, calc(50vw - 32px)))" }} icon={<ChevronLeft className="size-5" />} onClick={() => changeBanner(-1)} aria-label="上一张" />
                <Button type="text" shape="circle" className="aurora-glass !absolute !top-1/2 !z-10 !hidden !-translate-y-1/2 !border !text-slate-700 hover:!text-violet-600 sm:!inline-flex dark:!text-slate-200 dark:hover:!text-violet-300" style={{ right: "calc(50% - min(742px, calc(50vw - 32px)))" }} icon={<ChevronRight className="size-5" />} onClick={() => changeBanner(1)} aria-label="下一张" />
            </div>
            <div className="mt-2 flex h-5 items-center justify-center gap-2" aria-label="轮播图切换">
                {banners.map((banner, index) => (
                    <button key={banner.imageUrl} type="button" className={cn("h-1.5 rounded-full transition-all duration-300", index === activeIndex ? "w-7 bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,.55)]" : "w-1.5 bg-slate-300 hover:bg-violet-300 dark:bg-slate-700 dark:hover:bg-violet-500/70")} onClick={() => selectBanner(index)} aria-label={"切换到第 " + (index + 1) + " 张"} aria-current={index === activeIndex ? "true" : undefined} />
                ))}
            </div>
            <Modal open={Boolean(activeVideoUrl)} footer={null} centered width={960} destroyOnHidden onCancel={() => setActiveVideoUrl("")}>
                {activeVideoUrl ? <video key={activeVideoUrl} src={activeVideoUrl} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black object-contain" /> : null}
            </Modal>
        </>
    );
});
