import Link from "next/link";
import { FileText, Image, Printer } from "lucide-react";

import { CourseContent } from "@/components/course-content";
import { Button } from "@/components/ui/button";
import { mockCourses } from "@/lib/mock-data";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CoursePage({ params }: PageProps) {
  const { id } = await params;
  const course = mockCourses.find((item) => item.id === id) ?? mockCourses[0];
  const selected = { id: course.selectedStoryOptionId };

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link className="text-sm text-muted-foreground hover:underline" href="/courses">
            Courses
          </Link>
          <h1 className="mt-2 text-3xl font-semibold">{course.studentName} lesson</h1>
          <p className="mt-1 text-sm text-muted-foreground">Status: {course.status}</p>
        </div>
        <div className="print-hidden flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/courses/${course.id}/pdf`}>
              <Printer className="h-4 w-4" />
              Student PDF
            </Link>
          </Button>
          <Button type="button" variant="secondary">Cancel build</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <aside className="print-hidden space-y-4">
          <Panel title="Story options">
            <Button className="w-full" type="button">
              <FileText className="h-4 w-4" />
              Generate options mock
            </Button>
            <div className="mt-4 space-y-3">
              {course.storyOptions.map((option) => (
                <div className="rounded-md border p-3" key={option.id}>
                  <h3 className="text-sm font-semibold">{option.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{option.summary}</p>
                  <Button className="mt-3 w-full" type="button" variant={selected.id === option.id ? "default" : "outline"}>
                    {selected.id === option.id ? "Selected" : "Select mock"}
                  </Button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Lesson text">
            <Button className="w-full" type="button" variant="secondary">Generate Lesson Text mock</Button>
            <div className="mt-4 space-y-3">
              <textarea
                className="min-h-80 w-full rounded-md border bg-white px-3 py-2 font-mono text-sm leading-6 outline-none ring-primary focus:ring-2"
                defaultValue={course.lessonText}
                name="lessonText"
              />
              <Button className="w-full" type="button" variant="outline">Save text mock</Button>
            </div>
            <Button className="mt-3 w-full" type="button">
              <Image className="h-4 w-4" />
              Confirm and build mock
            </Button>
          </Panel>

          <Panel title="Image resources">
            <div className="space-y-2 text-sm">
              {course.images.map((image) => (
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2" key={image.id}>
                  <span>{image.sectionId} / {image.slotIndex}</span>
                  <span className="text-muted-foreground">{image.status}</span>
                </div>
              ))}
            </div>
          </Panel>
        </aside>

        <section>
          {course.structuredLesson ? (
            <CourseContent images={course.images} lesson={course.structuredLesson} showAnswers />
          ) : (
            <div className="rounded-lg border bg-white p-10 text-center text-muted-foreground">
              Generate and confirm Lesson Text to preview the course.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
