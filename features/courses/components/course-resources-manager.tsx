"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, ImageIcon, Loader2, RefreshCcw, WandSparkles, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type ResourceStage = "needs_plan" | "needs_cover" | "needs_chapter_images" | "ready";

const activeStatuses = new Set<CourseResourceImage["status"]>(["pending", "submitting", "generating"]);

export function splitResourceImages(images: CourseResourceImage[]) {
  return {
    cover: images.find((image) => image.slotType === "visual_cover") ?? null,
    chapterImages: images.filter((image) => image.slotType === "lesson_shot"),
  };
}

export function getResourceStage(data: CourseResourcesResponse): ResourceStage {
  if (!data.plan) {
    return "needs_plan";
  }

  const { cover, chapterImages } = splitResourceImages(data.images);
  const hasUnfinishedChapterImage = chapterImages.some((image) => image.status !== "succeeded" || image.stale);
  const coverDone = Boolean(cover && cover.status === "succeeded" && !cover.stale);

  if (!coverDone) {
    return "needs_cover";
  }

  return hasUnfinishedChapterImage || chapterImages.length === 0 ? "needs_chapter_images" : "ready";
}

function shouldPoll(data: CourseResourcesResponse | null) {
  return Boolean(data?.images.some((image) => activeStatuses.has(image.status)));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "请求失败");
  }

  return data;
}

function statusText(image: CourseResourceImage | null) {
  if (!image) {
    return "未生成";
  }
  if (image.stale) {
    return "需更新";
  }
  if (image.status === "succeeded") {
    return "已完成";
  }
  if (activeStatuses.has(image.status)) {
    return "生成中";
  }
  if (image.status === "failed") {
    return "失败";
  }
  return "未生成";
}

function ActionButton({
  label,
  icon: Icon,
  path,
  pendingAction,
  onAction,
  variant = "primary",
  disabled = false,
  spinning = false,
}: {
  label: string;
  icon: LucideIcon;
  path: string;
  pendingAction: string | null;
  onAction: (path: string) => void;
  variant?: "primary" | "secondary" | "success";
  disabled?: boolean;
  spinning?: boolean;
}) {
  // Only the button whose own action is in flight spins; any pending action disables the rest to block
  // concurrent mutations, but they no longer share one global spinner.
  const isPending = pendingAction === path;
  const showSpinner = isPending || spinning;
  const variantClass = {
    primary: "bg-violet-600 text-white hover:bg-violet-500",
    secondary: "border border-slate-300 text-slate-700 hover:bg-slate-50",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled || pendingAction !== null}
      onClick={() => onAction(path)}
      className={cn(
        "inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
        variantClass,
      )}
    >
      {showSpinner ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
      {label}
    </button>
  );
}

