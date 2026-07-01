"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Bold,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Italic,
  List,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Underline,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { mockCourse, mockStoryPlans, mockStudents } from "@/lib/mock-course-data";
import { cn } from "@/lib/utils";

const steps = ["填写学生信息", "选择故事方案", "课文内容编辑", "生成资源中"];

export function CourseCreationFlow() {
  const [step, setStep] = useState(1);
  const selectedPlan = mockStoryPlans[0];

  return (
    <div className="min-h-dvh bg-white">
      <div
        className={cn(
          "mx-auto min-h-dvh max-w-[1480px]",
          step === 1 && "grid grid-cols-1 xl:grid-cols-[1fr_360px]",
        )}
      >
        <section className="px-8 py-8">
          <StepHeader step={step} title={steps[step - 1]} />
          {step === 1 ? <StepOne onNext={() => setStep(2)} /> : null}
          {step === 2 ? <StepTwo selectedId={selectedPlan.id} onNext={() => setStep(3)} /> : null}
          {step === 3 ? <StepThree onBack={() => setStep(2)} onNext={() => setStep(4)} /> : null}
          {step === 4 ? <StepFour /> : null}
        </section>
        {step === 1 ? <aside className="hidden border-l border-slate-200 bg-white xl:block">
          <div className="sticky top-0 h-dvh overflow-hidden">
            <div className="h-full bg-[url('/mock-assets/plant-kingdom.png')] bg-cover bg-center opacity-90" />
          </div>
        </aside> : null}
      </div>
    </div>
  );
}

function StepHeader({ step, title }: { step: number; title: string }) {
  return (
    <header className="mb-8 flex items-start justify-between">
      <div>
        <h1 className="text-balance text-2xl font-bold text-slate-950">
          Step {step} / 5 <span className="ml-4">{title}</span>
        </h1>
        <p className="mt-4 text-pretty text-sm text-slate-500">{stepCopy[step]}</p>
      </div>
      {step > 1 && step < 4 ? (
        <Button type="button" variant="outline">
          <RefreshCw className="size-4" />
          重新生成
        </Button>
      ) : null}
    </header>
  );
}

const stepCopy: Record<number, string> = {
  1: "完善学生信息，帮助 AI 生成更合适的故事和课件内容",
  2: "我们为学生生成了 3 个绘本故事方案，请选择一个您喜欢的方向",
  3: "AI 已为学生生成课文内容，请编辑确认和调整",
  4: "正在为您生成结构化内容和精美插图，请稍候...",
};

function StepOne({ onNext }: { onNext: () => void }) {
  return (
    <div className="max-w-[640px] rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-sm font-bold">学生基本信息</h2>
      <FormRow label="学生（多选）">
        <div className="flex flex-wrap gap-2">
          {mockStudents.map((student) => (
            <span className="inline-flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm" key={student.id}>
              <span className="size-5 rounded-full bg-[url('/mock-assets/rabbit-forest.png')] bg-cover bg-center" />
              {student.name}
              <span className="text-slate-400">x</span>
            </span>
          ))}
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-violet-200 px-3 text-sm text-violet-700" type="button">
            <Plus className="size-3" /> 添加
          </button>
        </div>
      </FormRow>
      <FormRow label="年龄">
        <input className="h-9 w-32 rounded-md border border-slate-200 px-3 text-sm" defaultValue="8" />
      </FormRow>
      <FormRow label="英语等级">
        <SelectLike value="A1" />
      </FormRow>
      <FormRow label="Grammar（最多3个）">
        <div className="flex flex-wrap gap-2">
          {["Past Simple", "Future Simple"].map((item) => (
            <span className="rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-sm text-violet-700" key={item}>
              {item} x
            </span>
          ))}
          <button className="rounded-md border border-slate-200 px-3 py-1 text-sm" type="button">+ Add</button>
        </div>
      </FormRow>
      <FormRow label="课时">
        <Segmented options={["30 min", "45 min", "60 min"]} selected="45 min" />
      </FormRow>
      <FormRow label="主题">
        <SelectLike value="Plants / Nature" />
      </FormRow>
      <FormRow label="故事想法（可选）">
        <textarea
          className="h-24 w-full rounded-md border border-slate-200 p-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-violet-500"
          defaultValue="Summer becomes tiny and enters a magical plant kingdom..."
        />
      </FormRow>
      <Button className="mt-6 h-12 w-full bg-violet-600 text-white hover:bg-violet-700" onClick={onNext} type="button">
        生成故事大纲
      </Button>
    </div>
  );
}

