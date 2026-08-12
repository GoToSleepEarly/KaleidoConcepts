import { ProtectedLayout } from "@/components/protected-layout";
import { CourseContentWorkspace } from "@/features/courses/components/course-content-workspace";
import { getDb } from "@/lib/server/db";
import { getCourseContentState } from "@/lib/server/repositories/course-content";

export default async function CourseContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getCourseContentState(getDb(), id);
  return <ProtectedLayout><CourseContentWorkspace initialState={state} /></ProtectedLayout>;
}
