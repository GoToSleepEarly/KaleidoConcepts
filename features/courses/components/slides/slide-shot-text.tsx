"use client";

import { CoursePreviewImageFrame } from "./course-preview-image-frame";
import { SlideBlocksRenderer } from "./slide-blocks-renderer";
import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "shot_text" }>;
};

export function SlideShotText({ page, mode, courseId, canEdit, selected, onSelect }: Props) {
  const backHref = canEdit ? `/courses/${courseId}/create/resources` : undefined;
  const { textBox } = page;

  const boxStyle = {
    background: `rgba(255,255,255,${textBox.opacity})`,
    "--text-scale": textBox.fontSize,
  } as React.CSSProperties;

  return (
    <div
      className={`preview-slide relative w-full h-full ${selected ? "ring-2 ring-blue-500 ring-inset" : ""} ${
        canEdit ? "cursor-pointer" : ""
      }`}
      onClick={canEdit && onSelect ? () => onSelect(page.id) : undefined}
    >
      <CoursePreviewImageFrame
        image={page.image}
        alt="课文配图"
        backToEditHref={backHref}
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center p-4 md:p-8 slide-text-box">
        <div
          className="frosted-glass p-5 md:p-7 shadow-2xl rounded-2xl slide-text-box-inner w-full"
          style={boxStyle}
        >
          <SlideBlocksRenderer paragraphs={page.paragraphs} mode={mode} />
        </div>
      </div>
    </div>
  );
}
