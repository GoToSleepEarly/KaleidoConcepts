"use client";

import { CoursePreviewImageFrame } from "./course-preview-image-frame";
import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "shot_image" }>;
};

export function SlideShotImage({ page, courseId, canEdit }: Props) {
  const backHref = canEdit ? `/courses/${courseId}/create/resources` : undefined;
  return (
    <div className="preview-slide relative w-full h-full">
      <CoursePreviewImageFrame
        image={page.image}
        alt={`章节 ${page.chapterIndex} 配图`}
        backToEditHref={backHref}
        className="w-full h-full"
      />
    </div>
  );
}