function StepTwo({ selectedId, onNext }: { selectedId: string; onNext: () => void }) {
  return (
    <div className="space-y-5">
      <div className="grid max-w-5xl gap-5 md:grid-cols-3">
        {mockStoryPlans.map((plan) => (
          <article
            className={cn(
              "overflow-hidden rounded-xl border bg-white shadow-sm",
              plan.id === selectedId && "border-violet-500 ring-2 ring-violet-100",
            )}
            key={plan.id}
          >
            <div className="aspect-[16/9] bg-cover bg-center" style={{ backgroundImage: `url(${plan.imageUrl})` }} />
            <div className="space-y-4 p-5">
              <h2 className="text-base font-bold">{plan.title}</h2>
              <p className="text-pretty text-sm leading-6 text-slate-600">{plan.summary}</p>
              <div>
                <div className="mb-2 text-xs font-bold text-slate-700">章节预览：</div>
                <ul className="space-y-1 text-sm text-slate-600">
                  {plan.chapters.map((chapter, index) => (
                    <li key={chapter}>Chapter {index + 1}：{chapter}</li>
                  ))}
                </ul>
              </div>
              <Button className={cn("w-full", accentButton[plan.accent])} onClick={onNext} type="button">
                选择此方案
              </Button>
            </div>
          </article>
        ))}
      </div>
      <Button className="w-48" type="button" variant="outline">
        <RefreshCw className="size-4" />
        重新生成方案
      </Button>
    </div>
  );
}

const accentButton = {
  green: "bg-emerald-600 hover:bg-emerald-700",
  blue: "bg-blue-600 hover:bg-blue-700",
  violet: "bg-violet-600 hover:bg-violet-700",
};

