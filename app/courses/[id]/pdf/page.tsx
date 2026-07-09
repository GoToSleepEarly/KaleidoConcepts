import React from "react";
import { ProtectedLayout } from "@/components/protected-layout";
import { CoursePdfPreview } from "@/features/courses/components/course-preview";

export default async function CoursePdfPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout chromeless>
      <CoursePdfPreview courseId={id} />
    </ProtectedLayout>
  );
}
