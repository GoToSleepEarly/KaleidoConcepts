import { ProtectedLayout } from "@/components/protected-layout";
import { StudentsManager } from "@/components/students-manager";

export default function StudentsPage() {
  return (
    <ProtectedLayout>
      <StudentsManager />
    </ProtectedLayout>
  );
}
