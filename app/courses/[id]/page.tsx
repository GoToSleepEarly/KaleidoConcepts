import React from "react";
import { ProtectedLayout } from "@/components/protected-layout";
import { CourseHtmlPreview } from "@/features/courses/components/course-preview";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout chromeless>
      <CourseHtmlPreview courseId={id} />
    </ProtectedLayout>
  );
}
