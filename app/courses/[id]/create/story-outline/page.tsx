import { ProtectedLayout } from "@/components/protected-layout";
import { CourseStoryOutlineWorkspace } from "@/features/courses/components/course-story-outline-workspace";
import { getDb } from "@/lib/server/db";
import { listPresets } from "@/lib/server/repositories/presets";
import { getStoryOutlineState } from "@/lib/server/repositories/story-outline";

export default async function StoryOutlinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const [state, themePresets] = await Promise.all([
    getStoryOutlineState(db, id),
    listPresets(db, { kind: "theme" }),
  ]);
  return (
    <ProtectedLayout>
      <CourseStoryOutlineWorkspace initialState={state} themePresets={themePresets} />
    </ProtectedLayout>
  );
}
