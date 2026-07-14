"use client";

import { CoursePreviewImageFrame } from "./course-preview-image-frame";
import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "cover_title" }>;
  coverTheme?: string;
  titleFontScale?: number;
};

export function SlideCoverTitle({
  page,
  courseId,
  canEdit,
  selected,
  onSelect,
  coverTheme = "dark",
  titleFontScale = 1.0,
}: Props) {
  const backHref = canEdit ? `/courses/${courseId}/create/resources` : undefined;
  const overlayClass =
    coverTheme === "warm"
      ? "bg-gradient-to-t from-orange-900/70 via-black/30 to-transparent"
      : coverTheme === "light"
        ? "bg-gradient-to-t from-white/70 via-white/20 to-transparent"
        : "bg-gradient-to-t from-black/80 via-black/30 to-transparent";

  const textColor = coverTheme === "light" ? "text-slate-900" : "text-white";
  const titleSize = `clamp(2.5rem, 6vw * ${titleFontScale}, 5.5rem)`;

  return (
    <div
      className={`preview-slide relative w-full h-full ${selected ? "ring-2 ring-blue-500 ring-inset" : ""} ${
        canEdit ? "cursor-pointer" : ""
      }`}
      onClick={canEdit && onSelect ? () => onSelect(page.id) : undefined}
    >
      <CoursePreviewImageFrame
        image={page.image}
        alt={page.title}
        backToEditHref={backHref}
        className="absolute inset-0"
      />
      <div className={`absolute inset-0 ${overlayClass}`} />
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-16 px-8">
        <h1
          className={`${textColor} font-bold text-center leading-tight tracking-tight mb-4 max-w-full`}
          style={{ fontSize: titleSize }}
        >
          {page.title}
        </h1>
        <div className={`${textColor} text-center opacity-90 space-y-1 text-lg`}>
          {page.teacherName && <p>{page.teacherName}</p>}
          {page.studentNames.length > 0 && (
            <p className="opacity-80">{page.studentNames.join(" · ")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
