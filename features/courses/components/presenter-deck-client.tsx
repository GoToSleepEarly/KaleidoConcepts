"use client";

import { useEffect, useState } from "react";

import { CourseSlideDeck } from "./course-slide-deck";
import type { CoursePreviewResponse } from "@/lib/contracts/api";

type Props = {
  initial: CoursePreviewResponse;
  courseId: string;
};

export function PresenterDeckClient({ initial, courseId }: Props) {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 3000);
    };
    reset();
    window.addEventListener("mousemove", reset);
    window.addEventListener("keydown", reset);
    return () => {
      window.removeEventListener("mousemove", reset);
      window.removeEventListener("keydown", reset);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div className={`min-h-screen bg-slate-950 flex items-center justify-center p-8 ${idle ? "cursor-none" : ""}`}>
      <div className="w-full max-w-[90vw] max-h-[90vh]">
        <CourseSlideDeck
          pages={initial.pages}
          mode="html"
          canEdit={false}
          courseId={courseId}
          variant="presenter"
          presentation={initial.presentation}
          showFullscreenButton
        />
      </div>
    </div>
  );
}
