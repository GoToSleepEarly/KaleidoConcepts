import React from "react";
import Link from "next/link";
import { Check } from "lucide-react";

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
  return (
    <nav className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm" aria-label="课程创建步骤">
      <ol className="grid gap-2 lg:grid-cols-5">
        {steps.map((item) => {
          const isCurrent = item.step === currentStep;
          const isDone = item.step < currentStep;
          const canLink = Boolean(courseId && item.href && item.step <= currentStep);
          const content = (
            <span
              className={cn(
                "flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 text-left transition-all duration-200 ease-out-expo",
                isCurrent && "bg-primary-50 text-primary",
                isDone && "text-foreground hover:bg-secondary",
                !isCurrent && !isDone && "text-muted-foreground",
                canLink && "cursor-pointer",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-200",
                  isCurrent && "border-primary bg-primary text-primary-foreground ring-4 ring-primary/10",
                  isDone && "border-success bg-success text-success-foreground",
                  !isCurrent && !isDone && "border-border bg-secondary text-muted-foreground",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : item.step}
              </span>
              <span>
                <span className="block text-xs font-medium opacity-80">Step {item.step}</span>
                <span className="block text-sm font-semibold">{item.label}</span>
              </span>
            </span>
          );

          return (
            <li key={item.step}>
              {canLink ? <Link href={`/courses/${courseId}/create/${item.href}`}>{content}</Link> : content}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
