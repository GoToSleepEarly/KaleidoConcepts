"use client";

import React, { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function OverflowingKnowledgePointTitle({ title }: { title: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const [overflowDistance, setOverflowDistance] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const overflowing = overflowDistance > 0;

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return;
    setOverflowDistance(Math.max(0, Math.ceil(text.scrollWidth - viewport.clientWidth)));
  }, []);

  useLayoutEffect(() => {
    if (expanded) return;
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    if (viewportRef.current) observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [expanded, measure, title]);

  function stopAnimation() {
    animationRef.current?.cancel();
    animationRef.current = null;
  }

  function startAnimation() {
    const text = textRef.current;
    if (!text || !overflowing || expanded) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!finePointer || reducedMotion) return;
    stopAnimation();
    animationRef.current = text.animate(
      [{ transform: "translateX(0)" }, { transform: `translateX(-${overflowDistance}px)` }],
      { delay: 350, duration: Math.min(6000, Math.max(1200, overflowDistance * 24)), easing: "linear", fill: "forwards" },
    );
  }

  function toggleExpanded() {
    if (!overflowing) return;
    stopAnimation();
    setExpanded((current) => !current);
  }

  return (
    <button
      aria-expanded={overflowing ? expanded : undefined}
      aria-label={overflowing ? `${expanded ? "收起" : "展开"}完整知识点标题 ${title}` : title}
      className={cn("block min-w-0 max-w-[min(18rem,calc(100vw-11rem))] border-0 bg-transparent p-0 text-left font-inherit text-inherit focus-visible:outline-none", overflowing ? "cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-1" : "cursor-default")}
      data-overflowing={overflowing ? "true" : "false"}
      onClick={toggleExpanded}
      onMouseEnter={startAnimation}
      onMouseLeave={stopAnimation}
      title={title}
      type="button"
    >
      <span className={cn("block min-w-0", expanded ? "overflow-visible" : "overflow-hidden")} ref={viewportRef}>
        <span className={cn("block", expanded ? "whitespace-normal break-words" : "whitespace-nowrap will-change-transform")} ref={textRef}>{title}</span>
      </span>
    </button>
  );
}
