"use client";

import { useCallback, useEffect, useState } from "react";

import { PresentationControls } from "./presentation-controls";
import {
  SlideChapterDivider,
  SlideClosingImage,
  SlideClosingText,
  SlideCoverPure,
  SlideCoverTitle,
  SlideShotImage,
  SlideShotText,
} from "./slides";
import type { CoursePreviewPage, CoursePresentationConfig } from "@/lib/contracts/api";

type Props = {
  pages: CoursePreviewPage[];
  mode: "html" | "pdf";
  canEdit: boolean;
  courseId: string;
  selectedPageId?: string;
  onSelectPage?: (pageId: string) => void;
  showAllPages?: boolean;
  variant?: "editor" | "presenter";
  presentation?: CoursePresentationConfig;
  showFullscreenButton?: boolean;
  extraActions?: React.ReactNode;
};

export function CourseSlideDeck({
  pages,
  mode,
  canEdit,
  courseId,
  selectedPageId,
  onSelectPage,
  showAllPages,
  variant = "presenter",
  presentation,
  showFullscreenButton,
  extraActions,
}: Props) {
  const [current, setCurrent] = useState(0);
  const total = pages.length;

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0) idx = 0;
      if (idx >= total) idx = total - 1;
      setCurrent(idx);
    },
    [total],
  );

  useEffect(() => {
    if (showAllPages) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(current - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(current + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(total - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [current, goTo, total, showAllPages]);

  const enterFullscreen = () => {
    const el = document.documentElement;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      el.requestFullscreen?.();
    }
  };

  const renderPage = (page: CoursePreviewPage) => {
    const common = { courseId, mode, canEdit, selected: selectedPageId === page.id, onSelect: onSelectPage };
    switch (page.type) {
      case "cover_pure":
        return <SlideCoverPure key={page.id} page={page} {...common} />;
      case "cover_title":
        return (
          <SlideCoverTitle
            key={page.id}
            page={page}
            {...common}
            coverTheme={presentation?.coverTheme}
            titleFontScale={presentation?.coverTitleFontSize}
          />
        );
      case "chapter_divider":
        return (
          <SlideChapterDivider
            key={page.id}
            page={page}
            {...common}
            chapterTheme={presentation?.chapterTheme}
          />
        );
      case "shot_image":
        return <SlideShotImage key={page.id} page={page} {...common} />;
      case "shot_text": {
        const override = presentation?.slideOverrides[page.id];
        const effectivePage = {
          ...page,
          textBox: { ...page.textBox, ...(override?.textBox ?? {}) },
        };
        return <SlideShotText key={page.id} page={effectivePage} {...common} />;
      }
      case "closing_image":
        return <SlideClosingImage key={page.id} page={page} {...common} />;
      case "closing_text": {
        const override = presentation?.slideOverrides[page.id];
        const effectivePage = {
          ...page,
          textBox: { ...page.textBox, ...(override?.textBox ?? {}) },
        };
        return <SlideClosingText key={page.id} page={effectivePage} {...common} />;
      }
      default:
        return null;
    }
  };

  if (showAllPages || mode === "pdf") {
    return (
      <div className="preview-deck-pdf w-full">
        <div className="flex flex-col gap-0">
          {pages.map((page) => (
            <div key={page.id} className="preview-slide-wrapper w-full aspect-video shadow-lg my-2 relative overflow-hidden rounded-lg">
              {renderPage(page)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="w-full aspect-video shadow-2xl relative overflow-hidden rounded-lg bg-black">
        {pages[current] && renderPage(pages[current])}
      </div>
      <div className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-20 ${variant === "presenter" ? "presentation-controls-hover-target" : ""}`}>
        <PresentationControls
          currentSlide={current}
          totalSlides={total}
          onPrevious={() => goTo(current - 1)}
          onNext={() => goTo(current + 1)}
          onReset={() => goTo(0)}
          onFullscreen={enterFullscreen}
          showFullscreenButton={showFullscreenButton}
          variant={variant}
          extraActions={extraActions}
        />
      </div>
    </div>
  );
}
