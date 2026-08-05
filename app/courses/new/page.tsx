import { ProtectedLayout } from "@/components/protected-layout";
import { CourseAudienceForm } from "@/features/courses/components/course-audience-form";

export default function NewCoursePage() {
  return <ProtectedLayout><CourseAudienceForm /></ProtectedLayout>;
}
