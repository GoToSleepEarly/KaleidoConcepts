"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, Check, Loader2, Route, Save, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CourseCreateSteps } from "@/features/courses/components/course-create-steps";
import type { StoryOption, StoryTeachingDesign } from "@/lib/api-contract";
import { cn } from "@/lib/utils";

type LoadResponse = {
  options: StoryOption[];
  selectedOptionId: string | null;
};

const teachingFields: Array<{ key: keyof StoryTeachingDesign; label: string }> = [
  { key: "grammarIntegration", label: "语法融入" },
  { key: "studentFit", label: "学生适配" },
  { key: "teacherGuidance", label: "老师引导" },
  { key: "difficultyFit", label: "难度适配" },
];

const generationSteps = ["分析课程信息", "构思故事角度", "组织章节结构", "校验 JSON 输出"];

export function StoryOptionsManager({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<StoryOption[]>([]);
  const [activeOptionId, setActiveOptionId] = useState("");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [selectingId, setSelectingId] = useState("");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const isLocked = Boolean(selectedOptionId);
  const activeOption = options.find((option) => option.id === activeOptionId) ?? options[0] ?? null;
  const activeOptionIndex = activeOption ? options.findIndex((option) => option.id === activeOption.id) : -1;
  const activeGenerationStep = generationSteps[Math.min(generationSteps.length - 1, Math.floor(progress / 25))];

  useEffect(() => {
    if (!isGenerating) {
      return;
    }

    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (current >= 92) {
          return current;
        }

        return Math.min(92, current + (current < 55 ? 9 : 4));
      });
    }, 900);

    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    let isActive = true;

    async function loadOptions() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/courses/${courseId}/story-options`);

        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { message?: string } | null;
          throw new Error(data?.message ?? "故事方案加载失败");
        }

        const data = (await response.json()) as LoadResponse;

        if (isActive) {
          setOptions(data.options);
          setSelectedOptionId(data.selectedOptionId);
          setActiveOptionId(data.selectedOptionId ?? data.options[0]?.id ?? "");
        }
      } catch (loadError) {
        if (isActive) {
          setError(loadError instanceof Error ? loadError.message : "故事方案加载失败");
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isActive = false;
    };
  }, [courseId]);

  async function generateOptions() {
    setProgress(8);
    setIsGenerating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案生成失败");
      }

      const data = (await response.json()) as { options: StoryOption[] };
      setProgress(100);
      setOptions(data.options);
      setActiveOptionId(data.options[0]?.id ?? "");
      setMessage("已生成 3 个故事方案。");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "故事方案生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  async function saveOptions() {
    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ options }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案保存失败");
      }

      const data = (await response.json()) as LoadResponse;
      setOptions(data.options);
      setSelectedOptionId(data.selectedOptionId);
      setActiveOptionId((current) => data.options.find((option) => option.id === current)?.id ?? data.selectedOptionId ?? data.options[0]?.id ?? "");
      setMessage("故事方案已保存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "故事方案保存失败");
    } finally {
      setIsSaving(false);
    }
  }

  async function selectOption(optionId: string) {
    setSelectingId(optionId);
    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/courses/${courseId}/story-options/${optionId}/select`, {
        method: "POST",
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "故事方案选择失败");
      }

      const data = (await response.json()) as { selectedOptionId: string };
      setSelectedOptionId(data.selectedOptionId);
      router.push(`/courses/${courseId}/create/lesson-draft`);
    } catch (selectError) {
      setError(selectError instanceof Error ? selectError.message : "故事方案选择失败");
    } finally {
      setSelectingId("");
    }
  }

  function updateOption(optionId: string, patch: Partial<StoryOption>) {
    setOptions((current) => current.map((option) => (option.id === optionId ? { ...option, ...patch } : option)));
  }

  function updateChapter(optionId: string, chapterIndex: number, patch: Partial<StoryOption["chapters"][number]>) {
    setOptions((current) =>
      current.map((option) =>
        option.id === optionId
          ? {
              ...option,
              chapters: option.chapters.map((chapter, index) => (index === chapterIndex ? { ...chapter, ...patch } : chapter)),
            }
          : option,
      ),
    );
  }

  function updateTeaching(optionId: string, key: keyof StoryTeachingDesign, value: string) {
    setOptions((current) =>
      current.map((option) =>
        option.id === optionId
          ? {
              ...option,
              teachingDesign: {
                ...option.teachingDesign,
                [key]: value,
              },
            }
          : option,
      ),
    );
  }

  if (isLoading) {
    return <LoadingPanel label="正在加载故事方案..." progress={72} />;
  }

  return (
    <div className="space-y-6">
      <CourseCreateSteps courseId={courseId} currentStep={2} />

      <div className="flex items-start justify-between gap-6">
        <div>
          <Button asChild className="mb-4 h-9 px-3 text-sm" variant="outline">
            <Link href={`/courses/${courseId}/create/basic`}>
              <ArrowLeft className="size-4" />
              返回基础信息
            </Link>
          </Button>
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">故事方案</h2>
          <p className="mt-2 text-sm text-slate-500">选择一个大纲后进入课文编辑。</p>
        </div>
        {options.length > 0 && !isLocked ? (
          <Button className="bg-violet-600 text-white hover:bg-violet-700" disabled={isSaving} onClick={saveOptions} type="button">
            {isSaving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存修改
          </Button>
        ) : null}
      </div>

      {error ? <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div> : null}
      {message ? <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}

      {options.length === 0 ? (
        isGenerating ? (
          <GenerationPanel progress={progress} step={activeGenerationStep} />
        ) : (
          <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
            <h3 className="text-lg font-semibold text-slate-950">生成故事方案</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">系统会基于基础信息生成 3 个可编辑方案。</p>
            <Button className="mt-6 bg-violet-600 text-white hover:bg-violet-700" onClick={generateOptions} type="button">
              <Sparkles className="size-4" />
              生成故事方案
            </Button>
          </section>
        )
      ) : activeOption ? (
        <div className="space-y-4">
          <div className="grid gap-2 rounded-lg border border-[#E5E7EB] bg-white p-2 shadow-sm lg:grid-cols-3">
            {options.map((option, optionIndex) => {
              const isActive = option.id === activeOption.id;
              const isSelected = selectedOptionId === option.id;

              return (
                <button
                  className={cn(
                    "min-h-20 rounded-lg px-4 py-3 text-left transition-colors duration-200",
                    isActive && "bg-violet-50 text-violet-700 ring-1 ring-violet-200",
                    !isActive && "text-slate-600 hover:bg-slate-50",
                  )}
                  key={option.id}
                  onClick={() => setActiveOptionId(option.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold">方案 {optionIndex + 1}</span>
                    {isSelected ? <Check className="size-4 text-violet-700" /> : null}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold">{option.title || "未命名方案"}</div>
                  <div className="mt-1 line-clamp-1 text-xs opacity-80">{option.logline}</div>
                </button>
              );
            })}
          </div>

          <section
            className={cn(
              "grid gap-0 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white shadow-sm xl:grid-cols-[320px_1fr]",
              selectedOptionId === activeOption.id && "border-violet-500 ring-2 ring-violet-100",
            )}
          >
            <aside className="border-b border-[#E5E7EB] bg-slate-50/70 p-5 xl:border-b-0 xl:border-r">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-violet-700">方案 {activeOptionIndex + 1}</p>
              <h3 className="mt-2 text-lg font-semibold leading-7 text-slate-950">{activeOption.title || "未命名方案"}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{activeOption.logline}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <Metric label="章节" value={`${activeOption.chapters.length} 章`} />
                <Metric label="状态" value={selectedOptionId === activeOption.id ? "已选择" : "待选择"} />
              </div>
              <Button
                className="mt-5 w-full bg-violet-600 text-white hover:bg-violet-700"
                disabled={isLocked || selectingId === activeOption.id}
                onClick={() => selectOption(activeOption.id)}
                type="button"
              >
                {selectingId === activeOption.id ? <Loader2 className="size-4 animate-spin" /> : selectedOptionId === activeOption.id ? <Check className="size-4" /> : null}
                {selectedOptionId === activeOption.id ? "已选择" : "选择此方案"}
              </Button>
            </aside>

            <div className="space-y-6 p-5">
              <section>
                <SectionTitle icon={<BookOpen className="size-4" />} title="方案概览" />
                <div className="mt-3 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                  <TextInput disabled={isLocked} label="标题" value={activeOption.title} onChange={(value) => updateOption(activeOption.id, { title: value })} />
                  <TextareaInput
                    disabled={isLocked}
                    label="故事大纲"
                    minRows="min-h-20"
                    value={activeOption.logline}
                    onChange={(value) => updateOption(activeOption.id, { logline: value })}
                  />
                </div>
              </section>

              <section>
                <SectionTitle icon={<Route className="size-4" />} title="故事结构" />
                <div className="mt-3 space-y-3">
                  {activeOption.chapters.map((chapter, chapterIndex) => (
                    <div className="rounded-lg border border-slate-200 bg-white p-4" key={`${activeOption.id}-${chapterIndex}`}>
                      <div className="mb-4 flex items-center gap-3">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-semibold text-violet-700">
                          {chapterIndex + 1}
                        </span>
                        <TextInput
                          disabled={isLocked}
                          label="章节标题"
                          value={chapter.title}
                          onChange={(value) => updateChapter(activeOption.id, chapterIndex, { title: value })}
                        />
                      </div>
                      <TextareaInput
                        disabled={isLocked}
                        label="剧情摘要"
                        minRows="min-h-28"
                        value={chapter.summary}
                        onChange={(value) => updateChapter(activeOption.id, chapterIndex, { summary: value })}
                      />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <SectionTitle icon={<Sparkles className="size-4" />} title="语法与教学设计" />
                <div className="mt-3 space-y-3">
                  {activeOption.chapters.map((chapter, chapterIndex) => (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4" key={`${activeOption.id}-grammar-${chapterIndex}`}>
                      <div className="mb-3 text-sm font-semibold text-slate-700">章节 {chapterIndex + 1} 语法承载</div>
                      <TextareaInput
                        disabled={isLocked}
                        label="语法点设计"
                        minRows="min-h-24"
                        value={chapter.knowledgeHook}
                        onChange={(value) => updateChapter(activeOption.id, chapterIndex, { knowledgeHook: value })}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {teachingFields.map((field) => (
                    <TextareaInput
                      disabled={isLocked}
                      key={field.key}
                      label={field.label}
                      minRows="min-h-28"
                      value={activeOption.teachingDesign[field.key]}
                      onChange={(value) => updateTeaching(activeOption.id, field.key, value)}
                    />
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function LoadingPanel({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="rounded-lg border border-[#E5E7EB] bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="size-4 animate-spin text-violet-700" />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <ProgressBar className="mt-4" progress={progress} />
    </div>
  );
}

function GenerationPanel({ progress, step }: { progress: number; step: string }) {
  return (
    <section className="rounded-lg border border-[#E5E7EB] bg-white p-8 shadow-sm">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-violet-700">AI 正在生成</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">{step}</h3>
          </div>
          <div className="flex size-11 items-center justify-center rounded-full bg-violet-50 text-violet-700">
            <Sparkles className="size-5" />
          </div>
        </div>
        <ProgressBar className="mt-6" progress={progress} />
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {generationSteps.map((item) => {
            const isActive = item === step;
            const isDone = generationSteps.indexOf(item) < generationSteps.indexOf(step);

            return (
              <div
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs font-medium",
                  isActive && "border-violet-200 bg-violet-50 text-violet-700",
                  isDone && "border-emerald-200 bg-emerald-50 text-emerald-700",
                  !isActive && !isDone && "border-slate-200 bg-slate-50 text-slate-500",
                )}
                key={item}
              >
                {item}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ProgressBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-violet-600 transition-all duration-700 ease-out" style={{ width: `${progress}%` }} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SectionTitle({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      <span className="flex size-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      {title}
    </div>
  );
}

function TextInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-[#E5E7EB] px-3 text-sm outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-500"
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}

function TextareaInput({
  label,
  value,
  onChange,
  disabled,
  minRows = "min-h-24",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  minRows?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-700">{label}</span>
      <textarea
        className={cn(
          "w-full resize-none rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-6 outline-none transition duration-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50 disabled:text-slate-500",
          minRows,
        )}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </label>
  );
}
