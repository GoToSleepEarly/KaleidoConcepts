import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { CourseStage } from "@/lib/contracts/api";
import { cn } from "@/lib/utils";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobilePopoverRef = useRef<HTMLDivElement>(null);
  const reachedStep = Math.max(currentStep, furthestStep);
  const current = steps[currentStep - 1] ?? steps[0];

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnOutsidePress(event: MouseEvent) {
      if (event.target instanceof Node && !mobilePopoverRef.current?.contains(event.target)) setMobileOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsidePress);
    return () => document.removeEventListener("mousedown", closeOnOutsidePress);
  }, [mobileOpen]);

  function stepHref(path: string) {
    return `/courses/${courseId}/create/${path}`;
  }

  function handleGuardedNavigation(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (!onNavigate) return;
    event.preventDefault();
    setMobileOpen(false);
    onNavigate(href);
  }

  const progress = (
    <section aria-label="课程创建进度" className="mx-auto w-full max-w-3xl px-1 sm:px-2">
      <div className="relative rounded-lg border border-primary-100 bg-primary-50/70 p-1" data-testid="course-stepper-flow-band" ref={mobilePopoverRef}>
        <button
          aria-expanded={mobileOpen}
          aria-label="展开课程步骤导航"
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md bg-white px-3 text-left shadow-sm lg:hidden"
          onClick={() => setMobileOpen((value) => !value)}
          type="button"
        >
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-primary">第 {currentStep} / {steps.length} 步</span>
            <span className="block truncate text-sm font-semibold text-foreground">{current.label}</span>
          </span>
          <ChevronDown className={cn("size-5 shrink-0 text-muted-foreground transition-transform", mobileOpen && "rotate-180")} />
        </button>

        {mobileOpen ? (
          <ol aria-label="移动端课程步骤列表" className="absolute inset-x-0 top-full z-dropdown mt-2 grid gap-1 rounded-lg border border-border bg-white p-1 shadow-xl lg:hidden">
            {steps.map((label, index) => {
              const step = index + 1;
              const active = step === currentStep;
              const done = step !== currentStep && step <= reachedStep;
              const baseClass = cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-sm font-semibold",
                active ? "bg-primary text-white" : done && courseId ? "bg-white text-foreground active:bg-primary-50" : "text-slate-400",
              );
              const content = (
                <>
                  <span className="flex items-center gap-2">
                    <span className={cn("flex size-6 items-center justify-center rounded-full text-xs font-bold", active ? "bg-white/20 text-white" : done && courseId ? "bg-primary-50 text-primary" : "bg-white/70 text-slate-400")}>{step}</span>
                    <span>{label.label}</span>
                  </span>
                  {active ? <span className="text-xs font-medium text-white/80">当前</span> : null}
                </>
              );

              return (
                <li key={label.path}>
                  {done && courseId ? (
                    <Link aria-label={label.label} className={baseClass} href={stepHref(label.path)} onClick={(event) => handleGuardedNavigation(event, stepHref(label.path))}>
                      {content}
                    </Link>
                  ) : (
                    <span aria-current={active ? "step" : undefined} aria-disabled={!active && !done ? "true" : undefined} aria-label={label.label} className={baseClass}>
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : null}

        <ol className="hidden grid-cols-6 gap-1 lg:grid">
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
                  <Link aria-label={label.label} className={nodeClass} href={stepHref(label.path)} onClick={onNavigate ? (event) => { event.preventDefault(); onNavigate(event.currentTarget.getAttribute("href") ?? event.currentTarget.href); } : undefined}>
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