function StageHeader({ data, pendingAction, onAction }: { data: CourseResourcesResponse | null; pendingAction: string | null; onAction: (path: string) => void }) {
  const stage = data ? getResourceStage(data) : "needs_plan";
  const { cover, chapterImages } = data ? splitResourceImages(data.images) : { cover: null, chapterImages: [] };
  const done = chapterImages.filter((image) => image.status === "succeeded" && !image.stale).length;
  const total = chapterImages.length;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Step 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">绘本资源</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            按顺序完成：先生成资源方案，再生成封面，最后生成章节插图。生成图片预计耗时 1-3 分钟，可单张、本章或全部生成。
          </p>
        </div>
        {data?.plan ? (
          <ActionButton
            label="重新生成方案"
            icon={RefreshCcw}
            path="plan/generate"
            pendingAction={pendingAction}
            onAction={onAction}
            variant="secondary"
          />
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StagePill active={stage === "needs_plan"} done={Boolean(data?.plan)} label="1 · 资源方案" value={data?.plan ? "已生成" : "待生成"} />
        <StagePill
          active={stage === "needs_cover"}
          done={Boolean(cover && cover.status === "succeeded" && !cover.stale)}
          label="2 · 视觉封面"
          value={statusText(cover)}
        />
        <StagePill
          active={stage === "needs_chapter_images"}
          done={stage === "ready"}
          label="3 · 章节插图"
          value={total ? `${done}/${total} 张完成` : data?.plan ? "待生成" : "待资源方案"}
        />
      </div>
    </section>
  );
}

function StagePill({ label, value, active, done }: { label: string; value: string; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        active && "border-violet-200 bg-violet-50",
        done && "border-emerald-200 bg-emerald-50",
        !active && !done && "border-slate-200 bg-slate-50",
      )}
    >
      <p className={cn("text-xs font-medium", active ? "text-violet-700" : done ? "text-emerald-700" : "text-slate-500")}>{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ResourcePlanSummary({ data, pendingAction, onAction }: { data: CourseResourcesResponse; pendingAction: string | null; onAction: (path: string) => void }) {
  if (!data.plan) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <WandSparkles className="mx-auto size-8 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-950">第一步：生成资源方案</h2>
        <p className="mt-2 text-sm text-slate-600">生成后会得到封面 prompt，并为每章两个段落各规划一张插图 prompt。</p>
        <div className="mt-4 flex justify-center">
          <ActionButton label="生成资源方案" icon={WandSparkles} path="plan/generate" pendingAction={pendingAction} onAction={onAction} />
        </div>
      </section>
    );
  }

  const chapters = new Map<string, CourseResourceImage[]>();
  data.images
    .filter((image) => image.slotType === "lesson_shot")
    .forEach((image) => {
      if (!image.chapterId) {
        return;
      }
      chapters.set(image.chapterId, [...(chapters.get(image.chapterId) ?? []), image]);
    });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">资源方案</h2>
          <p className="mt-1 text-sm text-slate-600">封面和每个正文段落都已生成 GPT Image 2 专用 prompt；生成图片前可在对应卡片核对原文。</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">封面</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">1 张主视觉</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">章节</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{chapters.size} 章</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500">插图 Prompt</p>
          <p className="mt-1 text-sm font-semibold text-slate-950">{data.plan.shots.length} 条</p>
        </div>
      </div>
    </section>
  );
}

function PromptPanel({ image, expanded, onToggle }: { image: CourseResourceImage; expanded: boolean; onToggle: () => void }) {
  const shouldShow = expanded || (!image.publicUrl && !activeStatuses.has(image.status));
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-slate-600"
      >
        <span>{shouldShow ? "收起 Prompt" : "查看 Prompt"}</span>
        <span className="text-slate-400">生成预计耗时 1-3 分钟</span>
      </button>
      {shouldShow ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-slate-100 px-3 py-3 text-xs leading-5 text-slate-700">
          {image.prompt}
        </pre>
      ) : null}
    </div>
  );
}

