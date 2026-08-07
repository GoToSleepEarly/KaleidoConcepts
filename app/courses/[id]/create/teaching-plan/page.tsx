import { ProtectedLayout } from "@/components/protected-layout";
import { CourseTeachingPlanWorkspace } from "@/features/courses/components/course-teaching-plan-workspace";
import { getDb } from "@/lib/server/db";
import { getTeachingPlanState } from "@/lib/server/repositories/teaching-plan";

export default async function TeachingPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getTeachingPlanState(getDb(), id);
  return (
    <ProtectedLayout>
      <CourseTeachingPlanWorkspace initialState={state} />
    </ProtectedLayout>
  );
}
