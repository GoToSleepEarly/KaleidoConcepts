import { ProtectedLayout } from "@/components/protected-layout";
import { CourseAudienceForm } from "@/features/courses/components/course-audience-form";

export default async function CourseAudiencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProtectedLayout><CourseAudienceForm courseId={id} /></ProtectedLayout>;
}
