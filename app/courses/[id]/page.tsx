import { redirect } from "next/navigation";

import { getDb } from "@/lib/server/db";
import { getCoursePreview } from "@/lib/server/repositories/course-preview";
import { PresenterDeckClient } from "@/features/courses/components/presenter-deck-client";

export default async function CoursePresenterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  let preview;
  try {
    preview = await getCoursePreview(db, id);
  } catch {
    redirect("/courses");
  }

  if (preview.course.status !== "published") {
    redirect(`/courses/${id}/create/preview`);
  }

  if (!preview) {
    redirect("/courses");
  }

  return <PresenterDeckClient initial={preview} courseId={id} />;
}
