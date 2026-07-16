"use client";

import Link from "next/link";
import { CheckCircle2, ImageIcon, RefreshCcw, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import type { CourseResourceImage, CourseResourcesResponse } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

type ResourceStage = "needs_plan" | "needs_cover" | "needs_chapter_images" | "ready";

const activeStatuses = new Set<CourseResourceImage["status"]>(["pending", "submitting", "generating"]);

const planGenerationSteps = ["分析课文结构", "规划画面分配", "撰写插图 Prompt", "整理资源方案"];

const planTips = [
  "AI 正在分析课文段落结构，确定每个场景的视觉重点...",
  "正在为封面和每个段落设计最合适的画面构图。",
  "撰写英文插图 Prompt，确保风格统一、人物一致。",
  "资源方案生成中，预计需要 1-2 分钟，请稍候。",
];

// A card whose slot is the current in-flight generate/retry target. Image generation runs synchronously inside the
// request (1-3 min) so `data.images` does not update until it returns; deriving from `pendingAction` lets the target
// card show a "生成中" placeholder immediately instead of only spinning the button.
function isSlotPendingGeneration(image: CourseResourceImage, pendingAction: string | null) {
  if (!pendingAction) {
    return false;
  }
  if (pendingAction === "generate:all") {
    return image.status === "missing";
  }
  if (pendingAction === `generate:${image.slotId}`) {
    return true;
  }
  if (image.chapterId && pendingAction === `generate:${image.chapterId}`) {
    return image.status === "missing";
  }
  if (image.id && pendingAction === `images/${image.id}/retry`) {
    return true;
  }
  return false;
}

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

function PlanGenerationProgress() {
  const [progress, setProgress] = useState(8);
  const [tipIndex, setTipIndex] = useState(0);
  const activeStep = planGenerationSteps[Math.min(planGenerationSteps.length - 1, Math.floor(progress / 25))];

  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) return current;
        return Math.min(92, current + (current < 55 ? 8 : 3));
      });
    }, 1200);

    const tipTimer = window.setInterval(() => {
      setTipIndex((prev) => (prev + 1) % planTips.length);
    }, 5000);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(tipTimer);
    };
  }, []);

  return (
    <Card className="border-primary/20 bg-primary-50/50">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Spinner size="sm" className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground">正在生成资源方案</h3>
            <p className="mt-1 text-sm text-muted-foreground transition-all duration-300">
              {planTips[tipIndex]}
            </p>
            <div className="mt-4">
              <Progress value={progress} className="h-2" />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              {planGenerationSteps.map((step) => {
                const isActive = step === activeStep;
                const isDone = planGenerationSteps.indexOf(step) < planGenerationSteps.indexOf(activeStep);
                return (
                  <div
                    key={step}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium",
                      isActive && "border-primary/30 bg-primary/10 text-primary",
                      isDone && "border-success/30 bg-success/10 text-success",
                      !isActive && !isDone && "border-border bg-secondary/50 text-muted-foreground",
                    )}
                  >
                    {step}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StageHeader({ data, courseId, pendingAction, onAction }: { data: CourseResourcesResponse | null; courseId: string; pendingAction: string | null; onAction: (path: string) => void }) {
  const stage = data ? getResourceStage(data) : "needs_plan";
  const { cover, chapterImages } = data ? splitResourceImages(data.images) : { cover: null, chapterImages: [] };
  const done = chapterImages.filter((image) => image.status === "succeeded" && !image.stale).length;
  const total = chapterImages.length;

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-primary">Step 4</p>
            <CardTitle className="mt-1 text-2xl">绘本资源</CardTitle>
            <CardDescription className="mt-2 max-w-3xl">
              按顺序完成：先生成资源方案，再生成封面，最后生成章节插图。生成图片预计耗时 1-3 分钟，过程中可随时离开页面。
            </CardDescription>
          </div>
          {data?.plan ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onAction("plan/generate")}
                disabled={pendingAction !== null}
              >
                <RefreshCcw className={cn("size-4", pendingAction === "plan/generate" && "animate-spin")} />
                重新生成方案
              </Button>
              <Button asChild size="sm">
                <Link href={`/courses/${courseId}/create/preview`}>
                  进入课程预览
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
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
      </CardContent>
    </Card>
  );
}

function StagePill({ label, value, active, done }: { label: string; value: string; active: boolean; done: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition-colors duration-200",
        active && "border-primary/30 bg-primary-50",
        done && "border-success/30 bg-success-50",
        !active && !done && "border-border bg-secondary/50",
      )}
    >
      <p className={cn(
        "text-xs font-medium",
        active ? "text-primary" : done ? "text-success" : "text-muted-foreground"
      )}>{label}</p>
      <p className={cn(
        "mt-1 text-sm font-semibold",
        active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground"
      )}>{value}</p>
    </div>
  );
}

