import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl content-center gap-10 px-5 py-12 md:grid-cols-[1fr_420px]">
      <section className="space-y-7">
        <div className="space-y-4">
          <h1 className="max-w-3xl text-5xl font-semibold leading-tight tracking-normal text-foreground">
            PBL Studio
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
            面向英语教师的 AI 绘本课程生成系统：从学生档案到 Lesson Text、图片资源、HTML Preview 和学生版打印 PDF。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/students">
              <GraduationCap className="h-4 w-4" />
              Manage students
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/courses">
              <BookOpen className="h-4 w-4" />
              View courses
            </Link>
          </Button>
        </div>
      </section>
      <section className="rounded-lg border bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold">MVP workflow</h2>
        <ol className="mt-5 space-y-4 text-sm text-muted-foreground">
          {[
            "Create or select a student.",
            "Create a course brief.",
            "Generate three story options.",
            "Generate editable Lesson Text.",
            "Confirm and build image resources.",
            "Preview or print the student PDF.",
          ].map((item, index) => (
            <li className="flex gap-3" key={item}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
