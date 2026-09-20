import { ProtectedLayout } from "@/components/protected-layout";
import { CourseContentWorkspace } from "@/features/courses/components/course-content-workspace";
import { getDb } from "@/lib/server/db";
import { getCourseContentState } from "@/lib/server/repositories/course-content";

export default async function CourseContentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ refreshExercises?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const state = await getCourseContentState(getDb(), id);
  return <ProtectedLayout><CourseContentWorkspace initialState={state} promptExerciseRefresh={query.refreshExercises === "1" && state.exercisesStale} /></ProtectedLayout>;
}
