"use client";

import Link from "next/link";
import Image from "next/image";
import React from "react";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, FileText, ImageIcon, Loader2, Printer, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CoursePreviewBlock, CoursePreviewPage, CoursePreviewResponse, LessonBlankDisplay } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type DocumentMode = "html" | "pdf";
type Audience = "teacher" | "student";
type PreviewSlide =
  | { id: string; kind: "cover"; page: Extract<CoursePreviewPage, { type: "cover" }> }
  | { id: string; kind: "chapter"; chapterIndex: number; chapterTitle: string }
  | { id: string; kind: "image"; page: Extract<CoursePreviewPage, { type: "lesson_shot" }> }
  | { id: string; kind: "practice"; page: Extract<CoursePreviewPage, { type: "lesson_shot" }> }
  | { id: string; kind: "closing"; page: Extract<CoursePreviewPage, { type: "closing_reading" }> };

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "课程预览加载失败");
  }

  return data;
}

function useCoursePreview(courseId: string) {
  const [data, setData] = useState<CoursePreviewResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoading(true);
      setError("");

      try {
        const result = (await readJson(await fetch(`/api/courses/${courseId}/preview`, { cache: "no-store" }))) as CoursePreviewResponse;
        if (active) {
          setData(result);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "课程预览加载失败");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [courseId]);

  return { data, error, isLoading };
}

function exerciseLabel(display: LessonBlankDisplay) {
  if (display.kind === "verb_blank") {
    return `verb: ${display.prompt}`;
  }

  return `${display.pattern} · ${display.letterCount} letters`;
}

function modeTextClass(mode: DocumentMode, size: "body" | "title" | "display") {
  if (mode === "pdf") {
    return size === "display" ? "text-5xl" : size === "title" ? "text-3xl" : "text-2xl";
  }

  return size === "display" ? "text-7xl" : size === "title" ? "text-5xl" : "text-3xl";
}

function buildSlides(pages: CoursePreviewPage[]): PreviewSlide[] {
  const slides: PreviewSlide[] = [];
  const seenChapters = new Set<string>();

  pages.forEach((page) => {
    if (page.type === "cover") {
      slides.push({ id: page.id, kind: "cover", page });
      return;
    }

    if (page.type === "lesson_shot") {
      if (!seenChapters.has(page.chapterId)) {
        seenChapters.add(page.chapterId);
        slides.push({ id: `${page.chapterId}-divider`, kind: "chapter", chapterIndex: page.chapterIndex, chapterTitle: page.chapterTitle });
      }
      slides.push({ id: `${page.id}-image`, kind: "image", page });
      slides.push({ id: `${page.id}-practice`, kind: "practice", page });
      return;
    }

    slides.push({ id: page.id, kind: "closing", page });
  });

  return slides;
}

function PreviewBlock({
  block,
  exercise,
  audience,
  mode,
}: {
  block: CoursePreviewBlock;
  exercise?: Extract<CoursePreviewPage, { type: "lesson_shot" }>["exercises"][number];
  audience: Audience;
  mode: DocumentMode;
}) {
  const [revealed, setRevealed] = useState(false);

  if (block.type === "text") {
    return <span className="whitespace-normal break-words">{block.text}</span>;
  }

  const canReveal = audience === "teacher" && exercise;

  return (
    <button
      type="button"
      aria-label={`blank ${exerciseLabel(block.display)}`}
      onClick={() => canReveal && setRevealed((current) => !current)}
      className={cn(
        "mx-1 inline-flex max-w-full align-baseline items-baseline border-0 border-b-[0.12em] border-[#2563EB] bg-transparent px-3 pb-0.5 text-left font-semibold leading-none text-[#1E3A8A] transition hover:bg-[#DBEAFE]",
        mode === "pdf" ? "min-w-20 text-xl shadow-none" : "min-w-28 text-2xl",
      )}
    >
      <span>{revealed && exercise ? exercise.answer : "________"}</span>
    </button>
  );
}

