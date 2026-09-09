import React from "react";
import { AlertCircle, Check, CheckCircle2, Circle, LoaderCircle, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

export type AiOperationPresentation = {
  title: string;
  currentStep: number;
  steps: string[];
  target?: string;
  preserveMessage?: string;
};

export type AiOperationEstimate = { label: string; maxSeconds: number };

export function formatAiDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${String(seconds % 60).padStart(2, "0")} 秒`;
}

export type AiHistoryStatus = "running" | "succeeded" | "failed" | "stale";

function historyTime(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function AiHistoryStatusBadge({ status }: { status: AiHistoryStatus }) {
  const labels = { running: "进行中", succeeded: "已完成", failed: "未完成", stale: "需更新" } as const;
  const Icon = status === "running" ? LoaderCircle : status === "succeeded" ? CheckCircle2 : AlertCircle;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", status === "running" ? "bg-primary-50 text-primary-700" : status === "succeeded" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
      <Icon aria-hidden className={cn("size-3", status === "running" && "animate-spin motion-reduce:animate-none")} />
      {labels[status]}
    </span>
  );
}

export function AiHistoryCard({ children, role = "assistant", title, status, createdAt, targetLabel, meta, footer, accent = false, statusEmphasis = false, wide = false, className, testId, requestId }: { children: React.ReactNode; role?: "assistant" | "teacher"; title: string; status?: AiHistoryStatus; createdAt?: string; targetLabel?: string; meta?: React.ReactNode; footer?: React.ReactNode; accent?: boolean; statusEmphasis?: boolean; wide?: boolean; className?: string; testId?: string; requestId?: string | null }) {
  const time = historyTime(createdAt);
  const StatusIcon = status === "running" ? LoaderCircle : status === "succeeded" ? CheckCircle2 : status === "failed" || status === "stale" ? AlertCircle : Sparkles;
  return (
    <article className={cn("rounded-xl border p-3 text-sm shadow-sm", wide ? "w-full max-w-xl" : "w-fit max-w-[calc(100%-2.25rem)]", role === "teacher" ? "border-primary-100 bg-primary-50 text-foreground" : accent ? "border-primary-200 bg-primary-50/70" : "border-border bg-card text-foreground", statusEmphasis && status === "running" && "border-l-4 border-l-primary", statusEmphasis && status === "succeeded" && "border-l-4 border-l-emerald-500", statusEmphasis && status === "failed" && "border-l-4 border-l-red-500", statusEmphasis && status === "stale" && "border-l-4 border-l-amber-500", className)} data-chat-action={accent ? "" : undefined} data-chat-bubble data-request-id={requestId ?? undefined} data-testid={testId}>
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {statusEmphasis && role === "assistant" ? (
            <span aria-hidden className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", status === "running" ? "bg-primary-50 text-primary" : status === "succeeded" ? "bg-emerald-50 text-emerald-700" : status === "failed" ? "bg-red-50 text-red-700" : status === "stale" ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground")}>
              <StatusIcon className={cn("size-4", status === "running" && "animate-spin motion-reduce:animate-none")} />
            </span>
          ) : null}
          <div className="min-w-0">
            <h3 className="text-balance text-sm font-semibold leading-5 text-foreground">{title}</h3>
            {targetLabel ? <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">{targetLabel}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status ? <AiHistoryStatusBadge status={status} /> : null}
          {time ? <time className="text-xs tabular-nums text-muted-foreground" dateTime={createdAt}>{time}</time> : null}
        </div>
      </header>
      <div className="mt-2 whitespace-pre-wrap text-pretty text-sm leading-6">{children}</div>
      {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">{meta}</div> : null}
      {footer ? <footer className="mt-3 border-t border-border/80 pt-3">{footer}</footer> : null}
    </article>
  );
}

export function CourseAiWorkspaceFrame({ active, constrained = false, children, footer, className }: { active: boolean; constrained?: boolean; children: React.ReactNode; footer: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid min-h-0 gap-4 lg:gap-5",
        active && "lg:h-full lg:min-h-0 lg:grid-rows-[minmax(0,1fr)_auto]",
        constrained && "h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]",
        className,
      )}
      data-active-workspace={active ? "true" : "false"}
      data-testid="course-ai-workspace-frame"
    >
      <div className={cn("min-h-0", active && "lg:overflow-hidden", constrained && "overflow-hidden")}>{children}</div>
      {footer}
    </div>
  );
}

export function AiOperationStatusCard({ elapsedSeconds, persisted, presentation, estimate, compact = false, className }: { elapsedSeconds: number; persisted: boolean; presentation: AiOperationPresentation; estimate?: AiOperationEstimate; compact?: boolean; className?: string }) {
  const currentStep = Math.min(Math.max(presentation.currentStep, 0), Math.max(0, presentation.steps.length - 1));
  const guidance = !persisted
    ? "正在提交任务，请保持当前页面打开。"
    : elapsedSeconds < 30
      ? "任务已经提交，本次操作只会执行一次。"
      : elapsedSeconds < 90
        ? "任务仍在正常处理，无需刷新或重复提交。"
        : estimate && elapsedSeconds > estimate.maxSeconds
          ? "已超过常规时长，任务仍在处理；可以稍后返回查看，结果会自动保存。"
          : "长内容可能仍在生成或校验；可以稍后返回查看，结果会自动保存。";

  return (
    <article aria-live="polite" className={cn("w-full max-w-xl rounded-lg border border-primary-200 bg-primary-50/70 p-3 text-sm text-foreground", className)} data-density={compact ? "compact" : "detailed"} data-testid="ai-operation-status">
      <div className="flex items-start gap-2.5">
        <LoaderCircle aria-hidden className="mt-0.5 size-4 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div className="min-w-0">
              <h3 className="text-balance font-semibold leading-5 text-primary-900">{presentation.title}</h3>
              {presentation.target ? <p className="mt-0.5 truncate text-xs font-medium text-primary-700">{presentation.target}</p> : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800"><LoaderCircle aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />进行中</span>
              <span className="text-xs text-primary-700">已用时 <span className="tabular-nums">{elapsedSeconds > 0 ? formatAiDuration(elapsedSeconds) : "刚刚开始"}</span></span>
            </div>
          </div>

          <ol className={cn("mt-3 hidden gap-2", !compact && "sm:grid")} aria-label="处理阶段">
            {presentation.steps.map((step, index) => (
              <OperationStep active={index === currentStep} complete={index < currentStep} key={step} label={step} />
            ))}
          </ol>

          <div className={cn("mt-3", !compact && "sm:hidden")}>
            <p className="flex items-center gap-2 font-medium text-primary-900">
              <LoaderCircle aria-hidden className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
              {presentation.steps[currentStep]}
            </p>
            {presentation.steps.length > 1 ? (
              <details className="mt-2 text-xs text-primary-800">
                <summary className="min-h-11 cursor-pointer py-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">查看处理阶段</summary>
                <ol className="grid gap-2 pb-1">
                  {presentation.steps.map((step, index) => (
                    <OperationStep active={index === currentStep} complete={index < currentStep} key={step} label={step} />
                  ))}
                </ol>
              </details>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-primary-200/80 pt-2 text-xs leading-5 text-primary-800">
            <p className="text-pretty">{guidance}</p>
            {estimate ? <span className="shrink-0 rounded-md bg-card/80 px-2 py-0.5 font-medium">预计 {estimate.label}</span> : null}
          </div>
          {presentation.preserveMessage ? <p className="mt-1 text-pretty text-xs leading-5 text-primary-700">{presentation.preserveMessage}</p> : null}
        </div>
      </div>
    </article>
  );
}

export function AiWorkspaceGuide({ title, items, className }: { title: string; items: string[]; className?: string }) {
  return (
    <aside className={cn("rounded-lg border border-primary-100 bg-primary-50/45 p-4", className)} data-testid="ai-workspace-guide">
      <h3 className="text-balance text-sm font-semibold text-foreground">{title}</h3>
      <ol className="mt-3 grid gap-3 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li className="flex gap-2.5 text-pretty leading-5" key={item}>
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-primary shadow-sm">{index + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function OperationStep({ active, complete, label }: { active: boolean; complete: boolean; label: string }) {
  const Icon = complete ? Check : active ? LoaderCircle : Circle;
  return (
    <li className={cn("flex items-start gap-2 text-xs leading-5", active ? "font-medium text-primary-900" : complete ? "text-primary-700" : "text-muted-foreground")}>
      <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", active && "animate-spin text-primary motion-reduce:animate-none", !active && !complete && "text-primary-300")} />
      <span>{label}</span>
    </li>
  );
}
