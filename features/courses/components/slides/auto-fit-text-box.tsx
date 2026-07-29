"use client";

import { useLayoutEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";

type Props = {
  children: ReactNode;
  backgroundOpacity: number;
  userScale: number;
  autoFitScaleMax?: number;
  fitKey: string;
};

export function AutoFitTextBox({
  children,
  backgroundOpacity,
  userScale,
  autoFitScaleMax = 1,
  fitKey,
}: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;

    let frame: number | null = null;
    let disposed = false;
    const minScale = 0.25;

    const measure = () => {
      if (disposed) return;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }

      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!boxRef.current) return;

        const target = boxRef.current;
        const previousTransition = target.style.transition;
        target.style.transition = "none";

        let low = minScale;
        let high = Math.max(minScale, autoFitScaleMax);
        let best = low;

        for (let i = 0; i < 10; i += 1) {
          const mid = (low + high) / 2;
          target.style.setProperty("--auto-fit-scale", mid.toFixed(4));

          const fitsHeight = target.scrollHeight <= target.clientHeight + 1;
          const fitsWidth = target.scrollWidth <= target.clientWidth + 1;

          if (fitsHeight && fitsWidth) {
            best = mid;
            low = mid;
          } else {
            high = mid;
          }
        }

        target.style.setProperty("--auto-fit-scale", best.toFixed(4));
        target.style.transition = previousTransition;
      });
    };

    box.style.setProperty("--auto-fit-scale", "1");
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(content, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      disposed = true;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      observer.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [autoFitScaleMax, backgroundOpacity, fitKey, userScale]);

  const boxStyle = {
    background: `rgba(255,255,255,${backgroundOpacity})`,
    "--text-scale": userScale,
    "--auto-fit-scale": 1,
  } as CSSProperties;

  return (
    <div
      ref={boxRef}
      className="frosted-glass rounded-2xl shadow-2xl slide-text-box-inner w-full"
      style={boxStyle}
    >
      <div ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
