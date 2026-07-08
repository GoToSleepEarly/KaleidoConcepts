import { ProtectedLayout } from "@/components/protected-layout";
import { CourseResourcesManager } from "@/features/courses/components/course-resources-manager";

export default async function CourseResourcesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseResourcesManager courseId={id} />
    </ProtectedLayout>
  );
}
