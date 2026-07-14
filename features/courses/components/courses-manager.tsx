"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, FileText, Plus, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CourseListItem, CourseStatus } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const statusCopy: Record<CourseStatus, string> = {
  draft: "草稿",
  building_resources: "生成资源中",
  ready: "待发布",
  build_failed: "生成失败",
  published: "已发布",
};

const statusStyle: Record<CourseStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  building_resources: "bg-blue-50 text-blue-700",
  ready: "bg-amber-50 text-amber-700",
  build_failed: "bg-red-50 text-red-700",
  published: "bg-emerald-50 text-emerald-700",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CoursesManager() {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadCourses({ showLoading = true }: { showLoading?: boolean } = {}) {
    if (showLoading) {
      setIsLoading(true);
      setError("");
    }

    try {
      const response = await fetch("/api/courses");
      if (!response.ok) {
        throw new Error("课程列表加载失败");
      }

      const data = (await response.json()) as { courses: CourseListItem[] };
      setCourses(data.courses);
    } catch {
      setError("课程列表加载失败，请稍后重试。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isActive = true;

    async function loadInitialCourses() {
      try {
        const response = await fetch("/api/courses");
        if (!response.ok) {
          throw new Error("课程列表加载失败");
        }

        const data = (await response.json()) as { courses: CourseListItem[] };

        if (isActive) {
          setCourses(data.courses);
        }
      } catch {
        if (isActive) {
          setError("课程列表加载失败，请稍后重试。");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadInitialCourses();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-6">
        <p className="text-sm text-slate-500">管理已生成和制作中的课程。</p>
        <Button asChild className="bg-violet-600 text-white hover:bg-violet-700">
          <Link href="/courses/new">
            <Plus className="size-4" />
            新建课程
          </Link>
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">正在加载课程列表...</div>
        ) : error ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">课程列表加载失败</h2>
            <p className="mt-2 text-sm text-slate-500">{error}</p>
            <Button className="mt-6" onClick={() => void loadCourses()} type="button" variant="outline">
              <RefreshCw className="size-4" />
              重试
            </Button>
          </div>
        ) : courses.length === 0 ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-violet-50 text-violet-700">
              <FileText className="size-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-950">还没有课程</h2>
            <p className="mt-2 text-sm text-slate-500">创建课程后，即可在这里编辑和预览。</p>
            <Button asChild className="mt-6 bg-violet-600 text-white hover:bg-violet-700">
              <Link href="/courses/new">新建课程</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-normal text-slate-500">
                <tr>
                  <th className="px-5 py-3">课程</th>
                  <th className="px-5 py-3">老师</th>
                  <th className="px-5 py-3">学生</th>
                  <th className="px-5 py-3">等级</th>
                  <th className="px-5 py-3">主题</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">更新时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB]">
                {courses.map((course) => (
                  <tr className="transition-colors duration-200 hover:bg-slate-50/80" key={course.id}>
                    <td className="max-w-[260px] px-5 py-4">
                      <div className="truncate font-medium text-slate-950">{course.title}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{course.teacherName || "未选择老师"}</td>
                    <td className="px-5 py-4 text-slate-600">{course.studentNames.join(" / ") || "未选择学生"}</td>
                    <td className="px-5 py-4 text-slate-600">{course.englishLevel}</td>
                    <td className="max-w-[220px] px-5 py-4 text-slate-600">
                      <div className="truncate">{course.theme}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn("inline-flex h-7 items-center rounded-full px-3 text-xs font-medium", statusStyle[course.status])}>
                        {statusCopy[course.status]}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500">{formatDate(course.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button asChild className="h-8 px-3 text-xs" variant="outline">
                          <Link href={course.nextEditPath}>
                            编辑
                          </Link>
                        </Button>
                        <Button asChild className="h-8 px-3 text-xs" variant="outline">
                          <Link href={`/courses/${course.id}`}>预览</Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
