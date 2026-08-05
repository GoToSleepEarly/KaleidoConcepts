"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Clock3, ExternalLink, Plus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { CourseListItem } from "@/lib/contracts/api";

const stageLabels: Record<CourseListItem["currentStage"], string> = {
  audience: "授课对象",
  story_outline: "故事大纲",
  teaching_plan: "教学规划",
  content: "文案与练习",
  visual_resources: "视觉资源",
  preview: "预览发布",
};

export function CoursesManager({ legacyUrl }: { legacyUrl?: string }) {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/courses", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { courses?: CourseListItem[]; message?: string };
        if (!response.ok) throw new Error(data.message || "课程列表加载失败");
        return data.courses ?? [];
      })
      .then(setCourses)
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "课程列表加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-primary">课程工作台</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-foreground">从授课对象开始，逐步完成一门课程</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">新系统只显示新课程。旧课程保留在冻结的 V1 系统中。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {legacyUrl ? <Button asChild variant="outline"><a href={legacyUrl} rel="noreferrer" target="_blank"><ExternalLink className="size-4" />旧版课程</a></Button> : null}
          <Button asChild><Link href="/courses/new"><Plus className="size-4" />新建课程</Link></Button>
        </div>
      </section>

      {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

      <section className="overflow-hidden rounded-lg bg-card shadow-sm">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border px-5 py-3 text-xs font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_160px_180px_auto]">
          <span>课程</span><span className="hidden sm:block">授课对象</span><span className="hidden sm:block">当前阶段</span><span className="sr-only">操作</span>
        </div>
        <div className="divide-y divide-border">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div className="flex items-center gap-4 px-5 py-5" key={index}><div className="skeleton size-10 rounded-md" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-48 rounded" /><div className="skeleton h-3 w-72 max-w-full rounded" /></div></div>) : null}
          {!loading && courses.map((course) => (
            <article className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-5 transition-colors hover:bg-muted/35 sm:grid-cols-[minmax(0,1fr)_160px_180px_auto]" key={course.id}>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary"><BookOpen className="size-5" /></span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{course.title}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="size-3.5" />{course.durationMinutes} 分钟 · 更新于 {new Date(course.updatedAt).toLocaleDateString("zh-CN")}</p>
                </div>
              </div>
              <div className="hidden min-w-0 sm:block">
                <p className="truncate text-sm text-foreground">{course.teacherName || "未选择老师"}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{course.studentNames.join("、") || "未选择学生"}</p>
              </div>
              <div className="hidden sm:block">
                <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700">{stageLabels[course.currentStage]}</span>
              </div>
              <Button asChild size="sm" variant="ghost"><Link href={course.nextEditPath}>继续<ArrowRight className="size-4" /></Link></Button>
            </article>
          ))}
        </div>
        {!loading && !courses.length ? (
          <div className="p-8">
            <EmptyState action={<Button asChild><Link href="/courses/new"><Plus className="size-4" />创建第一门课程</Link></Button>} description="先确认这节课由谁上、给谁上以及上多久。" icon={UsersRound} title="还没有新系统课程" />
          </div>
        ) : null}
      </section>
    </div>
  );
}
