import { ProtectedLayout } from "@/components/protected-layout";
import { CourseVisualResourcesWorkspace } from "@/features/courses/components/course-visual-resources-workspace";
import { getDb } from "@/lib/server/db";
import { getCourseVisualResources } from "@/lib/server/repositories/visual-resources";

export default async function CourseVisualResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getCourseVisualResources(getDb(), id);
  return <ProtectedLayout><CourseVisualResourcesWorkspace initialState={state} /></ProtectedLayout>;
}
