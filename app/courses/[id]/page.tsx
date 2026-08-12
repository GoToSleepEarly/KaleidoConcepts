import { redirect } from "next/navigation";
import React from "react";

import { PresenterDeckClient } from "@/features/courses/components/presenter-deck-client";
import { getDb } from "@/lib/server/db";
import { getCoursePreview } from "@/lib/server/repositories/course-preview";

export default async function CoursePresenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const preview = await getCoursePreview(getDb(), id).catch(() => null);
  if (!preview) redirect("/courses");
  if (preview.course.lifecycleStatus !== "published") redirect(`/courses/${id}/create/preview`);
  return <PresenterDeckClient initial={preview} />;
}
