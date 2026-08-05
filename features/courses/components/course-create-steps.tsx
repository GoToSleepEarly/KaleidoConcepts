const steps = ["授课对象", "故事大纲", "教学规划", "文案与练习", "视觉资源", "预览发布"];

export function CourseCreateSteps({ currentStep }: { currentStep: number }) {
  return (
    <div aria-label="课程创建进度" className="overflow-x-auto pb-1">
      <ol className="flex min-w-[720px] items-center gap-2">
        {steps.map((label, index) => {
          const step = index + 1;
          const active = step === currentStep;
          const done = step < currentStep;
          return (
            <li className="flex min-w-0 flex-1 items-center gap-2" key={label}>
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${active ? "bg-primary text-primary-foreground" : done ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"}`}>{step}</span>
              <span className={`truncate text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {step < steps.length ? <span className="h-px flex-1 bg-border" /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
