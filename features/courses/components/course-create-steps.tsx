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
  { step: 2, label: "故事方案", href: "story-options" },
  { step: 3, label: "课文编辑", href: "lesson-draft" },
  { step: 4, label: "资源生成", href: "resources" },
  { step: 5, label: "课程预览", href: "preview" },
] as const;

export function CourseCreateSteps({ currentStep, courseId }: { currentStep: number; courseId?: string }) {
  return (
    <nav className="rounded-lg border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm" aria-label="课程创建步骤">
      <ol className="grid gap-3 lg:grid-cols-5">
        {steps.map((item) => {
          const isCurrent = item.step === currentStep;
          const isDone = item.step < currentStep;
          const canLink = Boolean(courseId && item.href && item.step <= currentStep);
          const content = (
            <span
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-200",
                isCurrent && "bg-violet-50 text-violet-700",
                isDone && "text-slate-700",
                !isCurrent && !isDone && "text-slate-400",
                canLink && "hover:bg-slate-50",
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  isCurrent && "border-violet-600 bg-violet-600 text-white",
                  isDone && "border-emerald-500 bg-emerald-50 text-emerald-600",
                  !isCurrent && !isDone && "border-slate-200 bg-slate-50 text-slate-400",
                )}
              >
                {isDone ? <Check className="size-3.5" /> : item.step}
              </span>
              <span>
                <span className="block text-xs font-medium">Step {item.step}</span>
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
