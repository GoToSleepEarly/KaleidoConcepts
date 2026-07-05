import { ProtectedLayout } from "@/components/protected-layout";
import { CourseBasicForm } from "@/features/courses/components/course-basic-form";

export default function NewCoursePage() {
  return (
    <ProtectedLayout>
      <CourseBasicForm />
    </ProtectedLayout>
  );
}
