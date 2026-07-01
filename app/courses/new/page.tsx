import { AppShell } from "@/components/app-shell";
import { CourseCreationFlow } from "@/components/course-creation-flow";

export default function NewCoursePage() {
  return (
    <AppShell>
      <CourseCreationFlow />
    </AppShell>
  );
}
