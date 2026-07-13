"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, ImageIcon, Loader2, RefreshCcw, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type ResourceStage = "needs_plan" | "needs_cover" | "needs_cover_confirmation" | "needs_chapter_images" | "ready";

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
  if (data.plan.confirmedCoverImageId) {
    const hasUnfinishedChapterImage = chapterImages.some((image) => image.status !== "succeeded" || image.stale);
    return hasUnfinishedChapterImage || chapterImages.length === 0 ? "needs_chapter_images" : "ready";
  }

  if (!cover) {
    return "needs_cover";
  }

  if (!data.plan.confirmedCoverImageId) {
    return cover.status === "succeeded" && !cover.stale ? "needs_cover_confirmation" : "needs_cover";
  }
  return "ready";
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

function StageHeader({ data, busy, onAction }: { data: CourseResourcesResponse | null; busy: boolean; onAction: (path: string) => void }) {
  const stage = data ? getResourceStage(data) : "needs_plan";
  const { cover, chapterImages } = data ? splitResourceImages(data.images) : { cover: null, chapterImages: [] };
  const done = chapterImages.filter((image) => image.status === "succeeded" && !image.stale).length;
  const total = chapterImages.length;

  const action =
    stage === "needs_plan"
      ? { label: "生成资源方案", path: "plan/generate", icon: WandSparkles }
      : stage === "needs_cover"
        ? { label: cover?.status === "failed" ? "重试视觉封面" : "生成视觉封面", path: "cover/generate", icon: ImageIcon }
        : stage === "needs_chapter_images"
          ? { label: "生成章节插图", path: "generate", icon: WandSparkles }
          : null;
  const ActionIcon = action?.icon;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Step 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">绘本资源</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            先生成统一视觉方案，用封面确认风格和人物形象；确认后再批量生成章节插图。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={data ? "#" : "#"}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
          {action && ActionIcon ? (
            <button
              type="button"
              disabled={busy || (stage === "needs_chapter_images" && !data?.plan?.confirmedCoverImageId)}
              onClick={() => onAction(action.path)}
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ActionIcon className="size-4" />}
              {action.label}
            </button>
          ) : null}
          {data?.plan ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("plan/generate")}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="size-4" />
              重新生成方案
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StagePill active={stage === "needs_plan"} done={Boolean(data?.plan)} label="资源方案" value={data?.plan ? "已生成" : "待生成"} />
        <StagePill
          active={stage === "needs_cover" || stage === "needs_cover_confirmation"}
          done={Boolean(data?.plan?.confirmedCoverImageId)}
          label="视觉封面"
          value={data?.plan?.confirmedCoverImageId ? "已确认" : statusText(cover)}
        />
        <StagePill
          active={stage === "needs_chapter_images"}
          done={stage === "ready"}
          label="章节插图"
          value={total ? `${done}/${total} 张完成` : data?.plan?.confirmedCoverImageId ? "待生成" : "待封面确认"}
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