function CoursePreviewImageFrame({ page, fill = false }: { page: Extract<CoursePreviewPage, { type: "lesson_shot" }>; fill?: boolean }) {
  const { image } = page;

  if (image.publicUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-[#EEF2FF]", fill ? "absolute inset-0 flex items-center justify-center p-[4.5%]" : "aspect-[4/3]")}>
        <div className={cn("relative overflow-hidden bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]", fill ? "h-full max-h-full w-auto max-w-full aspect-[4/3]" : "absolute inset-0")}>
          <Image src={image.publicUrl} alt={page.title} fill sizes="(max-width: 1024px) 100vw, 1080px" className="object-contain" />
        </div>
        {image.stale ? (
          <span className="absolute right-8 top-8 bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950">内容已变化</span>
        ) : null}
      </div>
    );
  }

  const label = image.status === "failed" ? "图片生成失败" : image.status === "missing" ? "图片未生成" : "图片生成中";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border border-dashed border-[#93C5FD] bg-[#EFF6FF] text-[#1E3A8A]",
        fill ? "absolute inset-0" : "aspect-[4/3]",
      )}
    >
      <ImageIcon className="mb-5 size-14" />
      <p className="text-2xl font-bold">{label}</p>
      {image.failureReason ? <p className="mt-4 max-w-xl text-center text-base leading-7 text-rose-700">{image.failureReason}</p> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/15 bg-white/10 px-5 py-4">
      <dt className="text-xs font-semibold uppercase tracking-normal text-cyan-100/70">{label}</dt>
      <dd className="mt-1 text-lg font-bold text-white">{value}</dd>
    </div>
  );
}

function CoverPage({ data, mode }: { data: CoursePreviewResponse; mode: DocumentMode }) {
  return (
    <section id="cover" role="group" aria-label="Slide 1 cover" className="preview-slide preview-slide-cover">
      <div className="relative z-10 max-w-4xl">
        <p className="text-base font-bold uppercase text-cyan-200">Student Mission</p>
        <h1 className={cn("mt-5 text-balance font-black leading-[0.95] text-white", modeTextClass(mode, "display"))}>{data.pages[0]?.title}</h1>
        <p className="mt-5 text-2xl font-semibold text-cyan-100/85">{data.course.title}</p>
      </div>
      <dl className="relative z-10 mt-12 grid max-w-4xl gap-3 sm:grid-cols-3">
        <Info label="Teacher" value={data.course.teacherName ?? "-"} />
        <Info label="Students" value={data.course.studentNames.join(" / ") || "-"} />
        <Info label="Level" value={data.course.englishLevel} />
        <Info label="Theme" value={data.course.theme} />
        <Info label="Grammar" value={data.course.grammar.join(" / ")} />
        <Info label="Duration" value={`${data.course.durationMinutes} min`} />
      </dl>
    </section>
  );
}

function ChapterPage({ slide, mode }: { slide: Extract<PreviewSlide, { kind: "chapter" }>; mode: DocumentMode }) {
  return (
    <section id={slide.id} role="group" aria-label={`Slide chapter ${slide.chapterIndex}`} className="preview-slide preview-slide-cover">
      <div className="relative z-10">
        <p className="text-xl font-black uppercase text-cyan-200">Chapter {slide.chapterIndex}</p>
        <h2 className={cn("mt-5 max-w-5xl text-balance font-black leading-none text-white", mode === "pdf" ? "text-6xl" : "text-8xl")}>{slide.chapterTitle}</h2>
      </div>
    </section>
  );
}

function ImageSlide({ page, mode }: { page: Extract<CoursePreviewPage, { type: "lesson_shot" }>; mode: DocumentMode }) {
  return (
    <section id={`${page.id}-image`} role="group" aria-label={`Slide image ${page.chapterIndex}-${page.shotOrder}`} className="preview-slide preview-slide-image">
      <CoursePreviewImageFrame page={page} fill />
      <div className="absolute inset-x-0 bottom-0 h-1/4 bg-[linear-gradient(0deg,rgba(255,255,255,0.95)_0%,rgba(255,255,255,0.78)_54%,transparent_100%)]" />
      <div className="relative z-10 flex h-full flex-col justify-end p-10">
        <p className="text-sm font-black uppercase text-[#2563EB]">Story Scene</p>
        <h2 className={cn("mt-2 max-w-4xl text-balance font-black leading-none text-[#0F172A]", modeTextClass(mode, "title"))}>{page.chapterTitle}</h2>
        <p className="mt-3 max-w-3xl text-xl font-bold text-[#334155]">Page {page.shotOrder}</p>
      </div>
    </section>
  );
}

