import { CourseContent } from "@/components/course-content";
import { PrintButton } from "@/components/print-button";
import { mockCourses } from "@/lib/mock-data";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CoursePdfPage({ params }: PageProps) {
  const { id } = await params;
  const course = mockCourses.find((item) => item.id === id) ?? mockCourses[0];

  return (
    <main className="bg-white py-6 print:py-0">
      <div className="print-hidden mx-auto mb-6 flex max-w-3xl justify-end px-5">
        <PrintButton />
      </div>
      {course.structuredLesson ? (
        <CourseContent images={course.images} lesson={course.structuredLesson} showAnswers={false} />
      ) : (
        <div className="mx-auto max-w-3xl rounded-lg border p-10 text-center text-muted-foreground">
          Course content is not ready for PDF.
        </div>
      )}
    </main>
  );
}
