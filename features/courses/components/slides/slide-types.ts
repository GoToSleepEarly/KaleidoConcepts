"use client";

export type SlideCommonProps = {
  mode: "html" | "pdf";
  canEdit: boolean;
  selected?: boolean;
  onSelect?: (pageId: string) => void;
  courseId: string;
};
