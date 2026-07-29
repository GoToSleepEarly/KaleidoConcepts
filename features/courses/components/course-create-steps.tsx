import React from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

type CreateStep = {
  step: number;
  label: string;
  href?: string;
};

const steps: CreateStep[] = [
  { step: 1, label: "基础信息", href: "basic" },
  { step: 2, label: "AI 教案共创", href: "story-options" },
  { step: 3, label: "标准教案", href: "lesson-draft" },
  { step: 4, label: "资源生成", href: "resources" },
  { step: 5, label: "课程预览", href: "preview" },
] as const;

export function CourseCreateSteps({ currentStep, courseId }: { currentStep: number; courseId?: string }) {
  const current = steps.find((item) => item.step === currentStep) ?? steps[0];
  const next = steps.find((item) => item.step === currentStep + 1);

  return (
    <nav className="rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:px-5 sm:py-4" aria-label="课程创建步骤">
      <details className="group lg:hidden">
        <summary className="flex list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground">
              Step {currentStep} / {steps.length}
            </div>
            <div className="mt-0.5 text-base font-semibold text-foreground">{current.label}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">
              {next ? `下一步：${next.label}` : "当前是最后一步"}
            </div>
          </div>
          <span className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border bg-secondary px-3 text-xs font-semibold text-foreground">
            流程
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
          </span>
        </summary>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(currentStep / steps.length) * 100}%` }} />
        </div>

        <ol className="mt-3 grid gap-2">
          {steps.map((item) => (
            <li key={item.step}>
              <StepContent courseId={courseId} currentStep={currentStep} item={item} mobile />
            </li>
          ))}
        </ol>
      </details>

      <ol className="hidden gap-2 lg:grid lg:grid-cols-5">
        {steps.map((item) => (
          <li key={item.step}>
            <StepContent courseId={courseId} currentStep={currentStep} item={item} />
          </li>
        ))}
      </ol>
    </nav>
  );
}

function StepContent({
  courseId,
  currentStep,
  item,
  mobile = false,
}: {
  courseId?: string;
  currentStep: number;
  item: CreateStep;
  mobile?: boolean;
}) {
  const isCurrent = item.step === currentStep;
  const isDone = item.step < currentStep;
  const canLink = Boolean(courseId && item.href && item.step <= currentStep);
  const content = (
    <span
      aria-current={isCurrent ? "step" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg text-left transition-all duration-200 ease-out-expo",
        mobile ? "min-h-12 px-3 py-2" : "min-h-[52px] px-3 py-2",
        isCurrent && "bg-primary-50 text-primary",
        isDone && "text-foreground hover:bg-secondary",
        !isCurrent && !isDone && "text-muted-foreground",
        canLink && "cursor-pointer",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-200",
          mobile ? "size-7" : "size-7",
          isCurrent && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10",
          isDone && "border-success bg-success text-success-foreground",
          !isCurrent && !isDone && "border-border bg-secondary text-muted-foreground",
        )}
      >
        {isDone ? <Check className="size-3.5" /> : item.step}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium opacity-80">Step {item.step}</span>
        <span className="block truncate text-sm font-semibold">{item.label}</span>
      </span>
    </span>
  );

  return canLink ? <Link href={`/courses/${courseId}/create/${item.href}`}>{content}</Link> : content;
}