function ResourcePlanSummary({ data, pendingAction, onAction }: { data: CourseResourcesResponse; pendingAction: string | null; onAction: (path: string) => void }) {
  const isGeneratingPlan = pendingAction === "plan/generate";

  if (isGeneratingPlan) {
    return <PlanGenerationProgress />;
  }

  if (!data.plan) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center py-12 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary-50 text-primary">
            <WandSparkles className="size-7" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">第一步：生成资源方案</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">AI 将分析课文内容，为封面和每个段落生成专用的插图提示词。</p>
          <p className="mt-1 text-xs text-muted-foreground/80">预计需要 1-2 分钟，生成过程中请保持页面打开。</p>
          <Button
            className="mt-6"
            onClick={() => onAction("plan/generate")}
          >
            <WandSparkles className="size-4" />
            生成资源方案
          </Button>
        </CardContent>
      </Card>
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
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">资源方案</CardTitle>
        <CardDescription>封面和每个正文段落都已生成插图 Prompt；生成图片前可在对应卡片核对原文。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">封面</p>
            <p className="mt-1 text-sm font-semibold text-foreground">1 张主视觉</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">章节</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{chapters.size} 章</p>
          </div>
          <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground">插图 Prompt</p>
            <p className="mt-1 text-sm font-semibold text-foreground">{data.plan.shots.length} 条</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PromptPanel({ image, expanded, onToggle }: { image: CourseResourceImage; expanded: boolean; onToggle: () => void }) {
  // Default: prompt is shown before an image exists and hidden once it does. `expanded` means the user flipped away
  // from that default, so a click always toggles visibility (the old `expanded || default` OR could never collapse
  // when the default was already "show").
  const defaultShow = !image.publicUrl && !activeStatuses.has(image.status);
  const shouldShow = expanded ? !defaultShow : defaultShow;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
      >
        <span>{shouldShow ? "收起 Prompt" : "查看 Prompt"}</span>
        <span className="text-muted-foreground/70">单张约 1-3 分钟</span>
      </button>
      {shouldShow ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap border-t border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
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
  // A cover slot is always present in the plan (status "missing" before it is ever generated), so button state must
  // key off whether a record actually exists — not off `cover` being non-null — otherwise it shows "重新生成封面"
  // before the first generation.
  const coverExists = Boolean(cover && cover.status !== "missing");
  const coverActive = cover ? activeStatuses.has(cover.status) : false;
  // Generation is synchronous (1-3 min); the record only flips to an active status after the request returns, so drive
  // the in-card placeholder off the pending action to show progress immediately instead of only spinning the button.
  const coverGenerating = coverActive || pendingAction === "cover/generate";
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">第二步：视觉封面</CardTitle>
            <CardDescription>先生成课程主视觉；章节图可以并行或批量生成。每张图片约需 1-3 分钟。</CardDescription>
          </div>
          <StatusBadge image={cover} />
        </div>
      </CardHeader>
      <CardContent>
        {cover ? <PromptPanel image={cover} expanded={promptExpanded} onToggle={onTogglePrompt} /> : null}
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-secondary">
          <div className="aspect-video">
            {cover?.publicUrl && !coverGenerating ? (
              <div className="h-full bg-cover bg-center transition-opacity duration-500" style={{ backgroundImage: `url(${cover.publicUrl})` }} />
            ) : coverGenerating ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Spinner />
                <p className="text-sm">封面生成中，预计 1-3 分钟...</p>
                <p className="text-xs text-muted-foreground/70">请保持页面打开，生成完成后会自动显示。</p>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground/50">
                <ImageIcon className="size-10" />
              </div>
            )}
          </div>
        </div>
        {cover?.failureReason ? (
          <p className="mt-3 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{cover.failureReason}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={coverExists ? "outline" : "default"}
            size="sm"
            onClick={() => onGenerate("cover/generate")}
            disabled={coverActive || pendingAction !== null}
            loading={coverGenerating}
          >
            {coverExists ? <RefreshCcw className="size-4" /> : <ImageIcon className="size-4" />}
            {coverExists ? "重新生成封面" : "生成封面"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ image, confirmed }: { image: CourseResourceImage | null; confirmed?: boolean }) {
  const active = image ? activeStatuses.has(image.status) : false;
  const succeeded = image?.status === "succeeded" && !image.stale;
  const label = confirmed ? "已确认" : statusText(image);

  if (confirmed || succeeded) {
    return <Badge variant="success">{label}</Badge>;
  }
  if (image?.status === "failed") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (image?.stale) {
    return <Badge variant="warning">{label}</Badge>;
  }
  if (active) {
    return (
      <Badge variant="info" className="gap-1">
        <Spinner size="sm" className="!size-3" />
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}

function ChapterImagesPanel({
  images,
  pendingAction,
  hasMissingAny,
  hasAnyActive,
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
  hasAnyActive: boolean;
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
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">第三步：章节插图</CardTitle>
            <CardDescription>每段一张图。可以单张生成、本章生成，或一次创建全部缺失图片。</CardDescription>
          </div>
          <Button
            size="sm"
            onClick={onGenerateAll}
            disabled={!hasMissingAny || pendingAction !== null || hasAnyActive}
            loading={pendingAction === "generate:all"}
          >
            <WandSparkles className="size-4" />
            生成全部缺失图片
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from(grouped.entries()).map(([chapterId, chapterImages]) => {
          const chapterTitle = chapterImages[0]?.chapterTitle ?? chapterId;
          const hasActive = chapterImages.some((image) => activeStatuses.has(image.status));
          const hasMissing = chapterImages.some((image) => image.status === "missing");
          const done = chapterImages.filter((image) => image.status === "succeeded" && !image.stale).length;
          const chapterProgress = (done / chapterImages.length) * 100;

          return (
            <div key={chapterId} className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">{chapterTitle}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {done}/{chapterImages.length} 张完成
                    {hasActive && <span className="ml-2 text-primary">· 生成中</span>}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateChapter(chapterId)}
                  disabled={hasActive || !hasMissing || pendingAction !== null}
                  loading={hasActive || pendingAction === `generate:${chapterId}`}
                >
                  <WandSparkles className="size-4" />
                  生成本章
                </Button>
              </div>
              {hasActive ? <Progress value={chapterProgress} className="h-1" /> : null}
              <div className="grid gap-4 lg:grid-cols-2">
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
      </CardContent>
    </Card>
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
  const isActive = activeStatuses.has(image.status);
  const isSucceeded = image.status === "succeeded" && !image.stale;
  // Generation runs synchronously (1-3 min) so the record only flips to an active status after the request returns.
  // Derive an in-flight flag from the pending action to show the "生成中" placeholder immediately on click.
  const isGenerating = isActive || isSlotPendingGeneration(image, pendingAction);

  return (
    <article className={cn(
      "overflow-hidden rounded-xl border bg-card transition-all duration-200",
      isSucceeded ? "border-border" : "border-border bg-secondary/30",
    )}>
      <div className="aspect-video bg-secondary relative overflow-hidden">
        {image.publicUrl && !isGenerating ? (
          <div className="h-full bg-cover bg-center transition-opacity duration-500" style={{ backgroundImage: `url(${image.publicUrl})` }} />
        ) : isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground">
            <Spinner size="sm" />
            <p className="text-xs">生成中，预计 1-3 分钟...</p>
            <p className="text-[11px] text-muted-foreground/70">请保持页面打开</p>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="size-8" />
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-foreground">第 {image.shotOrder} 段插图</p>
          <StatusBadge image={image} />
        </div>
        <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">{image.sourceText}</p>
        <PromptPanel image={image} expanded={promptExpanded} onToggle={onTogglePrompt} />
        {image.failureReason ? (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">{image.failureReason}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canGenerate ? (
            <Button
              size="sm"
              onClick={() => onGenerateSlot(image.slotId)}
              disabled={pendingAction !== null}
              loading={pendingAction === `generate:${image.slotId}`}
            >
              <ImageIcon className="size-4" />
              生成本张
            </Button>
          ) : null}
          {canRetry && image.id ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRetry(image)}
              disabled={pendingAction !== null}
              loading={pendingAction === `images/${image.id}/retry`}
            >
              <RefreshCcw className="size-4" />
              重新生成
            </Button>
          ) : null}
          {canKeep && image.id ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onKeep(image)}
              disabled={pendingAction !== null}
            >
              <CheckCircle2 className="size-4" />
              沿用旧图
            </Button>
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
  const hasAnyActive = Boolean(data?.images.some((image) => activeStatuses.has(image.status)));

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

  const stage = data ? getResourceStage(data) : null;
  const isReady = stage === "ready";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <CourseCreateSteps currentStep={4} courseId={courseId} />

      <StageHeader data={data} courseId={courseId} pendingAction={pendingAction} onAction={(path) => void mutate(path)} />

      {error ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

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
          hasAnyActive={hasAnyActive}
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!isReady ? (
            <p className="text-sm text-muted-foreground">
              图片可稍后继续生成，随时可进入预览调整版式。
            </p>
          ) : null}
          <Button asChild size="lg">
            <Link href={`/courses/${courseId}/create/preview`}>
              进入课程预览
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
