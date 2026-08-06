import React from "react";
import Link from "next/link";

const steps = [
  { label: "基础信息", path: "audience" },
  { label: "故事大纲", path: "story-outline" },
  { label: "教学规划", path: "teaching-plan" },
  { label: "文案与练习", path: "content" },
  { label: "视觉资源", path: "visual-resources" },
  { label: "预览发布", path: "preview" },
];

export function CourseCreateSteps({ currentStep, courseId }: { currentStep: number; courseId?: string }) {
  const completedProgress = steps.length > 1 ? Math.max(0, Math.min(100, ((currentStep - 1) / (steps.length - 1)) * 100)) : 0;

  return (
    <section aria-label="课程创建进度" className="rounded-xl border border-primary-100 bg-gradient-to-b from-card to-primary-50/40 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="relative" data-testid="course-stepper-flow-band">
        <span aria-hidden className="absolute left-[8.333%] right-[8.333%] top-3.5 h-px bg-primary-100" />
        <span aria-hidden className="absolute left-[8.333%] top-3.5 h-px bg-primary transition-[width] duration-200 ease-out-expo" style={{ width: `calc(${completedProgress}% * 0.833333)` }} />
        <ol className="relative grid grid-cols-6">
          {steps.map((label, index) => {
            const step = index + 1;
            const active = step === currentStep;
            const done = step < currentStep;
            const nodeClass = `group relative z-10 flex min-w-0 flex-col items-center gap-2 text-center text-[11px] font-medium transition-colors ${active ? "text-primary-700" : done ? "text-foreground" : "text-muted-foreground/70"}`;
            const dotClass = `flex size-7 items-center justify-center rounded-full border-2 bg-card text-[11px] font-semibold transition-colors ${active ? "border-primary text-primary shadow-[0_0_0_5px_rgba(37,99,235,0.08)]" : done ? "border-primary bg-primary text-primary-foreground" : "border-primary-100 text-muted-foreground"}`;
            const labelClass = `max-w-[5.5rem] truncate rounded-full px-1.5 py-0.5 ${active ? "bg-card/70" : done && courseId ? "group-hover:bg-card/70" : ""}`;
            const content = (
              <>
                <span className={dotClass}>{step}</span>
                <span className={labelClass}>{label.label}</span>
              </>
            );

            return (
              <li className="min-w-0" key={label.path}>
                {done && courseId ? (
                  <Link aria-label={label.label} className={nodeClass} href={`/courses/${courseId}/create/${label.path}`}>
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
}
