"use client";

import React, { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, ChevronLeft, ChevronRight, Clock3, Loader2, Plus, Search, Trash2, UsersRound, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { CourseListItem, CoursesListResponse } from "@/lib/contracts/api";
import { readJsonResponse } from "@/lib/utils/response-json";

const stageLabels: Record<CourseListItem["currentStage"], string> = {
  audience: "基础信息",
  story_outline: "故事大纲",
  teaching_plan: "教学规划",
  content: "文案与练习",
  visual_resources: "视觉资源",
  preview: "预览发布",
};

const stageSteps: Record<CourseListItem["currentStage"], number> = {
  audience: 1,
  story_outline: 2,
  teaching_plan: 3,
  content: 4,
  visual_resources: 5,
  preview: 6,
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function editPath(course: CourseListItem) {
  return course.lifecycleStatus === "published" ? `/courses/${course.id}/create/preview` : course.nextEditPath;
}

export function CoursesManager() {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courseToDelete, setCourseToDelete] = useState<CourseListItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("query", query);
    fetch(`/api/courses?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await readJsonResponse<CoursesListResponse & { message?: string }>(response);
        if (!response.ok) throw new Error(data.message || "课程列表加载失败");
        return data;
      })
      .then((data) => {
        setCourses(data.courses ?? []);
        setTotal(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "课程列表加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, query]);

  function searchCourses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPage(1);
    setQuery(queryInput.trim());
  }

  function clearSearch() {
    setQueryInput("");
    setLoading(true);
    setPage(1);
    setQuery("");
  }

  async function deleteCourse() {
    if (!courseToDelete) return;
    setDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseToDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await readJsonResponse<{ message?: string }>(response);
        throw new Error(data.message || "课程删除失败，请重试");
      }
      setCourses((current) => current.filter((course) => course.id !== courseToDelete.id));
      setTotal((current) => Math.max(0, current - 1));
      setCourseToDelete(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "课程删除失败，请重试");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <form className="flex w-full max-w-md items-center gap-2 max-sm:max-w-none max-sm:flex-col max-sm:items-stretch" onSubmit={searchCourses} role="search">
          <label className="relative min-w-0 flex-1 max-sm:w-full">
            <span className="sr-only">搜索课程</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#7890A7]" />
            <input aria-label="搜索课程" className="h-10 w-full rounded-lg border border-[#D7E5F1] bg-white pl-9 pr-9 text-sm text-[#19324D] outline-none placeholder:text-[#7890A7] focus:border-[#7A88EF] focus:ring-2 focus:ring-[#DDE2FF]" onChange={(event) => setQueryInput(event.target.value)} placeholder="搜索课程名称或故事名称" role="searchbox" value={queryInput} />
            {queryInput ? <button aria-label="清除搜索" className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[#7890A7] hover:bg-[#EEF3F8] hover:text-[#38536E]" onClick={clearSearch} type="button"><X className="size-4" /></button> : null}
          </label>
          <Button className="max-sm:min-h-11 max-sm:w-full" type="submit" variant="outline">搜索</Button>
        </form>
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild><Link href="/courses/new"><Plus className="size-4" />新建课程</Link></Button>
        </div>
      </section>

      {error ? <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</div> : null}

      <section className="overflow-hidden rounded-xl bg-white shadow-[0_2px_8px_rgba(46,78,108,0.08)]" data-testid="courses-list">
        <div className="hidden min-h-14 grid-cols-[minmax(210px,1.5fr)_minmax(160px,1fr)_120px_120px_125px_184px] items-center gap-3 border-b border-[#CCD8F8] bg-[#E9EEFF] px-5 py-3.5 text-sm font-bold text-[#30459E] xl:grid">
          <span className="pl-[52px]">课程信息</span><span>授课对象</span><span>教学配置</span><span>制作进度</span><span>状态与更新</span><span className="text-center">操作</span>
        </div>
        <div className="divide-y divide-[#E5EFF7]">
          {loading ? Array.from({ length: 3 }).map((_, index) => <div className="flex items-center gap-4 px-5 py-5" key={index}><div className="skeleton size-10 rounded-md" /><div className="flex-1 space-y-2"><div className="skeleton h-4 w-48 rounded" /><div className="skeleton h-3 w-72 max-w-full rounded" /></div></div>) : null}
          {!loading && courses.map((course) => (
            <article className="grid gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-[#F8FBFE] sm:grid-cols-2 lg:px-5 xl:min-h-20 xl:grid-cols-[minmax(210px,1.5fr)_minmax(160px,1fr)_120px_120px_125px_184px] xl:items-center xl:gap-3 xl:py-3.5" key={course.id}>
              <div className="flex min-w-0 items-center gap-3 sm:col-span-2 xl:col-span-1">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#EEF0FF] text-[#5365EC] xl:size-10 xl:rounded-xl"><BookOpen className="size-[18px] xl:size-5" /></span>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-semibold text-[#19324D]" title={course.title}>{course.title}</h3>
                  <p className="mt-1 truncate text-[13px] text-[#69829B]" title={course.storyTitle ?? "未生成故事"}>故事 · {course.storyTitle ?? "未生成故事"}</p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#7890A7] xl:hidden">授课对象</p>
                <p className="mt-1 truncate text-sm font-medium text-[#2D4964] xl:mt-0" title={course.teacherName || "未选择老师"}>老师 · {course.teacherName || "未选择老师"}</p>
                <p className="mt-1 truncate text-[13px] text-[#69829B]" title={course.studentNames.join("、") || "未选择学生"}>学生 · {course.studentNames.join("、") || "未选择学生"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-[#7890A7] xl:hidden">教学配置</p>
                <p className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-[#2D4964] xl:mt-0"><Clock3 className="size-4 text-[#5365EC]" /><span>{course.englishLevel ?? "未设置"} · {course.durationMinutes} 分钟</span></p>
              </div>
              <div className="min-w-0"><p className="text-xs font-medium text-[#7890A7] xl:hidden">制作进度</p><p className="mt-1 truncate text-sm font-semibold tabular-nums text-[#4659DC] xl:mt-0">Step {stageSteps[course.currentStage]}/6</p><p className="mt-1 truncate text-[13px] text-[#69829B]">{stageLabels[course.currentStage]}</p></div>
              <div><p className="text-xs font-medium text-[#7890A7] xl:hidden">状态与更新</p><div className="mt-1 flex items-center gap-2 xl:mt-0 xl:block"><Badge variant={course.lifecycleStatus === "published" ? "success" : "secondary"}>{course.lifecycleStatus === "published" ? "已发布" : "草稿"}</Badge><p className="text-xs tabular-nums text-[#69829B] xl:mt-2">{formatDate(course.updatedAt)}</p></div></div>
              <div className="flex items-center gap-1 self-center sm:col-span-2 sm:justify-end max-sm:grid max-sm:w-full max-sm:grid-cols-[1fr_1fr_44px] max-sm:gap-2 xl:col-span-1 xl:justify-end" data-testid={`course-row-actions-${course.id}`}>
                <Button asChild className="max-sm:min-h-11 max-sm:w-full" size="sm" variant="outline"><Link href={editPath(course)}>编辑</Link></Button>
                {course.lifecycleStatus === "published" ? <Button asChild className="max-sm:min-h-11 max-sm:w-full" size="sm"><Link href={`/courses/${course.id}`} rel="noopener noreferrer" target="_blank">授课</Link></Button> : course.lessonDraftExists ? <Button asChild className="max-sm:min-h-11 max-sm:w-full" size="sm" variant="outline"><Link href={`/courses/${course.id}/create/preview`}>预览</Link></Button> : <span className="max-sm:w-full" title="请先生成课文草稿"><Button aria-disabled="true" className="max-sm:min-h-11 max-sm:w-full" disabled size="sm" variant="outline">预览</Button></span>}
                <Button aria-label={`删除课程 ${course.title}`} className="max-sm:h-11 max-sm:w-11" onClick={() => setCourseToDelete(course)} size="icon-sm" title="删除课程" type="button" variant="ghost"><Trash2 className="size-4" /></Button>
              </div>
            </article>
          ))}
        </div>
        {!loading && !courses.length ? (
          <div className="p-8">
            <EmptyState action={<Button asChild><Link href="/courses/new"><Plus className="size-4" />创建第一门课程</Link></Button>} icon={UsersRound} title="还没有课程" />
          </div>
        ) : null}
        {!loading && total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#DCEAF6] bg-[#F8FBFE] px-4 py-3 max-sm:justify-center sm:px-5" data-testid="courses-pagination">
          <span className="text-[13px] font-medium text-[#69829B]">共 {total} 门课程</span>
          <div className="flex items-center gap-2 max-sm:w-full max-sm:justify-between" data-testid="courses-pagination-controls">
            <Button aria-label="上一页" className="max-sm:h-11 max-sm:w-11" disabled={page <= 1} onClick={() => { setLoading(true); setPage((current) => current - 1); }} size="icon-sm" type="button" variant="outline"><ChevronLeft className="size-4" /></Button>
            <span className="min-w-20 text-center text-[13px] font-semibold tabular-nums text-[#38536E]">第 {page} / {totalPages} 页</span>
            <Button aria-label="下一页" className="max-sm:h-11 max-sm:w-11" disabled={page >= totalPages} onClick={() => { setLoading(true); setPage((current) => current + 1); }} size="icon-sm" type="button" variant="outline"><ChevronRight className="size-4" /></Button>
          </div>
          </div>
        ) : null}
      </section>
      <Dialog description={courseToDelete ? `“${courseToDelete.title}”将从课程列表移除。课程内容和已生成图片会保留，避免误删核心资产。` : ""} onClose={() => { if (!deleting) setCourseToDelete(null); }} open={Boolean(courseToDelete)} title="删除这门课程？"><div className="flex justify-end gap-2 p-4"><Button disabled={deleting} onClick={() => setCourseToDelete(null)} type="button" variant="outline">保留课程</Button><Button disabled={deleting} onClick={() => void deleteCourse()} type="button" variant="destructive">{deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}{deleting ? "正在删除" : "删除课程"}</Button></div></Dialog>
    </div>
  );
}
