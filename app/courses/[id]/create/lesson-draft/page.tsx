import { ProtectedLayout } from "@/components/protected-layout";
import { LessonDraftManager } from "@/features/courses/components/lesson-draft-manager";

export default async function LessonDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <LessonDraftManager courseId={id} />
    </ProtectedLayout>
  );
}
