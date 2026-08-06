import { ProtectedLayout } from "@/components/protected-layout";
import { CourseStoryOutlineWorkspace } from "@/features/courses/components/course-story-outline-workspace";
import { getDb } from "@/lib/server/db";
import { getStoryOutlineState } from "@/lib/server/repositories/story-outline";

export default async function StoryOutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getStoryOutlineState(getDb(), id);
  return (
    <ProtectedLayout>
      <CourseStoryOutlineWorkspace initialState={state} />
    </ProtectedLayout>
  );
}
