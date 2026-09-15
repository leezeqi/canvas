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
    title?: string;
    desc?: string;
};

const BANNER_WIDTH = "min(calc(100vw - 2rem), clamp(440px, 40vw, 620px))";
const SIDE_BANNER_WIDTH = "min(calc(96vw - 1.92rem), clamp(404px, 36.8vw, 570px))";

const getBannerAngle = (offset: number) => (offset === 0 ? 0 : offset < 0 ? 14 : -14);
const getBannerTransform = (offset: number) => `perspective(1000px) rotateY(${getBannerAngle(offset)}deg)`;

const AnimatedBannerImage = memo(function AnimatedBannerImage({ src, alt }: { src: string; alt: string }) {
    return <img src={src} alt={alt} draggable={false} decoding="async" className="block h-full w-full select-none rounded-[inherit] object-cover" />;
});

export const HomeBannerCarousel = memo(function HomeBannerCarousel({ banners }: { banners: HomeBanner[] }) {
    const [activePosition, setActivePosition] = useState(0);
    const activeIndex = ((activePosition % banners.length) + banners.length) % banners.length;
    const [activeVideoUrl, setActiveVideoUrl] = useState("");
    const carouselRef = useRef<HTMLDivElement>(null);
    const pointerStartRef = useRef<number | null>(null);
    const draggedRef = useRef(false);
    const visibleBanners = [-1, 0, 1].map((offset) => {
        const position = activePosition + offset;
        const index = ((position % banners.length) + banners.length) % banners.length;

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
            const currentIndex = ((current % banners.length) + banners.length) % banners.length;
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
            card.style.transform = "perspective(1000px) rotateY(" + (baseAngle - progress * 14) + "deg)";
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

    const openBanner = (banner: HomeBanner, index: number, position: number) => {
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
            <div ref={carouselRef} className="relative left-1/2 h-[calc((100vw-2rem)*.5625+132px)] w-screen -translate-x-1/2 overflow-hidden sm:h-[400px] sm:overflow-visible">
                {visibleBanners.map(({ banner, index, offset, position }) => {
                    const active = offset === 0;
                    return (
                        <button
                            key={position}
                            type="button"
                            data-banner-card
                            data-banner-offset={offset}
                            className={cn(
                                "home-banner-carousel-card group absolute top-1/2 aspect-[4/3] rounded-[24px] outline-none transition-[left,width,transform,opacity,filter] duration-300 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40",
                                active ? "opacity-100 blur-0" : "opacity-70 blur-[1px] hover:opacity-90 hover:blur-0",
                                (banner.linkUrl || banner.videoUrl) && "cursor-pointer",
                            )}
                            style={{
                                left: offset === 0 ? "calc(50% + var(--banner-drag-x, 0px))" : offset < 0 ? `calc(50% - ${SIDE_BANNER_WIDTH} + 88px + var(--banner-drag-x, 0px))` : `calc(50% + ${SIDE_BANNER_WIDTH} - 88px + var(--banner-drag-x, 0px))`,
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
                                    "pointer-events-none absolute -inset-1 rounded-[28px]",
                                    active
                                        ? "shadow-[rgba(0,0,0,0.14)_0px_24px_56px_-12px,rgba(0,0,0,0.08)_0px_8px_20px_-8px]"
                                        : "shadow-[rgba(0,0,0,0.08)_0px_12px_28px_-8px]",
                                )}
                            />
                            <span className="relative isolate flex h-full w-full flex-col overflow-hidden rounded-[24px] border border-white/10 bg-[#0d0e13] p-2.5 text-left shadow-[0_24px_48px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.12)]">
                                <span className="relative block min-h-0 flex-1 overflow-hidden rounded-[18px] bg-black/40">
                                    <AnimatedBannerImage src={banner.imageUrl} alt={banner.alt} />
                                    {active && banner.videoUrl ? (
                                        <span className="absolute inset-0 grid place-items-center bg-black/25 backdrop-blur-[1px]">
                                            <span className="grid size-12 place-items-center rounded-full border border-white/25 bg-black/50 text-white backdrop-blur-md transition duration-300 group-hover:scale-110 group-hover:border-white/50">
                                                <Play className="ml-0.5 size-5 fill-current" />
                                            </span>
                                        </span>
                                    ) : null}
                                </span>
                                {banner.title ? (
                                    <span className="block px-2 pb-1.5 pt-3">
                                        <span className="block text-[14px] font-medium tracking-tight text-white">{banner.title}</span>
                                        {banner.desc ? (
                                            <span className="mt-0.5 block text-xs font-light leading-5 text-white/50">{banner.desc}</span>
                                        ) : null}
                                    </span>
                                ) : null}
                            </span>
                        </button>
                    );
                })}
                <button type="button" className="!absolute !top-1/2 !z-10 !hidden size-10 !-translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 text-foreground backdrop-blur-xl transition hover:border-foreground/30 hover:scale-105 sm:!inline-flex dark:border-white/10 dark:bg-black/60 dark:text-white dark:hover:border-white/30" style={{ left: "calc(50% - min(742px, calc(50vw - 32px)))" }} onClick={() => changeBanner(-1)} aria-label="上一张"><ChevronLeft className="size-4" /></button>
                <button type="button" className="!absolute !top-1/2 !z-10 !hidden size-10 !-translate-y-1/2 items-center justify-center rounded-full border border-border bg-card/80 text-foreground backdrop-blur-xl transition hover:border-foreground/30 hover:scale-105 sm:!inline-flex dark:border-white/10 dark:bg-black/60 dark:text-white dark:hover:border-white/30" style={{ right: "calc(50% - min(742px, calc(50vw - 32px)))" }} onClick={() => changeBanner(1)} aria-label="下一张"><ChevronRight className="size-4" /></button>
            </div>
            <div className="mt-2 flex h-5 items-center justify-center gap-2" aria-label="轮播图切换">
                {banners.map((banner, index) => (
                    <button key={banner.imageUrl} type="button" className={cn("h-1.5 rounded-full transition-all duration-300", index === activeIndex ? "w-7 bg-foreground" : "w-1.5 bg-foreground/25 hover:bg-foreground/50 dark:bg-slate-700 dark:hover:bg-white/50")} onClick={() => selectBanner(index)} aria-label={"切换到第 " + (index + 1) + " 张"} aria-current={index === activeIndex ? "true" : undefined} />
                ))}
            </div>
            <Modal open={Boolean(activeVideoUrl)} footer={null} centered width={960} destroyOnHidden onCancel={() => setActiveVideoUrl("")}>
                {activeVideoUrl ? <video key={activeVideoUrl} src={activeVideoUrl} controls autoPlay playsInline className="max-h-[78vh] w-full bg-black object-contain" /> : null}
            </Modal>
        </>
    );
});
