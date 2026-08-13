import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import type { CourseStage } from "@/lib/contracts/api";

const steps = [
  { label: "基础信息", path: "audience" },
  { label: "故事大纲", path: "story-outline" },
  { label: "教学规划", path: "teaching-plan" },
  { label: "文案与练习", path: "content" },
  { label: "视觉资源", path: "visual-resources" },
  { label: "预览发布", path: "preview" },
];

const stageSteps: Record<CourseStage, number> = { audience: 1, story_outline: 2, teaching_plan: 3, content: 4, visual_resources: 5, preview: 6 };

export function courseStageStep(stage: CourseStage) {
  return stageSteps[stage];
}

function subscribeToProgressSlot(onStoreChange: () => void) {
  void onStoreChange;
  return () => undefined;
}

function getProgressSlot() {
  return document.getElementById("course-create-progress-slot");
}

function getServerProgressSlot() {
  return null;
}

export function CourseCreateSteps({ currentStep, courseId, furthestStep = currentStep, onNavigate }: { currentStep: number; courseId?: string; furthestStep?: number; onNavigate?: (href: string) => void }) {
  const portalTarget = useSyncExternalStore(subscribeToProgressSlot, getProgressSlot, getServerProgressSlot);
  const reachedStep = Math.max(currentStep, furthestStep);

  const progress = (
    <section aria-label="课程创建进度" className="mx-auto w-full max-w-3xl px-1 sm:px-2">
      <div className="rounded-lg border border-primary-100 bg-primary-50/70 p-1" data-testid="course-stepper-flow-band">
        <ol className="grid grid-cols-6 gap-1">
          {steps.map((label, index) => {
            const step = index + 1;
            const active = step === currentStep;
            const done = step !== currentStep && step <= reachedStep;
            const nodeClass = `group flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-md px-1 text-center text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 xl:text-[13px] ${active ? "bg-primary text-white shadow-sm" : done && courseId ? "cursor-pointer bg-white text-foreground shadow-sm hover:bg-primary-100 hover:text-primary-800 active:translate-y-px" : "cursor-default text-slate-400"}`;
            const dotClass = `hidden size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold xl:flex ${active ? "bg-white/20 text-white" : done && courseId ? "bg-primary-50 text-primary" : "bg-white/70 text-slate-400"}`;
            const labelClass = "min-w-0 whitespace-nowrap";
            const content = (
              <>
                <span className={dotClass}>{step}</span>
                <span className={labelClass}>{label.label}</span>
              </>
            );

            return (
              <li className="min-w-0" key={label.path}>
                {done && courseId ? (
                  <Link aria-label={label.label} className={nodeClass} href={`/courses/${courseId}/create/${label.path}`} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute("href") ?? event.currentTarget.href); } : undefined}>
                    {content}
                  </Link>
                ) : (
                  <span aria-current={active ? "step" : undefined} aria-disabled={!active && !done ? "true" : undefined} aria-label={label.label} className={nodeClass}>
                    {content}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );

  return portalTarget ? createPortal(progress, portalTarget) : progress;
}
