import { ProtectedLayout } from "@/components/protected-layout";
import { CoursePreviewWorkspace } from "@/features/courses/components/course-preview-workspace";
import { getDb } from "@/lib/server/db";
import { getCoursePreview } from "@/lib/server/repositories/course-preview";

export default async function CoursePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProtectedLayout><CoursePreviewWorkspace initialState={await getCoursePreview(getDb(), id)} /></ProtectedLayout>;
}
