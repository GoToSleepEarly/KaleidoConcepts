"use client";

import { CoursePreviewImageFrame } from "./course-preview-image-frame";
import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "cover_pure" }>;
};

export function SlideCoverPure({ page, courseId, canEdit, selected, onSelect }: Props) {
  const backHref = canEdit ? `/courses/${courseId}/create/resources` : undefined;
  return (
    <div
      className={`preview-slide relative w-full h-full ${selected ? "ring-2 ring-blue-500 ring-inset" : ""} ${
        canEdit ? "cursor-pointer" : ""
      }`}
      onClick={canEdit && onSelect ? () => onSelect(page.id) : undefined}
    >
      <CoursePreviewImageFrame
        image={page.image}
        alt="课程封面"
        backToEditHref={backHref}
        className="w-full h-full"
      />
    </div>
  );
}
