import { CourseCreationFlow } from "@/components/course-creation-flow";
import { ProtectedLayout } from "@/components/protected-layout";

export default function NewCoursePage() {
  return (
    <ProtectedLayout>
      <CourseCreationFlow />
    </ProtectedLayout>
  );
}
