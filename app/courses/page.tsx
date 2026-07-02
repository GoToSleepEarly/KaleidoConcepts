import Link from "next/link";
import { FileText, Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { mockCourse } from "@/lib/mock-course-data";

export default function CoursesPage() {
  return (
    <AppShell activeKey="courses">
      <div className="min-h-dvh bg-white px-8 py-8">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">课程列表</h1>
            <p className="mt-3 text-sm text-slate-500">当前为前端 mock 数据，接口协议保持真实形态。</p>
          </div>
          <Button asChild className="bg-violet-600 hover:bg-violet-700">
            <Link href="/courses/new">
              <Plus className="size-4" />
              新建课程
            </Link>
          </Button>
        </header>
        <section className="max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">{mockCourse.title}</h2>
              <p className="mt-2 text-sm text-slate-500">Summer / Tom / Lucy · A1 · Plants / Nature</p>
              <div className="mt-4 flex gap-3">
                <Button asChild variant="outline">
                  <Link href="/courses/123">课程预览</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/courses/123/pdf">PDF 预览</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
