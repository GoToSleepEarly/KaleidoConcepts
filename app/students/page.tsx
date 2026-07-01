import { Archive, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mockStudents } from "@/lib/mock-data";

export default function StudentsPage() {
  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[360px_1fr]">
      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">New student</h1>
        <form className="mt-5 space-y-4">
          <Field label="English name" name="name" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Age" name="age" />
            <Field label="Grade" name="grade" />
          </div>
          <Field label="Interests" name="interests" required />
          <Field label="Personality" name="personality" />
          <Field label="Notes" name="notes" textarea />
          <Button className="w-full" type="button">
            <Plus className="h-4 w-4" />
            Add student mock
          </Button>
        </form>
      </section>
      <section>
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Students</h2>
            <p className="mt-1 text-sm text-muted-foreground">Archived students stay visible for historical courses.</p>
          </div>
        </div>
        <div className="grid gap-3">
          {mockStudents.map((student) => (
            <article className="rounded-lg border bg-white p-5 shadow-sm" key={student.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{student.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {[student.age && `${student.age} years old`, student.grade, student.interests].filter(Boolean).join(" / ")}
                  </p>
                  {student.notes ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{student.notes}</p> : null}
                </div>
                {student.archivedAt ? (
                  <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">Archived</span>
                ) : (
                  <Button aria-label={`Archive ${student.name}`} type="button" variant="ghost">
                    <Archive className="h-4 w-4" />
                  </Button>
                )}
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
  required,
  textarea,
}: {
  label: string;
  name: string;
  required?: boolean;
  textarea?: boolean;
}) {
  const className =
    "mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none ring-primary transition focus:ring-2";

  return (
    <label className="block text-sm font-medium">
      {label}
      {textarea ? (
        <textarea className={className} name={name} rows={4} />
      ) : (
        <input className={className} name={name} required={required} />
      )}
    </label>
  );
}
