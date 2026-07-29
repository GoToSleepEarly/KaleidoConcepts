"use client";

import { AutoFitTextBox } from "./auto-fit-text-box";
import { CoursePreviewImageFrame } from "./course-preview-image-frame";
import { SlideBlocksRenderer } from "./slide-blocks-renderer";
import type { SlideCommonProps } from "./slide-types";
import type { CoursePreviewPage } from "@/lib/contracts/api";

type Props = SlideCommonProps & {
  page: Extract<CoursePreviewPage, { type: "closing_text" }>;
  autoFitScaleMax?: number;
};

export function SlideClosingText({ page, mode, courseId, canEdit, selected, onSelect, autoFitScaleMax }: Props) {
  const backHref = canEdit ? `/courses/${courseId}/create/resources` : undefined;
  const { textBox } = page;

  return (
    <div
      className={`preview-slide relative w-full h-full ${selected ? "ring-2 ring-blue-500 ring-inset" : ""} ${
        canEdit ? "cursor-pointer" : ""
      }`}
      onClick={canEdit && onSelect ? () => onSelect(page.id) : undefined}
    >
      <CoursePreviewImageFrame
        image={page.image}
        alt="课后阅读"
        backToEditHref={backHref}
        className="absolute inset-0"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />
      <div className="absolute inset-0 flex items-center justify-center slide-text-box">
        <AutoFitTextBox
          backgroundOpacity={textBox.opacity}
          userScale={textBox.fontSize}
          autoFitScaleMax={autoFitScaleMax}
          fitKey={`${page.id}:${textBox.fontSize}:${textBox.opacity}:${autoFitScaleMax ?? 1}:${page.title}`}
        >
          <SlideBlocksRenderer paragraphs={page.paragraphs} mode={mode} title={page.title} />
        </AutoFitTextBox>
      </div>
    </div>
  );
}