function PracticeSlide({ page, audience, mode }: { page: Extract<CoursePreviewPage, { type: "lesson_shot" }>; audience: Audience; mode: DocumentMode }) {
  const exercises = new Map(page.exercises.map((exercise) => [exercise.id, exercise]));

  return (
    <section id={`${page.id}-practice`} role="group" aria-label={`Slide practice ${page.chapterIndex}-${page.shotOrder}`} className="preview-slide preview-slide-practice">
      <div className="relative z-10 flex h-full flex-col p-12">
        <div>
          <p className="text-sm font-black uppercase text-[#2563EB]">Practice Mission</p>
          <h2 className={cn("mt-3 text-balance font-black leading-none text-[#0F172A]", modeTextClass(mode, "title"))}>{page.chapterTitle}</h2>
        </div>
        <div
          data-testid={`practice-copy-${page.id}`}
          className={cn(
            "mt-12 max-h-[62%] max-w-5xl overflow-hidden whitespace-normal break-words border-l-4 border-[#2563EB] bg-white/88 p-8 font-semibold leading-[1.42] text-[#0F172A] shadow-[0_16px_42px_rgba(15,23,42,0.12)]",
            modeTextClass(mode, "body"),
          )}
        >
          {page.blocks.map((block) => (
            <React.Fragment key={block.id}>
              <PreviewBlock block={block} audience={audience} mode={mode} exercise={block.type === "exercise" ? exercises.get(block.exerciseId) : undefined} />
              {block.type === "text" ? " " : null}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingPage({ page, mode }: { page: Extract<CoursePreviewPage, { type: "closing_reading" }>; mode: DocumentMode }) {
  return (
    <section id={page.id} role="group" aria-label="Slide closing reading" className="preview-slide preview-slide-closing">
      <div className="relative z-10 max-w-5xl">
        <p className="text-base font-black uppercase text-cyan-200">Closing Reading</p>
        <h2 className={cn("mt-3 text-balance font-black leading-none text-white", mode === "pdf" ? "text-5xl" : "text-6xl")}>{page.title}</h2>
        <p className={cn("mt-10 max-h-[46%] whitespace-normal break-words text-pretty font-semibold leading-[1.35] text-white/90", modeTextClass(mode, "body"))}>{page.text}</p>
      </div>
      <div className="relative z-10 mt-10 flex flex-wrap gap-3">
        {page.vocabularyTerms.map((term) => (
          <span key={term} className="border border-cyan-200/50 bg-cyan-200/15 px-4 py-2 text-lg font-bold text-cyan-50">
            {term}
          </span>
        ))}
      </div>
    </section>
  );
}

function renderSlide(slide: PreviewSlide, data: CoursePreviewResponse, audience: Audience, mode: DocumentMode) {
  if (slide.kind === "cover") {
    return <CoverPage key={slide.id} data={data} mode={mode} />;
  }

  if (slide.kind === "chapter") {
    return <ChapterPage key={slide.id} slide={slide} mode={mode} />;
  }

  if (slide.kind === "image") {
    return <ImageSlide key={slide.id} page={slide.page} mode={mode} />;
  }

  if (slide.kind === "practice") {
    return <PracticeSlide key={slide.id} page={slide.page} audience={audience} mode={mode} />;
  }

  if (slide.kind === "closing") {
    return <ClosingPage key={slide.id} page={slide.page} mode={mode} />;
  }

  return null;
}

export function CoursePreviewDocument({
  data,
  mode,
  audience,
  activeSlideIndex,
}: {
  data: CoursePreviewResponse;
  mode: DocumentMode;
  audience: Audience;
  activeSlideIndex?: number;
}) {
  const slides = buildSlides(data.pages);
  const renderedSlides = typeof activeSlideIndex === "number" ? slides.slice(activeSlideIndex, activeSlideIndex + 1) : slides;

  return (
    <article className={cn("preview-deck", mode === "pdf" ? "preview-deck-pdf" : "preview-deck-html")}>
      {renderedSlides.map((slide) => renderSlide(slide, data, audience, mode))}
    </article>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      <Loader2 className="mr-2 size-5 animate-spin" />
      加载课程预览...
    </div>
  );
}

function ErrorState({ message, courseId }: { message: string; courseId: string }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</p>
      <div className="mt-4 flex gap-3">
        <Button asChild variant="outline">
          <Link href={`/courses/${courseId}/create/lesson-draft`}>返回文稿</Link>
        </Button>
        <Button asChild>
          <Link href={`/courses/${courseId}/create/resources`}>返回资源生成</Link>
        </Button>
      </div>
    </div>
  );
}

function SlideNavigator({ currentSlide, totalSlides, onPrevious, onNext }: { currentSlide: number; totalSlides: number; onPrevious: () => void; onNext: () => void }) {
  return (
    <>
      <button
        type="button"
        aria-label="Previous slide"
        onClick={onPrevious}
        className="fixed left-6 top-1/2 z-30 flex size-12 -translate-y-1/2 items-center justify-center border border-white/20 bg-slate-950/70 text-3xl text-white shadow-lg backdrop-blur transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35"
        disabled={currentSlide === 0}
      >
        <ChevronLeft className="size-7" />
      </button>
      <button
        type="button"
        aria-label="Next slide"
        onClick={onNext}
        className="fixed right-6 top-1/2 z-30 flex size-12 -translate-y-1/2 items-center justify-center border border-white/20 bg-slate-950/70 text-3xl text-white shadow-lg backdrop-blur transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35"
        disabled={currentSlide === totalSlides - 1}
      >
        <ChevronRight className="size-7" />
      </button>
      <div className="fixed bottom-6 right-8 z-30 border border-white/20 bg-slate-950/75 px-4 py-2 text-sm font-bold text-cyan-50 backdrop-blur">
        {currentSlide + 1} / {totalSlides}
      </div>
    </>
  );
}

function DeckActions({ courseId, onReset }: { courseId: string; onReset: () => void }) {
  return (
    <div className="fixed left-6 top-6 z-30 flex items-center gap-2">
      <Button type="button" variant="outline" onClick={onReset} className="border-white/20 bg-slate-950/70 text-white hover:bg-cyan-400/20 hover:text-white">
        <RotateCcw className="size-4" />
        回到开头
      </Button>
      <Button asChild variant="outline" className="border-white/20 bg-slate-950/70 text-white hover:bg-cyan-400/20 hover:text-white">
        <Link href={`/courses/${courseId}/pdf`}>
          <FileText className="size-4" />
          PDF
        </Link>
      </Button>
      <Button asChild variant="outline" className="border-white/20 bg-slate-950/70 text-white hover:bg-cyan-400/20 hover:text-white">
        <Link href={`/courses/${courseId}/create/resources`}>
          <Edit3 className="size-4" />
          编辑
        </Link>
      </Button>
    </div>
  );
}

export function CourseHtmlPreview({ courseId }: { courseId: string }) {
  const { data, error, isLoading } = useCoursePreview(courseId);
  const [currentSlide, setCurrentSlide] = useState(0);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState message={error || "课程预览加载失败"} courseId={courseId} />;
  }

  const slides = buildSlides(data.pages);
  const totalSlides = slides.length;

  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="flex min-h-screen items-center justify-center p-4">
        <CoursePreviewDocument data={data} mode="html" audience="teacher" activeSlideIndex={currentSlide} />
        <SlideNavigator
          currentSlide={currentSlide}
          totalSlides={totalSlides}
          onPrevious={() => setCurrentSlide((index) => Math.max(0, index - 1))}
          onNext={() => setCurrentSlide((index) => Math.min(totalSlides - 1, index + 1))}
        />
        <DeckActions courseId={courseId} onReset={() => setCurrentSlide(0)} />
      </div>
    </main>
  );
}

export function CourseCreatePreviewEmbed({ courseId }: { courseId: string }) {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-[1600px] space-y-5 px-6 py-6">
        <CourseCreateSteps currentStep={5} courseId={courseId} />
      </div>
      <CourseHtmlPreview courseId={courseId} />
    </main>
  );
}

export function CoursePdfPreview({ courseId }: { courseId: string }) {
  const { data, error, isLoading } = useCoursePreview(courseId);

  if (isLoading) {
    return <LoadingState />;
  }

  if (error || !data) {
    return <ErrorState message={error || "课程预览加载失败"} courseId={courseId} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-6 print:bg-white print:p-0">
      <div className="print-hidden mx-auto mb-6 flex max-w-[1280px] items-center justify-between border border-white/10 bg-white/10 px-4 py-3 text-white shadow-sm">
        <Button type="button" onClick={() => window.print()}>
          <Printer className="size-4" />
          打印 / 保存 PDF
        </Button>
        <Button asChild variant="outline">
          <Link href={`/courses/${courseId}`}>返回 HTML 预览</Link>
        </Button>
      </div>
      <CoursePreviewDocument data={data} mode="pdf" audience="student" />
    </main>
  );
}
