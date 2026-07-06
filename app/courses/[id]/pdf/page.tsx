import { ProtectedLayout } from "@/components/protected-layout";
import { CoursePlayer } from "@/features/courses/components/course-player";

export default function CoursePdfPage() {
  return (
    <ProtectedLayout>
      <CoursePlayer pdfMode />
    </ProtectedLayout>
  );
}
