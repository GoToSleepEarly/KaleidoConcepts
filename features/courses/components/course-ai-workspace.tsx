import React from "react";
import { Check, Circle, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export type AiOperationPresentation = {
  title: string;
  currentStep: number;
  steps: string[];
  target?: string;
  preserveMessage?: string;
};

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

export function AiOperationStatusCard({ elapsedSeconds, persisted, presentation, compact = false, className }: { elapsedSeconds: number; persisted: boolean; presentation: AiOperationPresentation; compact?: boolean; className?: string }) {
  const currentStep = Math.min(Math.max(presentation.currentStep, 0), Math.max(0, presentation.steps.length - 1));
  const guidance = !persisted
    ? "正在提交任务，请保持当前页面打开。"
    : elapsedSeconds < 30
      ? "任务已经提交，本次操作只会执行一次。"
      : elapsedSeconds < 90
        ? "任务仍在正常处理，无需刷新或重复提交。"
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
            <span className="shrink-0 text-xs tabular-nums text-primary-700">{elapsedSeconds > 0 ? `${elapsedSeconds} 秒` : "刚刚开始"}</span>
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

          <p className="mt-3 text-pretty border-t border-primary-200/80 pt-2 text-xs leading-5 text-primary-800">{guidance}</p>
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
