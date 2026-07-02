import { CoursePlayer } from "@/components/course-player";
import { ProtectedLayout } from "@/components/protected-layout";

export default function CoursePdfPage() {
  return (
    <ProtectedLayout>
      <CoursePlayer pdfMode />
    </ProtectedLayout>
  );
}
