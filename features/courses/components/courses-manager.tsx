"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, FileText, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import type { CourseListItem, CourseStatus } from "@/lib/contracts/api";

const statusCopy: Record<CourseStatus, string> = {
  draft: "草稿",
  building_resources: "生成资源中",
  ready: "待发布",
  build_failed: "生成失败",
  published: "已发布",
};

const statusVariant: Record<CourseStatus, "secondary" | "info" | "warning" | "destructive" | "success"> = {
  draft: "secondary",
  building_resources: "info",
  ready: "warning",
  build_failed: "destructive",
  published: "success",
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

function coursePrimaryPath(course: CourseListItem) {
  return course.status === "published" ? `/courses/${course.id}/create/preview` : course.nextEditPath;
}

export function CoursesManager() {
  const [courses, setCourses] = useState<CourseListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<CourseListItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const courseCount = courses.length;

  async function loadCourses() {
    setIsLoading(true);
    setError("");

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

  async function handleDelete() {
    if (!pendingDelete) {
      return;
    }

    setIsDeleting(true);
    setDeleteError("");

    try {
      const response = await fetch(`/api/courses/${pendingDelete.id}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error("课程删除失败");
      }

      setCourses((current) => current.filter((course) => course.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch {
      setDeleteError("课程删除失败，请稍后重试。");
    } finally {
      setIsDeleting(false);
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
    <section className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <p className="text-sm text-muted-foreground">管理已生成和制作中的课程。</p>
        </div>
        <Button asChild className="w-full sm:w-auto">
          <Link href="/courses/new">
            <Plus className="size-4" />
            新建课程
          </Link>
        </Button>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex items-center gap-3 text-muted-foreground">
              <Spinner size="sm" />
              <span className="text-sm">正在加载课程列表...</span>
            </div>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">课程列表加载失败</h2>
            <p className="mt-2 text-sm text-muted-foreground">{error}</p>
            <Button className="mt-6" onClick={() => void loadCourses()} type="button" variant="outline">
              <RefreshCw className="size-4" />
              重试
            </Button>
          </CardContent>
        </Card>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="还没有课程"
          description="创建课程后，即可在这里编辑和预览。"
          action={
            <Button asChild>
              <Link href="/courses/new">新建课程</Link>
            </Button>
          }
        />
      ) : (
        <>
        <div className="grid gap-3 lg:hidden">
          {courses.map((course) => (
            <Card className="overflow-hidden" key={course.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="line-clamp-2 text-base font-semibold text-foreground">{course.title}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(course.updatedAt)}</p>
                  </div>
                  <Badge variant={statusVariant[course.status]}>{statusCopy[course.status]}</Badge>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0 rounded-lg bg-violet-50 p-3 ring-1 ring-violet-100">
                    <dt className="text-xs text-muted-foreground">老师</dt>
                    <dd className="mt-1 truncate font-semibold text-violet-950">{course.teacherName || "未选择老师"}</dd>
                  </div>
                  <div className="min-w-0 rounded-lg bg-emerald-50 p-3 ring-1 ring-emerald-100">
                    <dt className="text-xs text-muted-foreground">等级</dt>
                    <dd className="mt-1 truncate font-semibold text-emerald-950">{course.englishLevel}</dd>
                  </div>
                  <div className="col-span-2 min-w-0 rounded-lg bg-sky-50 p-3 ring-1 ring-sky-100">
                    <dt className="text-xs text-muted-foreground">学生</dt>
                    <dd className="mt-1 truncate font-semibold text-sky-950">{course.studentNames.join(" / ") || "未选择学生"}</dd>
                  </div>
                  <div className="col-span-2 min-w-0 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-100">
                    <dt className="text-xs text-muted-foreground">故事题目</dt>
                    <dd className="mt-1 line-clamp-2 font-semibold text-amber-950">{course.storyTitle || "未生成故事"}</dd>
                  </div>
                </dl>

                <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={coursePrimaryPath(course)}>编辑</Link>
                  </Button>
                  {course.status === "published" ? (
                    <Button asChild size="sm">
                      <Link href={`/courses/${course.id}`}>授课</Link>
                    </Button>
                  ) : course.lessonDraftExists ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/courses/${course.id}/create/preview`}>预览</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>
                      预览
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`删除课程 ${course.title}`}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setDeleteError("");
                      setPendingDelete(course);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="hidden overflow-hidden lg:block">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-sm">
              <thead className="bg-secondary/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">课程</th>
                  <th className="px-5 py-3">老师</th>
                  <th className="px-5 py-3">学生</th>
                  <th className="px-5 py-3">等级</th>
                  <th className="px-5 py-3">故事题目</th>
                  <th className="px-5 py-3">状态</th>
                  <th className="px-5 py-3">更新时间</th>
                  <th className="px-5 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {courses.map((course) => (
                  <tr className="transition-colors duration-200 hover:bg-secondary/30" key={course.id}>
                    <td className="max-w-[260px] px-5 py-4">
                      <div className="truncate font-medium text-foreground">{course.title}</div>
                    </td>
                    <td className="px-5 py-4"><span className="inline-flex max-w-[150px] items-center rounded-lg bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-950 ring-1 ring-violet-100"><span className="truncate">{course.teacherName || "未选择老师"}</span></span></td>
                    <td className="px-5 py-4"><span className="inline-flex max-w-[190px] items-center rounded-lg bg-sky-50 px-2.5 py-1.5 font-semibold text-sky-950 ring-1 ring-sky-100"><span className="truncate">{course.studentNames.join(" / ") || "未选择学生"}</span></span></td>
                    <td className="px-5 py-4"><span className="inline-flex max-w-[120px] items-center rounded-lg bg-emerald-50 px-2.5 py-1.5 font-semibold text-emerald-950 ring-1 ring-emerald-100"><span className="truncate">{course.englishLevel}</span></span></td>
                    <td className="max-w-[220px] px-5 py-4"><div className="rounded-lg bg-amber-50 px-2.5 py-1.5 font-semibold text-amber-950 ring-1 ring-amber-100"><div className="truncate">{course.storyTitle || "未生成故事"}</div></div></td>
                    <td className="px-5 py-4">
                      <Badge variant={statusVariant[course.status]}>
                        {statusCopy[course.status]}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatDate(course.updatedAt)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Button asChild size="sm" variant="outline">
                          <Link
                            href={
                              coursePrimaryPath(course)
                            }
                          >
                            编辑
                          </Link>
                        </Button>
                        {course.status === "published" ? (
                          <Button asChild size="sm">
                            <Link href={`/courses/${course.id}`}>授课</Link>
                          </Button>
                        ) : course.lessonDraftExists ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/courses/${course.id}/create/preview`}>预览</Link>
                          </Button>
                        ) : (
                          <span title="请先生成课文草稿">
                            <Button size="sm" variant="outline" disabled>
                              预览
                            </Button>
                          </span>
                        )}
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`删除课程 ${course.title}`}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => {
                            setDeleteError("");
                            setPendingDelete(course);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-medium text-foreground">第 1 页</span>
            <span className="mx-2 text-slate-300">/</span>
            <span>共 1 页</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>已显示 {courseCount} 门课程</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button size="sm" variant="outline" disabled>
              <ChevronLeft className="size-4" />
              上一页
            </Button>
            <Button size="sm" variant="outline" disabled>
              下一页
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        </>
      )}

      {pendingDelete ? (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-foreground/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
            <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <Trash2 className="size-5" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">删除课程“{pendingDelete.title}”？</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              删除后将同时清除该课程的故事方案、课文草稿、资源方案、版式配置和已生成图片，且无法恢复。
            </p>
            {deleteError ? (
              <p className="mt-3 text-sm text-destructive">{deleteError}</p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPendingDelete(null)}
                disabled={isDeleting}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={isDeleting}
                loading={isDeleting}
              >
                确认删除
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