function VisualPlanSummary({ data }: { data: CourseResourcesResponse }) {
  if (!data.plan) {
    return (
      <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
        <WandSparkles className="mx-auto size-8 text-slate-400" />
        <h2 className="mt-3 text-base font-semibold text-slate-950">还没有资源方案</h2>
        <p className="mt-2 text-sm text-slate-600">生成后会得到统一风格、色彩和人物形象，并自动规划每章两张插图。</p>
      </section>
    );
  }

  const profile = data.plan.visualProfile;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">视觉方向</h2>
          <p className="mt-1 text-sm text-slate-600">只用于快速检查整体方向；最终以封面效果为准。</p>
        </div>
        {data.plan.confirmedCoverImageId ? (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">封面已确认</span>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <SummaryItem label="风格" value={profile.style} />
        <SummaryItem label="色彩" value={profile.palette} />
        <SummaryItem label="世界观" value={profile.world} />
        <SummaryItem label="氛围" value={profile.mood} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {profile.characters.map((character) => (
          <span key={character.alias} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
            {character.alias}: {character.clothing} / {character.signatureColor}
          </span>
        ))}
      </div>
    </section>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function CoverPanel({
  cover,
  confirmed,
  busy,
  onGenerate,
  onConfirm,
}: {
  cover: CourseResourceImage | null;
  confirmed: boolean;
  busy: boolean;
  onGenerate: () => void;
  onConfirm: (image: CourseResourceImage) => void;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">视觉封面</h2>
          <p className="mt-1 text-sm text-slate-600">检查人物、色彩、整体画风。确认后章节图会以它作为参考。</p>
        </div>
        <StatusBadge image={cover} confirmed={confirmed} />
      </div>
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
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
          {cover ? "重新生成封面" : "生成封面"}
        </button>
        {cover?.id && cover.status === "succeeded" && !cover.stale && !confirmed ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onConfirm(cover)}
            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-emerald-600 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CheckCircle2 className="size-4" />
            确认封面
          </button>
        ) : null}
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
  busy,
  enabled,
  onGenerate,
  onRetry,
  onKeep,
}: {
  images: CourseResourceImage[];
  busy: boolean;
  enabled: boolean;
  onGenerate: () => void;
  onRetry: (image: CourseResourceImage) => void;
  onKeep: (image: CourseResourceImage) => void;
}) {
  const grouped = new Map<string, CourseResourceImage[]>();
  images.forEach((image) => {
    const current = grouped.get(image.chapterTitle) ?? [];
    current.push(image);
    grouped.set(image.chapterTitle, current);
  });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-950">章节插图</h2>
          <p className="mt-1 text-sm text-slate-600">每章两张图，只显示对应原文和生成结果。</p>
        </div>
        <button
          type="button"
          disabled={busy || !enabled}
          onClick={onGenerate}
          className="inline-flex min-h-9 items-center gap-2 rounded-md bg-violet-600 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          生成章节插图
        </button>
      </div>

      {!enabled ? <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">确认视觉封面后才能生成章节插图。</p> : null}

      <div className="mt-4 space-y-5">
        {Array.from(grouped.entries()).map(([chapterTitle, chapterImages]) => (
          <div key={chapterTitle}>
            <h3 className="text-sm font-semibold text-slate-950">{chapterTitle}</h3>
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              {chapterImages.map((image) => (
                <ChapterImageCard key={image.slotId} image={image} busy={busy} onRetry={onRetry} onKeep={onKeep} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ChapterImageCard({
  image,
  busy,
  onRetry,
  onKeep,
}: {
  image: CourseResourceImage;
  busy: boolean;
  onRetry: (image: CourseResourceImage) => void;
  onKeep: (image: CourseResourceImage) => void;
}) {
  const canRetry = Boolean(image.id && (image.status === "failed" || image.stale));
  const canKeep = Boolean(image.id && image.stale && image.status === "succeeded");

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
          <p className="text-sm font-semibold text-slate-950">第 {image.shotOrder} 张</p>
          <StatusBadge image={image} />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-slate-700">{image.sourceText}</p>
        {image.failureReason ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{image.failureReason}</p> : null}
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRetry(image)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className="size-4" />
              重新生成
            </button>
          ) : null}
          {canKeep ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onKeep(image)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2 className="size-4" />
              沿用旧图
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CourseResourcesManager({ courseId }: { courseId: string }) {
  const [data, setData] = useState<CourseResourcesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
  const confirmedCover = Boolean(data?.plan?.confirmedCoverImageId);

  async function mutate(path: string) {
    setBusy(true);
    try {
      const result = (await readJson(await fetch(`/api/courses/${courseId}/resources/${path}`, { method: "POST" }))) as
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
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <CourseCreateSteps currentStep={4} courseId={courseId} />

        <StageHeader data={data} busy={busy} onAction={(path) => void mutate(path)} />

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        {data ? <VisualPlanSummary data={data} /> : null}

        {data?.plan ? (
          <CoverPanel
            cover={cover}
            confirmed={confirmedCover}
            busy={busy}
            onGenerate={() => void mutate("cover/generate")}
            onConfirm={(image) => image.id && void mutate(`cover/${image.id}/confirm`)}
          />
        ) : null}

        {data?.plan ? (
          <ChapterImagesPanel
            images={chapterImages}
            busy={busy}
            enabled={confirmedCover}
            onGenerate={() => void mutate("generate")}
            onRetry={(image) => image.id && void mutate(`images/${image.id}/retry`)}
            onKeep={(image) => image.id && void mutate(`images/${image.id}/keep`)}
          />
        ) : null}

        {data?.plan?.confirmedCoverImageId ? (
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
