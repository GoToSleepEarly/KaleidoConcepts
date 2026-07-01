import Link from "next/link";
import { Archive, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mockCourses, mockStudents } from "@/lib/mock-data";

export default function CoursesPage() {
  const activeStudents = mockStudents.filter((student) => !student.archivedAt);

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">New course</h1>
        <form className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Student
            <select className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" name="studentId" required>
              <option value="">Select student</option>
              {activeStudents.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </select>
          </label>
          <Field label="CEFR level" name="cefrLevel" placeholder="A1" required />
          <Field label="Knowledge points" name="knowledgePoints" placeholder="simple past, weather words" required />
          <Field label="Target vocabulary" name="targetVocabulary" />
          <Field label="Theme / scenario" name="theme" />
          <Field label="Special requirements" name="specialRequirements" textarea />
          <Button className="w-full" type="button">
            <Plus className="h-4 w-4" />
            Create course mock
          </Button>
        </form>
      </section>
      <section>
        <h2 className="text-2xl font-semibold">Courses</h2>
        <div className="mt-4 grid gap-3">
          {mockCourses.map((course) => (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={course.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <Link className="font-semibold hover:underline" href={`/courses/${course.id}`}>
                    {course.studentName} course
                  </Link>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {course.status} / updated {course.updatedAt}
                  </p>
                </div>
                {course.status !== "archived" ? (
                  <Button aria-label="Archive course" type="button" variant="ghost">
                    <Archive className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  placeholder,
  required,
  textarea,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const className = "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none ring-primary transition focus:ring-2";

  return (
    <label className="block text-sm font-medium">
      {label}
      {textarea ? (
        <textarea className={className} name={name} rows={4} />
      ) : (
        <input className={className} name={name} placeholder={placeholder} required={required} />
      )}
    </label>
  );
}
