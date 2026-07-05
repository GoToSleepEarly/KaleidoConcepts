import { ProtectedLayout } from "@/components/protected-layout";
import { CoursesManager } from "@/features/courses/components/courses-manager";

export default function CoursesPage() {
  return (
    <ProtectedLayout>
      <CoursesManager />
    </ProtectedLayout>
  );
}
