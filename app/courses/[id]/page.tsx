import { CoursePlayer } from "@/components/course-player";
import { ProtectedLayout } from "@/components/protected-layout";

export default function CoursePage() {
  return (
    <ProtectedLayout>
      <CoursePlayer />
    </ProtectedLayout>
  );
}
