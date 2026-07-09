import { ProtectedLayout } from "@/components/protected-layout";
import { CourseCreatePreviewEmbed } from "@/features/courses/components/course-preview";

export default async function CourseCreatePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseCreatePreviewEmbed courseId={id} />
    </ProtectedLayout>
  );
}
