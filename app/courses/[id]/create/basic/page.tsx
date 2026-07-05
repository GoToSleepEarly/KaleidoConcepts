import { ProtectedLayout } from "@/components/protected-layout";
import { CourseBasicForm } from "@/features/courses/components/course-basic-form";

export default async function CourseBasicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <ProtectedLayout>
      <CourseBasicForm courseId={id} />
    </ProtectedLayout>
  );
}
