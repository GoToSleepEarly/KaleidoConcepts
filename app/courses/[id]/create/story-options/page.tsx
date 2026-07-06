import { ProtectedLayout } from "@/components/protected-layout";
import { StoryOptionsManager } from "@/features/courses/components/story-options-manager";

export default async function StoryOptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <StoryOptionsManager courseId={id} />
    </ProtectedLayout>
  );
}
