"use client";

import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "chapter_divider" }>;
  chapterTheme?: string;
};

export function SlideChapterDivider({
  page,
  canEdit,
  selected,
  onSelect,
  chapterTheme = "blue-purple",
}: Props) {
  return (
    <div
      className={`preview-slide relative w-full h-full flex items-center justify-center theme-${chapterTheme} ${
        selected ? "ring-2 ring-blue-500 ring-inset" : ""
      } ${canEdit ? "cursor-pointer" : ""}`}
      onClick={canEdit && onSelect ? () => onSelect(page.id) : undefined}
    >
      <div className="text-center px-8">
        <p className="text-white/70 font-semibold text-xl md:text-2xl tracking-[0.3em] uppercase mb-4">
          Chapter {page.chapterIndex}
        </p>
        <h2 className="text-white font-bold text-5xl md:text-6xl leading-tight tracking-tight">
          {page.chapterTitleEn}
        </h2>
      </div>
    </div>
  );
}