function StepThree({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="grid max-w-6xl gap-6 xl:grid-cols-[1fr_260px]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex h-12 items-center justify-between border-b border-slate-200 px-4">
          <div className="flex items-center gap-4 text-slate-500">
            <RotateCcw className="size-4" />
            <RefreshCw className="size-4" />
            <Bold className="size-4" />
            <Italic className="size-4" />
            <Underline className="size-4" />
            <List className="size-4" />
            <ImageIcon className="size-4" />
          </div>
          <span className="text-xs text-slate-500">3892 字</span>
        </div>
        <article className="min-h-[520px] px-8 py-7 leading-8">
          <h2 className="mb-5 text-2xl font-bold">The Brave Little Rabbit</h2>
          <h3 className="mb-2 font-bold">Introduction</h3>
          <p className="mb-6 text-sm leading-7 text-slate-700">
            Once upon a time, in a beautiful forest, there lived a little rabbit named Rosie. Rosie was kind and helpful, but she was also very scared of many things.
          </p>
          <h3 className="mb-2 font-bold">Section 1: The Problem</h3>
          <p className="mb-6 text-sm leading-7 text-slate-700">
            One day, Rosie's friend, a little bird, came to her. “Rosie, my nest is in the big tree, but I can't get there. I'm too scared to fly!”
          </p>
          <h3 className="mb-2 font-bold">Section 2: The Decision</h3>
          <p className="text-sm leading-7 text-slate-700">Rosie took a deep breath and said, “I will try to help you, even if I'm scared.”</p>
        </article>
      </section>
      <aside className="rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
        <h3 className="mb-4 font-bold">课程信息（只读）</h3>
        <InfoList />
      </aside>
      <div className="xl:col-span-2 flex items-center justify-between">
        <button className="text-sm text-emerald-600" type="button">自动保存成功 14:30:25</button>
        <div className="flex gap-4">
          <Button onClick={onBack} type="button" variant="outline">返回上一步</Button>
          <Button className="w-64 bg-violet-600 hover:bg-violet-700" onClick={onNext} type="button">
            确认文稿并生成资源
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepFour() {
  return (
    <div className="grid max-w-5xl gap-10 xl:grid-cols-[1fr_360px]">
      <section className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="mb-6 text-lg font-bold">正在生成课件，请稍候...</h2>
        <div className="space-y-5 text-sm">
          <ProgressItem done label="文稿确认完成" />
          <ProgressItem active label={`生成章节插图（${mockCourse.progress.generatedImages} / ${mockCourse.progress.totalImages}）`} />
          <div className="h-2 rounded-full bg-slate-100">
            <div className="h-2 w-1/2 rounded-full bg-violet-600" />
          </div>
          <ProgressItem label="生成 HTML 课件" />
          <ProgressItem label="生成 PDF" />
        </div>
        <div className="mt-8 flex gap-4">
          {mockCourse.images.slice(0, 4).map((image) => (
            <div className="size-24 rounded-lg bg-cover bg-center" key={image.id} style={{ backgroundImage: `url(${image.url})` }} />
          ))}
          <div className="flex size-24 items-center justify-center rounded-lg border border-slate-200 text-xl text-slate-500">...</div>
        </div>
        <Button asChild className="mt-8 bg-violet-600 hover:bg-violet-700">
          <Link href="/courses/123">查看课程预览</Link>
        </Button>
      </section>
      <aside className="rounded-xl border border-violet-100 bg-violet-50/60 p-6">
        <div className="mb-3 text-violet-700">💡 小贴士</div>
        <p className="text-sm leading-7 text-slate-600">生成约需 30-60 秒，生成完成后您可以预览并导出学生版 PDF。</p>
        <div className="mt-6 size-28 rounded-full bg-[url('/mock-assets/rabbit-forest.png')] bg-cover bg-center" />
      </aside>
    </div>
  );
}

function ProgressItem({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-5 items-center justify-center rounded-full border",
            done && "border-emerald-500 bg-emerald-50 text-emerald-600",
            active && "border-violet-600 bg-violet-50 text-violet-600",
          )}
        >
          {done ? <Check className="size-3" /> : active ? <Loader2 className="size-3" /> : null}
        </span>
        <span>{label}</span>
      </div>
      <span className={cn("text-slate-400", done && "text-emerald-600")}>{done ? "已完成" : active ? "生成中" : "等待中"}</span>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-5 grid gap-3 text-sm md:grid-cols-[132px_1fr]">
      <span className="pt-2 font-medium text-slate-700">{label}</span>
      <span>{children}</span>
    </label>
  );
}

function SelectLike({ value }: { value: string }) {
  return (
    <button className="inline-flex h-9 min-w-40 items-center justify-between rounded-md border border-slate-200 px-3 text-sm" type="button">
      {value}
      <ChevronDown className="size-4 text-slate-400" />
    </button>
  );
}

function Segmented({ options, selected }: { options: string[]; selected: string }) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option) => (
        <button className="inline-flex items-center gap-2 text-sm" key={option} type="button">
          <span className={cn("size-4 rounded-full border", option === selected && "border-violet-600 bg-violet-600 ring-2 ring-violet-100")} />
          {option}
        </button>
      ))}
    </div>
  );
}

function InfoList() {
  return (
    <dl className="space-y-3 text-slate-600">
      <div><dt className="font-semibold text-slate-900">英语等级</dt><dd>A1</dd></div>
      <div><dt className="font-semibold text-slate-900">Grammar</dt><dd>Past Simple / Future Simple</dd></div>
      <div><dt className="font-semibold text-slate-900">课时</dt><dd>45 min</dd></div>
      <div><dt className="font-semibold text-slate-900">主题</dt><dd>Plants / Nature</dd></div>
      <div><dt className="font-semibold text-slate-900">学生</dt><dd>Summer / Tom / Lucy</dd></div>
    </dl>
  );
}
