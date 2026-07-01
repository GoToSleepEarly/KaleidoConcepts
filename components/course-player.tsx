"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, RefreshCw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mockCourse } from "@/lib/mock-course-data";
import { cn } from "@/lib/utils";

const outline = [
  { label: "Cover" },
  { label: "引导页" },
  { label: "Chapter 1", active: true, children: ["Page 1", "Page 2"] },
  { label: "Chapter 2", children: ["Page 3", "Page 4"] },
  { label: "Homework" },
  { label: "Answer Key" },
];

export function CoursePlayer({ pdfMode = false }: { pdfMode?: boolean }) {
  if (pdfMode) {
    return <PdfPreview />;
  }

  return (
    <div className="min-h-dvh bg-[#eef1f6] p-3">
      <div className="grid min-h-[calc(100dvh-24px)] overflow-hidden rounded-xl bg-white shadow-sm lg:grid-cols-[150px_1fr_260px]">
        <OutlineNav />
        <main className="min-w-0 border-x border-slate-200 bg-white">
          <header className="print-hidden flex h-16 items-center justify-between border-b border-slate-200 px-6">
            <h1 className="text-lg font-bold">Step 5 / 5 课程预览</h1>
            <div className="flex gap-3">
              <Button type="button" variant="outline">返回编辑</Button>
              <Button asChild className="bg-violet-600 hover:bg-violet-700">
                <Link href="/courses/123/pdf">
                  <Download className="size-4" />
                  导出 PDF
                </Link>
              </Button>
            </div>
          </header>
          <StoryCanvas />
        </main>
        <PlayerTools />
      </div>
    </div>
  );
}

function OutlineNav() {
  return (
    <aside className="print-hidden bg-white px-4 py-8 text-sm">
      <h2 className="mb-5 font-bold">课件大纲</h2>
      <nav className="space-y-1">
        {outline.map((item) => (
          <div key={item.label}>
            <button
              className={cn(
                "w-full rounded-md px-3 py-2 text-left text-slate-700",
                item.active && "bg-violet-50 text-violet-700",
              )}
              type="button"
            >
              {item.label}
            </button>
            {item.children ? (
              <div className="ml-4 mt-1 space-y-1">
                {item.children.map((child) => (
                  <button className="block w-full rounded-md px-3 py-1.5 text-left text-xs text-slate-500" key={child} type="button">
                    {child}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function StoryCanvas() {
  return (
    <article className="mx-auto max-w-4xl px-8 py-8">
      <section className="mb-8">
        <h2 className="mb-4 text-xl font-bold">Introduction</h2>
        <p className="max-w-2xl text-pretty text-sm leading-7 text-slate-700">{mockCourse.structuredLesson.intro}</p>
      </section>
      <div className="mb-9 grid max-w-3xl grid-cols-2 gap-5">
        {mockCourse.images.slice(0, 2).map((image) => (
          <div
            className="aspect-[4/3] rounded-lg bg-cover bg-center shadow-sm"
            key={image.id}
            style={{ backgroundImage: `url(${image.url})` }}
          />
        ))}
      </div>
      <section className="max-w-2xl">
        <h2 className="mb-4 text-xl font-bold">Section 1: The Problem</h2>
        <p className="text-pretty text-sm leading-7 text-slate-700">
          One day, Rosie's friend, a little bird, came to her.
          <br />
          “Rosie, my nest is in the big tree, but I can't get there. I'm too scared to fly!”
          <br />
          Rosie wanted to help, but she was scared of heights.
        </p>
      </section>
    </article>
  );
}

function PlayerTools() {
  return (
    <aside className="print-hidden space-y-5 bg-white p-5">
      <section className="rounded-xl border border-slate-200 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">图片操作</h2>
          <X className="size-4 text-slate-400" />
        </div>
        <div className="space-y-4">
          {mockCourse.images.slice(0, 2).map((image) => (
            <div className="flex items-center gap-3" key={image.id}>
              <div className="size-16 rounded-md bg-cover bg-center" style={{ backgroundImage: `url(${image.url})` }} />
              <Button className="h-9 flex-1" type="button" variant="outline">
                <RefreshCw className="size-4" />
                重新生成
              </Button>
            </div>
          ))}
        </div>
      </section>
      <section className="rounded-xl border border-slate-200 p-4">
        <h2 className="mb-2 font-bold">答案查看</h2>
        <p className="mb-4 text-xs text-slate-500">点击题目编号查看答案</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, index) => (
            <button className="size-8 rounded-full border border-slate-200 text-sm text-slate-600" key={index} type="button">
              {index + 1}
            </button>
          ))}
        </div>
        <Button className="mt-5 w-full bg-violet-600 hover:bg-violet-700" type="button">显示答案</Button>
      </section>
    </aside>
  );
}

function PdfPreview() {
  return (
    <div className="min-h-dvh bg-[#e8ebf0] px-8 py-8">
      <div className="print-hidden mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-full bg-white px-4 py-2 shadow-sm">
        <div className="flex items-center gap-3 text-slate-500">
          <ChevronLeft className="size-4" />
          <ChevronRight className="size-4" />
          <RefreshCw className="size-4" />
        </div>
        <div className="rounded-full bg-slate-100 px-40 py-2 text-center text-sm text-slate-500">/course/123/pdf</div>
        <div className="text-sm text-slate-700">1 / 18</div>
      </div>
      <article className="mx-auto min-h-[920px] max-w-[760px] bg-white px-20 py-16 shadow-sm print:min-h-0 print:shadow-none">
        <h1 className="mb-8 text-3xl font-bold">{mockCourse.title}</h1>
        <h2 className="mb-3 text-lg font-bold">Introduction</h2>
        <p className="mb-8 text-pretty text-sm leading-7">{mockCourse.structuredLesson.intro}</p>
        <div className="mb-8 grid grid-cols-2 gap-5">
          {mockCourse.images.slice(0, 2).map((image) => (
            <div className="aspect-[4/3] rounded-md bg-cover bg-center" key={image.id} style={{ backgroundImage: `url(${image.url})` }} />
          ))}
        </div>
        <h2 className="mb-3 text-lg font-bold">Section 1: The Problem</h2>
        <p className="text-sm leading-7">
          One day, Rosie's friend, a little bird, came to her.
          <br />
          “Rosie, my nest is in the big tree, but I can't get there. I'm too scared to fly!”
          <br />
          Rosie wanted to help, but she was scared of heights.
        </p>
      </article>
    </div>
  );
}
