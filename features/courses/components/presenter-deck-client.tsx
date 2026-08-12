"use client";

import React from "react";

import { CourseSlideDeck } from "@/features/courses/components/course-slide-deck";
import type { CoursePreviewResponse } from "@/lib/contracts/api";

export function PresenterDeckClient({ initial }: { initial: CoursePreviewResponse }) {
  return <main className="flex min-h-dvh items-center justify-center bg-slate-950 p-8"><div className="w-full max-w-[90vw]"><CourseSlideDeck pages={initial.pages} presentation={initial.presentation} /></div></main>;
}