function CoverPanel({
  cover,
  pendingAction,
  onGenerate,
  promptExpanded,
  onTogglePrompt,
}: {
  cover: CourseResourceImage | null;
  pendingAction: string | null;
  onGenerate: (path: string) => void;
  promptExpanded: boolean;
  onTogglePrompt: () => void;
}) {
  const coverActive = cover ? activeStatuses.has(cover.status) : false;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">第二步：视觉封面</h2>
          <p className="mt-1 text-sm text-slate-600">先生成课程主视觉；章节图不依赖封面作为参考，可以继续单张或批量生成。</p>
        </div>
        <StatusBadge image={cover} />
      </div>
      {cover ? <div className="mt-4"><PromptPanel image={cover} expanded={promptExpanded} onToggle={onTogglePrompt} /></div> : null}
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <div className="aspect-video">
          {cover?.publicUrl ? (
            <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${cover.publicUrl})` }} />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <ImageIcon className="size-10" />
            </div>
          )}
        </div>
      </div>
      {cover?.failureReason ? <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{cover.failureReason}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton
          label={cover ? "重新生成封面" : "生成封面"}
          icon={cover ? RefreshCcw : ImageIcon}
          path="cover/generate"
          pendingAction={pendingAction}
          onAction={onGenerate}
          variant={cover ? "secondary" : "primary"}
          disabled={coverActive}
          spinning={coverActive}
        />
      </div>
    </section>
  );
}

function StatusBadge({ image, confirmed }: { image: CourseResourceImage | null; confirmed?: boolean }) {
  const active = image ? activeStatuses.has(image.status) : false;
  const label = confirmed ? "已确认" : statusText(image);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        confirmed || (image?.status === "succeeded" && !image.stale) ? "bg-emerald-50 text-emerald-700" : null,
        image?.status === "failed" && "bg-rose-50 text-rose-700",
        (!image || image.status === "missing") && "bg-slate-100 text-slate-600",
        image?.stale && "bg-amber-50 text-amber-700",
        active && "bg-blue-50 text-blue-700",
      )}
    >
      {active ? <Loader2 className="size-3 animate-spin" /> : image?.status === "failed" ? <AlertCircle className="size-3" /> : null}
      {label}
    </span>
  );
}

function ChapterImagesPanel({
  images,
  pendingAction,
  hasMissingAny,
  promptExpanded,
  onTogglePrompt,
  onGenerateAll,
  onGenerateSlot,
  onGenerateChapter,
  onRetry,
  onKeep,
}: {
  images: CourseResourceImage[];
  pendingAction: string | null;
  hasMissingAny: boolean;
  promptExpanded: ReadonlySet<string>;
  onTogglePrompt: (slotId: string) => void;
  onGenerateAll: () => void;
  onGenerateSlot: (slotId: string) => void;
  onGenerateChapter: (chapterId: string) => void;
  onRetry: (image: CourseResourceImage) => void;
  onKeep: (image: CourseResourceImage) => void;
}) {
  const grouped = new Map<string, CourseResourceImage[]>();
  images.forEach((image) => {
    if (!image.chapterId) {
      return;
    }
    const current = grouped.get(image.chapterId) ?? [];
    current.push(image);
    grouped.set(image.chapterId, current);
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">第三步：章节插图</h2>
          <p className="mt-1 text-sm text-slate-600">每段一张图。可以单张生成、本章生成，或一次创建全部缺失图片任务。</p>
        </div>
        <ActionButton
          label="生成全部缺失图片"
          icon={WandSparkles}
          path="generate:all"
          pendingAction={pendingAction}
          onAction={onGenerateAll}
          disabled={!hasMissingAny}
        />
      </div>

      <div className="mt-4 space-y-5">
        {Array.from(grouped.entries()).map(([chapterId, chapterImages]) => {
          const chapterTitle = chapterImages[0]?.chapterTitle ?? chapterId;
          const hasActive = chapterImages.some((image) => activeStatuses.has(image.status));
          const hasMissing = chapterImages.some((image) => image.status === "missing");
          const done = chapterImages.filter((image) => image.status === "succeeded" && !image.stale).length;
          return (
          <div key={chapterId}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">{chapterTitle}</h3>
                <p className="mt-1 text-xs text-slate-500">{done}/{chapterImages.length} 张完成</p>
              </div>
              <ActionButton
                label={hasActive ? "生成中" : "生成本章插图"}
                icon={WandSparkles}
                path={`generate:${chapterId}`}
                pendingAction={pendingAction}
                onAction={() => onGenerateChapter(chapterId)}
                disabled={hasActive || !hasMissing}
                spinning={hasActive}
              />
            </div>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {chapterImages.map((image) => (
                <ChapterImageCard
                  key={image.slotId}
                  image={image}
                  pendingAction={pendingAction}
                  promptExpanded={promptExpanded.has(image.slotId)}
                  onTogglePrompt={() => onTogglePrompt(image.slotId)}
                  onGenerateSlot={onGenerateSlot}
                  onRetry={onRetry}
                  onKeep={onKeep}
                />
              ))}
            </div>
          </div>
          );
        })}
      </div>
    </section>
  );
}

function ChapterImageCard({
  image,
  pendingAction,
  promptExpanded,
  onTogglePrompt,
  onGenerateSlot,
  onRetry,
  onKeep,
}: {
  image: CourseResourceImage;
  pendingAction: string | null;
  promptExpanded: boolean;
  onTogglePrompt: () => void;
  onGenerateSlot: (slotId: string) => void;
  onRetry: (image: CourseResourceImage) => void;
  onKeep: (image: CourseResourceImage) => void;
}) {
  const canRetry = Boolean(image.id && (image.status === "failed" || image.stale));
  const canKeep = Boolean(image.id && image.stale && image.status === "succeeded");
  const canGenerate = image.status === "missing";

  return (
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      <div className="aspect-video bg-slate-100">
        {image.publicUrl ? (
          <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${image.publicUrl})` }} />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-slate-950">第 {image.shotOrder} 段插图</p>
          <StatusBadge image={image} />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-slate-700">{image.sourceText}</p>
        <PromptPanel image={image} expanded={promptExpanded} onToggle={onTogglePrompt} />
        {image.failureReason ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{image.failureReason}</p> : null}
        <div className="flex flex-wrap gap-2">
          {canGenerate ? (
            <ActionButton
              label="生成本张"
              icon={ImageIcon}
              path={`generate:${image.slotId}`}
              pendingAction={pendingAction}
              onAction={() => onGenerateSlot(image.slotId)}
              variant="primary"
            />
          ) : null}
          {canRetry && image.id ? (
            <ActionButton
              label="重新生成"
              icon={RefreshCcw}
              path={`images/${image.id}/retry`}
              pendingAction={pendingAction}
              onAction={() => onRetry(image)}
              variant="secondary"
            />
          ) : null}
          {canKeep && image.id ? (
            <ActionButton
              label="沿用旧图"
              icon={CheckCircle2}
              path={`images/${image.id}/keep`}
              pendingAction={pendingAction}
              onAction={() => onKeep(image)}
              variant="secondary"
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CourseResourcesManager({ courseId }: { courseId: string }) {
  const [data, setData] = useState<CourseResourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(() => new Set());

  const fetchResources = useCallback(
    async () => (await readJson(await fetch(`/api/courses/${courseId}/resources`, { cache: "no-store" }))) as CourseResourcesResponse,
    [courseId],
  );

  const load = useCallback(async () => {
    const result = await fetchResources();
    setData(result);
    setError(null);
  }, [fetchResources]);

  useEffect(() => {
    let active = true;

    void fetchResources()
      .then((result) => {
        if (!active) {
          return;
        }
        setData(result);
        setError(null);
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "资源状态加载失败");
      });

    return () => {
      active = false;
    };
  }, [fetchResources]);

  useEffect(() => {
    if (!shouldPoll(data)) {
      return;
    }

    const timer = window.setInterval(() => {
      void load().catch((loadError) => setError(loadError instanceof Error ? loadError.message : "资源状态加载失败"));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [data, load]);

  const { cover, chapterImages } = useMemo(() => splitResourceImages(data?.images ?? []), [data]);
  const hasMissingAny = Boolean(data?.images.some((image) => image.status === "missing"));

  function togglePrompt(slotId: string) {
    setExpandedPrompts((current) => {
      const next = new Set(current);
      if (next.has(slotId)) {
        next.delete(slotId);
      } else {
        next.add(slotId);
      }
      return next;
    });
  }

  async function mutate(path: string, body?: unknown, actionKey = path) {
    setPendingAction(actionKey);
    try {
      const result = (await readJson(
        await fetch(`/api/courses/${courseId}/resources/${path}`, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }),
      )) as
        | CourseResourcesResponse
        | { image: CourseResourceImage };
      if ("images" in result) {
        setData(result);
      } else {
        await load();
      }
      setError(null);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "操作失败");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <CourseCreateSteps currentStep={4} courseId={courseId} />

        <StageHeader data={data} pendingAction={pendingAction} onAction={(path) => void mutate(path)} />

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {data ? <ResourcePlanSummary data={data} pendingAction={pendingAction} onAction={(path) => void mutate(path)} /> : null}

        {data?.plan ? (
          <CoverPanel
            cover={cover}
            pendingAction={pendingAction}
            onGenerate={(path) => void mutate(path)}
            promptExpanded={cover ? expandedPrompts.has(cover.slotId) : false}
            onTogglePrompt={() => cover && togglePrompt(cover.slotId)}
          />
        ) : null}

        {data?.plan ? (
          <ChapterImagesPanel
            images={chapterImages}
            pendingAction={pendingAction}
            hasMissingAny={hasMissingAny}
            promptExpanded={expandedPrompts}
            onTogglePrompt={togglePrompt}
            onGenerateAll={() => void mutate("generate", { scope: "all" }, "generate:all")}
            onGenerateSlot={(slotId) => void mutate("generate", { scope: "slot", slotId }, `generate:${slotId}`)}
            onGenerateChapter={(chapterId) => void mutate("generate", { scope: "chapter", chapterId }, `generate:${chapterId}`)}
            onRetry={(image) => image.id && void mutate(`images/${image.id}/retry`)}
            onKeep={(image) => image.id && void mutate(`images/${image.id}/keep`)}
          />
        ) : null}

        {data?.plan ? (
          <div className="flex justify-end">
            <Link
              href={`/courses/${courseId}/create/preview`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              查看课程预览
            </Link>
          </div>
        ) : null}
      </div>
    </main>
  );
}
