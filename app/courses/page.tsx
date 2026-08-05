import { ProtectedLayout } from "@/components/protected-layout";
import { CoursesManager } from "@/features/courses/components/courses-manager";

export default function CoursesPage() {
  return (
    <ProtectedLayout>
      <CoursesManager legacyUrl={process.env.NEXT_PUBLIC_LEGACY_APP_URL} />
    </ProtectedLayout>
  );
}
