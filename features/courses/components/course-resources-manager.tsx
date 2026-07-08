"use client";

import { AlertCircle, CheckCircle2, ImageIcon, Loader2, RefreshCcw, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

const statusLabels: Record<CourseResourceImage["status"], string> = {
  missing: "未生成",
  pending: "排队中",
  submitting: "提交中",
  generating: "生成中",
  succeeded: "已完成",
  failed: "生成失败",
};

function shouldPoll(data: CourseResourcesResponse | null) {
  return Boolean(data?.images.some((image) => image.status === "pending" || image.status === "submitting" || image.status === "generating"));
}

async function readJson(response: Response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "请求失败");
  }

  return data;
}

function ProgressSummary({ data }: { data: CourseResourcesResponse }) {
  const { progress } = data;
  const percent = progress.total > 0 ? Math.round((progress.succeeded / progress.total) * 100) : 0;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-violet-700">Step 4</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">资源生成</h1>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-slate-950">{percent}%</p>
          <p className="text-sm text-slate-500">
            {progress.succeeded} / {progress.total} 张完成
          </p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        <Stat label="生成中" value={progress.generating} />
        <Stat label="失败" value={progress.failed} />
        <Stat label="未生成" value={progress.missing} />
        <Stat label="内容变化" value={progress.stale} />
        <Stat label="总数" value={progress.total} />
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ImageCard({
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
    <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-slate-100">
        {image.publicUrl ? (
          <div className="h-full bg-cover bg-center" style={{ backgroundImage: `url(${image.publicUrl})` }} />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <ImageIcon className="size-10" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium text-slate-500">
              {image.chapterTitle} · Shot {image.shotOrder}
            </p>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-slate-950">{image.action}</h3>
          </div>
          <StatusBadge image={image} />
        </div>
        <p className="line-clamp-3 text-sm leading-6 text-slate-500">{image.scenePrompt}</p>
        {image.failureReason ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{image.failureReason}</p> : null}
        {image.stale ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">课文分镜内容已变化，可沿用旧图或重新生成。</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canRetry ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRetry(image)}
              className="inline-flex min-h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
              className="inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
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

function StatusBadge({ image }: { image: CourseResourceImage }) {
  const active = image.status === "pending" || image.status === "submitting" || image.status === "generating";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        image.status === "succeeded" && !image.stale && "bg-emerald-50 text-emerald-700",
        image.status === "failed" && "bg-rose-50 text-rose-700",
        image.status === "missing" && "bg-slate-100 text-slate-600",
        image.stale && "bg-amber-50 text-amber-700",
        active && "bg-blue-50 text-blue-700",
      )}
    >
      {active ? <Loader2 className="size-3 animate-spin" /> : image.status === "failed" ? <AlertCircle className="size-3" /> : null}
      {image.stale ? "内容变化" : statusLabels[image.status]}
    </span>
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

  const grouped = useMemo(() => {
    const groups = new Map<string, CourseResourceImage[]>();
    data?.images.forEach((image) => {
      const current = groups.get(image.chapterTitle) ?? [];
      current.push(image);
      groups.set(image.chapterTitle, current);
    });
    return Array.from(groups.entries());
  }, [data]);

  async function mutate(path: string) {
    setBusy(true);
    try {
      const result = (await readJson(await fetch(path, { method: "POST" }))) as CourseResourcesResponse | { image: CourseResourceImage };
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
      <div className="mx-auto max-w-7xl space-y-6">
        <CourseCreateSteps currentStep={4} courseId={courseId} />

        {data ? <ProgressSummary data={data} /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <p className="text-sm font-semibold text-slate-950">图片任务</p>
            <p className="mt-1 text-sm text-slate-500">进入页面不会自动消耗额度，点击后只创建缺失图片任务。</p>
          </div>
          <button
            type="button"
            disabled={busy || !data || data.progress.missing === 0}
            onClick={() => void mutate(`/api/courses/${courseId}/resources/generate`)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-violet-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
            生成全部缺失图片
          </button>
        </div>

        {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

        <div className="space-y-6">
          {grouped.map(([chapterTitle, images]) => (
            <section key={chapterTitle} className="space-y-3">
              <h2 className="text-lg font-semibold text-slate-950">{chapterTitle}</h2>
              <div className="grid gap-4 lg:grid-cols-2">
                {images.map((image) => (
                  <ImageCard
                    key={image.slotId}
                    image={image}
                    busy={busy}
                    onRetry={(item) => item.id && void mutate(`/api/courses/${courseId}/resources/images/${item.id}/retry`)}
                    onKeep={(item) => item.id && void mutate(`/api/courses/${courseId}/resources/images/${item.id}/keep`)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
